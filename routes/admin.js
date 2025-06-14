// Скрипт маршрутов страницы панели администрирования

const express = require('express');
const router = express.Router();
const db = require('../models/db'); // подключение к sqlite
const checkAdmin = require('../models/checkAdmin');
const { deleteFileIfExists} = require('../public/fileHandling');
const { createUser, findUserByEmail } = require('../models/userModel');
const { promisify } = require('util');
const dbRun = promisify(db.run.bind(db));
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));

// Отображение админ-панели с данными пользователей, проектов, логов и статистикой
router.get('/', checkAdmin, async (req, res) => {
    const { user_id, action_type, date_from, date_to } = req.query;
    const token = req.csrfToken();

    const users = await dbAll('SELECT * FROM users');
    const admins = await dbAll("SELECT id, name, avatar FROM users WHERE role = '2'");
    const projects = await dbAll('SELECT * FROM projects');
    const totalUsers = await dbGet('SELECT COUNT(*) as count FROM users');
    const totalProjects = await dbGet('SELECT COUNT(*) as count FROM projects');
    const recentUsers = await dbAll('SELECT name, created_at FROM users ORDER BY created_at DESC LIMIT 5');
    const todos = await dbAll('SELECT * FROM todos ORDER BY position ASC');
    const todoAdminLinks = await dbAll('SELECT * FROM todo_admins');
    const messages = await dbAll(`
        SELECT admin_chat_messages.*, users.name as username, users.cover as avatar
        FROM admin_chat_messages
        JOIN users ON users.id = admin_chat_messages.user_id
        ORDER BY admin_chat_messages.created_at ASC
    `);

    const todoAdminsMap = {};
    todoAdminLinks.forEach(link => {
        if (!todoAdminsMap[link.todo_id]) {
            todoAdminsMap[link.todo_id] = [];
        }
        todoAdminsMap[link.todo_id].push(link.user_id);
    });

    const adminTodoMap = {};
    todoAdminLinks.forEach(link => {
        if (!adminTodoMap[link.user_id]) adminTodoMap[link.user_id] = [];
        const todo = todos.find(t => t.id === link.todo_id);
        if (todo) adminTodoMap[link.user_id].push(todo);
    });

    let query = `
        SELECT logs.*, users.name as username 
        FROM logs 
        LEFT JOIN users ON logs.user_id = users.id
        WHERE true
    `;
    const params = [];

    if (user_id) {
        query += ' AND logs.user_id = ?';
        params.push(user_id);
    }

    if (action_type) {
        query += ' AND logs.action LIKE ?';
        params.push(`%${action_type}%`);
    }

    if (date_from) {
        query += ' AND DATE(logs.timestamp) >= DATE(?)';
        params.push(date_from);
    }

    if (date_to) {
        query += ' AND DATE(logs.timestamp) <= DATE(?)';
        params.push(date_to);
    }

    query += ' ORDER BY logs.timestamp DESC LIMIT 100';

    const logs = await dbAll(query, params);

    res.render('admin', {
        users,
        admins,
        projects,
        csrfToken: token,
        stats: {
            totalUsers: totalUsers.count,
            totalProjects: totalProjects.count,
            recentUsers
        },
        logs,
        todos,
        todoAdminsMap,
        adminTodoMap,
        currentUser: req.session.user,
        messages,
        query: req.query,
        created: req.query.created === 'true'
    });
});

async function logAction(userId, action) {
    await dbRun('INSERT INTO logs (user_id, action) VALUES (?, ?)', [userId, action]);
}

// Обновление информации пользователя
router.post('/user/update/:id', checkAdmin, async (req, res) => {
    const { name, bio, role, hidden } = req.body;
    const userId = req.params.id;
    const oldUser = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
    const isHidden = hidden === '1' ? 1 : 0;

    await dbRun('UPDATE users SET name = ?, bio = ?, role = ?, hidden = ? WHERE id = ?', [name, bio, role, isHidden, userId]);

    await logAction(req.session.user.id, `Updated user: ${oldUser.name} (ID: ${userId}) → name: ${oldUser.name} → ${name}, role: ${oldUser.role} → ${role}, hidden: ${oldUser.hidden} → ${isHidden}`);
    res.redirect('/admin');
});

// Создание нового пользователя админом
router.post('/user/create', checkAdmin, async (req, res) => {
    const { name, email, password } = req.body;

    try {
        if (await findUserByEmail(email)) {
            await logAction(req.session.user.id, `Attempted to create user with existing email: ${email}`);
            return res.redirect('/admin?created=false');
        }

        await createUser(name, email, password);
        await logAction(req.session.user.id, `Created user: ${name}, ${email}`);
        res.redirect('/admin?created=true');
    } catch (err) {
        console.error('Ошибка при создании пользователя:', err);
        await logAction(req.session.user.id, `Failed to create user ${name}, ${email} — ${err.message}`);
        res.redirect('/admin?created=false');
    }
});

// Удаление пользователя + его проектов + картинки из Uploads
router.post('/user/delete/:id', checkAdmin, async (req, res) => {
    const userId = req.params.id;

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.redirect('/admin');

        if (user.avatar) deleteFileIfExists(user.avatar);
        if (user.cover) deleteFileIfExists(user.cover);

        db.all('SELECT * FROM projects WHERE user_id = ?', [userId], (err, projects) => {
            if (!err && projects) {
                projects.forEach(project => {
                    if (project.cover) deleteFileIfExists(project.cover);

                    let parsedLayout;
                    try {
                        let layoutRaw = project.layout;
                        if (typeof layoutRaw === 'string') {
                            parsedLayout = JSON.parse(layoutRaw);
                            if (typeof parsedLayout === 'string') {
                                parsedLayout = JSON.parse(parsedLayout);
                            }
                        } else {
                            parsedLayout = layoutRaw;
                        }

                        if (parsedLayout?.elements && Array.isArray(parsedLayout.elements)) {
                            parsedLayout.elements.forEach(el => {
                                if (el.tag === 'img' && typeof el.src === 'string' && el.src.includes('/uploads/')) {
                                    const match = el.src.match(/\/uploads\/[^"' ]+/);
                                    if (match && match[0]) {
                                        deleteFileIfExists(match[0]);
                                    }
                                }
                            });
                        }

                    } catch (e) {
                        console.error(`Ошибка при парсинге layout проекта ${project.id}:`, e.message);
                    }
                });
            }

            db.run('DELETE FROM projects WHERE user_id = ?', [userId], async () => {
                await logAction(req.session.user.id, `Deleted user: ${user.name}, ${user.email} (ID: ${userId}) with ${projects?.length || 0} projects`);
                db.run('DELETE FROM users WHERE id = ?', [userId], () => {
                    res.redirect('/admin');
                });
            });
        });
    });
});

// Обновление информации того или иного проекта
router.post('/project/update/:id', checkAdmin, async (req, res) => {
    const { title, description } = req.body;
    const projectId = req.params.id;

    const oldProject = await dbGet('SELECT * FROM projects WHERE id = ?', [projectId]);

    await dbRun('UPDATE projects SET title = ?, description = ? WHERE id = ?', [title, description, projectId]);

    await logAction(req.session.user.id, `Updated project: ${oldProject.title} (ID: ${projectId}) → title: ${oldProject.title} → ${title}`);
    res.redirect('/admin');
});

// Удаление проекта + очистка файлов (разбор и удаление изображения из layout и Uploads)
router.post('/project/delete/:id', checkAdmin, async (req, res) => {
    const projectId = req.params.id;

    db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
        if (err || !project) return res.redirect('/admin');

        if (project.cover) deleteFileIfExists(project.cover);

        try {
            let parsedLayout = typeof project.layout === 'string'
                ? JSON.parse(JSON.parse(project.layout))
                : project.layout;

            if (parsedLayout?.elements && Array.isArray(parsedLayout.elements)) {
                parsedLayout.elements.forEach(el => {
                    if (el.tag === 'img' && typeof el.src === 'string' && el.src.includes('/uploads/')) {
                        const match = el.src.match(/\/uploads\/[^"' ]+/);
                        if (match && match[0]) {
                            deleteFileIfExists(match[0]);
                        }
                    }
                });
            }
        } catch (e) {
            console.error(`Ошибка при парсинге layout проекта ${projectId}:`, e.message);
        }

        db.run('DELETE FROM projects WHERE id = ?', [projectId], async () => {
            await logAction(req.session.user.id, `Deleted project: ${project.title} (ID: ${projectId})`);
            res.redirect('/admin');
        });
    });
});

// Получить список задач
router.get('/todos', checkAdmin, async (req, res) => {
    const todos = await dbAll('SELECT * FROM todos ORDER BY position ASC');
    res.json(todos);
});

// Добавить задачу
router.post('/todo/create', checkAdmin, async (req, res) => {
    const { text } = req.body;
    const maxPos = await dbGet('SELECT MAX(position) as max FROM todos');
    const newPos = (maxPos?.max || 0) + 1;
    await dbRun('INSERT INTO todos (text, position) VALUES (?, ?)', [text, newPos]);
    await logAction(req.session.user.id, `Added task: "${text}"`);
    res.redirect('/admin');
});

// Удалить задачу
router.post('/todo/delete/:id', checkAdmin, async (req, res) => {
    const todo = await dbGet('SELECT text FROM todos WHERE id = ?', [req.params.id]);
    await dbRun('DELETE FROM todos WHERE id = ?', [req.params.id]);
    await logAction(req.session.user.id, `Deleted task: "${todo?.text || 'undefined'}".`);
    await dbRun('DELETE FROM todo_admins WHERE todo_id = ?', [req.params.id]);
    res.redirect('/admin');
});

// Изменить задачу
router.post('/todo/update/:id', checkAdmin, async (req, res) => {
    const { text } = req.body;
    await dbRun('UPDATE todos SET text = ? WHERE id = ?', [text, req.params.id]);
    await logAction(req.session.user.id, `Updated task (ID: ${req.params.id}): "${text}"`);
    res.redirect('/admin');
});

// Переключить статус выполнено
router.post('/todo/toggle/:id', checkAdmin, async (req, res) => {
    const todo = await dbGet('SELECT text, completed FROM todos WHERE id = ?', [req.params.id]);
    const newStatus = todo.completed ? 0 : 1;
    await dbRun('UPDATE todos SET completed = ? WHERE id = ?', [newStatus, req.params.id]);
    await logAction(req.session.user.id, `Updated state of task (ID: ${req.params.id}): "${todo.text}" → ${newStatus ? 'выполнено' : 'не выполнено'}`);
    res.redirect('/admin');
});

// Переместить задачу
router.post('/todo/move', checkAdmin, async (req, res) => {
    const { id, direction } = req.body;
    const current = await dbGet('SELECT * FROM todos WHERE id = ?', [id]);
    if (!current) return res.redirect('/admin');

    const comparator = direction === 'up' ? '<' : '>';
    const order = direction === 'up' ? 'DESC' : 'ASC';

    const neighbor = await dbGet(
        `SELECT * FROM todos WHERE position ${comparator} ? ORDER BY position ${order} LIMIT 1`,
        [current.position]
    );

    if (!neighbor) return res.redirect('/admin');

    await dbRun('UPDATE todos SET position = ? WHERE id = ?', [neighbor.position, current.id]);
    await dbRun('UPDATE todos SET position = ? WHERE id = ?', [current.position, neighbor.id]);
    await logAction(req.session.user.id, `Moved the task (ID: ${id}) ${direction === 'up' ? 'up' : 'down'}`);
    res.redirect('/admin');
});

// Назначение админов
router.post('/todo/assign', checkAdmin, async (req, res) => {
    const { todo_id } = req.body;

    const user_ids = req.body.user_ids || req.body['user_ids[]'];
    const ids = Array.isArray(user_ids) ? user_ids : [user_ids].filter(Boolean);

    await dbRun('DELETE FROM todo_admins WHERE todo_id = ?', [todo_id]);

    if (ids.length > 0) {
        const placeholders = ids.map(() => '(?, ?)').join(', ');
        const values = ids.flatMap(user_id => [todo_id, user_id]);
        await dbRun(`INSERT INTO todo_admins (todo_id, user_id) VALUES ${placeholders}`, values);
    }

    await logAction(req.session.user.id, `Assigned admin(s) to task (ID: ${todo_id}): [${ids.join(', ')}]`);
    res.redirect('/admin');
});

router.get('/chat/messages', checkAdmin, async (req, res) => {
    const messages = await dbAll(`
        SELECT admin_chat_messages.*, users.name as username, users.avatar as avatar
        FROM admin_chat_messages
        JOIN users ON users.id = admin_chat_messages.user_id
        ORDER BY admin_chat_messages.created_at ASC
    `);
    res.json(messages);
});

// Отправка сообщения
router.post('/chat/send', checkAdmin, async (req, res) => {
    const { text } = req.body;
    if (!text.trim()) return res.redirect('/admin');

    await dbRun('INSERT INTO admin_chat_messages (user_id, text) VALUES (?, ?)', [
        req.session.user.id,
        text.trim(),
    ]);

    await logAction(req.session.user.id, 'Sent message to admin chat');
    res.redirect('/admin');
});

router.post('/chat/send-ajax', checkAdmin, async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Пустое сообщение' });

    await dbRun('INSERT INTO admin_chat_messages (user_id, text) VALUES (?, ?)', [
        req.session.user.id,
        text.trim()
    ]);

    await logAction(req.session.user.id, 'Sent message to admin chat');
    res.status(200).json({ success: true });
});

// Редактирование сообщения
router.post('/chat/edit/:id', checkAdmin, async (req, res) => {
    const messageId = req.params.id;
    const { text } = req.body;
    const message = await dbGet('SELECT * FROM admin_chat_messages WHERE id = ?', [messageId]);

    if (!message || message.user_id !== req.session.user.id) {
        return res.status(403).render('errors/403', { title: '403 - Запрещено' });
    }

    await dbRun('UPDATE admin_chat_messages SET text = ?, edited = 1 WHERE id = ?', [text.trim(), messageId]);
    await logAction(req.session.user.id, `Edited admin chat message (ID: ${messageId})`);
    res.redirect('/admin');
});

// Удаление сообщения
router.post('/chat/delete/:id', checkAdmin, async (req, res) => {
    const messageId = req.params.id;
    const message = await dbGet('SELECT * FROM admin_chat_messages WHERE id = ?', [messageId]);

    if (!message || message.user_id !== req.session.user.id) {
        return res.status(403).render('errors/403', { title: '403 - Запрещено' });
    }

    await dbRun('DELETE FROM admin_chat_messages WHERE id = ?', [messageId]);
    await logAction(req.session.user.id, `Deleted admin chat message (ID: ${messageId})`);
    res.redirect('/admin');
});

module.exports = router;