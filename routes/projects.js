//Скрипт маршрутов проектов пользователя

const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { deleteFileIfExists, upload, storage} = require('../public/fileHandling');
const { promisify } = require('util');
const { ensureAuth } = require('../models/ensureAuth');

const dbGet = promisify(db.get.bind(db));
const dbRun = promisify(db.run.bind(db));

//Страница всех проектов
router.get('/profile/:id/projects', ensureAuth, (req, res) => {
    const sort = req.query.sort || 'favorite';
    const token = req.csrfToken();
    let orderBy = 'created_at DESC';
    if (sort === 'popular') orderBy = 'popularity DESC';
    if (sort === 'favorite') orderBy = 'is_favorite DESC, created_at DESC';
    const profileId = parseInt(req.params.id);
    const viewer = req.session.user.id || null;
    const isOwner = viewer && parseInt(viewer) === profileId;
    const emailVerified = req.session.user.emailVerified;
    const userId = parseInt(req.params.id);

    db.all(`SELECT * FROM projects WHERE user_id = ? ORDER BY ${orderBy}`, [profileId], (err, projects) => {
        if (err) return res.status(500).render('errors/500', { title: '500 - Ошибка сервера' });

        res.render('userProjects', {
            title: 'Мои проекты',
            csrfToken: token,
            projects,
            sort,
            isOwner,
            emailVerified,
            userId,
            profileId
        });
    });
});

//Получаем проекты с фильтрацией
router.get('/api/user-projects', (req, res) => {
    const userId = parseInt(req.query.user_id);
    const sort = req.query.sort || 'favorite';

    let orderBy = 'created_at DESC';
    if (sort === 'popular') orderBy = 'popularity DESC';
    if (sort === 'favorite') orderBy = 'is_favorite DESC, created_at DESC';

    db.all(`SELECT * FROM projects WHERE user_id = ? ORDER BY ${orderBy}`, [userId], (err, projects) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки проектов' });
        res.json(projects);
    });
});

//Добавление проекта в "Избранное"
router.post('/project/favorite/:id', ensureAuth, (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;

    db.get('SELECT * FROM projects WHERE id = ? AND user_id = ?', [projectId, userId], (err, project) => {
        if (err || !project) {
            return res.status(403).json({ error: 'Нет доступа к проекту' });
        }

        db.get('SELECT COUNT(*) as count FROM projects WHERE user_id = ? AND is_favorite = 1', [userId], (err, row) => {
            const isCurrentlyFavorite = project.is_favorite === 1;

            if (!isCurrentlyFavorite && row.count >= 10) {
                return res.status(400).json({ error: 'Максимум 10 избранных проектов' });
            }

            const newStatus = isCurrentlyFavorite ? 0 : 1;

            db.run('UPDATE projects SET is_favorite = ? WHERE id = ?', [newStatus, projectId], function (err) {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка обновления избранного' });
                }

                res.json({ success: true, newStatus });
            });
        });
    });
});

//Показ формы добавления проекта
router.get('/add', ensureAuth, (req, res) => {
    const token = req.csrfToken();
    res.render('addProject', {csrfToken: token});
});

//Обработка формы добавления проекта
router.post('/add', ensureAuth, (req, res) => {

    const { title, description, link } = req.body;
    const userId = req.session.user.id;
    const cover = req.file ? `/uploads/${req.file.filename}` : null;

    if (!title.trim()) {
        return res.render('addProject', { error: "Название проекта обязательно" });
    }

    db.run(
        'INSERT INTO projects (user_id, title, description, link, cover) VALUES (?, ?, ?, ?, ?)',
        [userId, title, description, link, cover],
        function (err) {
            if (err) {
                return res.render('addProject', { error: "Ошибка при добавлении проекта" });
            }
            res.redirect(`/profile/${req.session.user.id}`);
        }
    );
});

//Показ формы редактирования проекта
router.get('/edit/:id', ensureAuth, (req, res) => {

    const projectId = req.params.id;
    db.get('SELECT * FROM projects WHERE id = ? AND user_id = ?',
        [projectId, req.session.user.id],
        (err, project) => {
            if (err || !project) {
                return res.redirect(`/profile/${req.session.user.id}`);
            }
            const token = req.csrfToken();
            res.render('editProject', { project, csrfToken: token });
        }
    );
});

//Обновление данных проекта
router.post('/edit/:id', ensureAuth, upload.single('cover'), (req, res) => {

    const { title, description, link } = req.body;
    const projectId = req.params.id;
    const userId = req.session.user.id;

    db.get('SELECT cover FROM projects WHERE id = ? AND user_id = ?', [projectId, userId], (err, project) => {
        if (err || !project) {
            return res.redirect(`/profile/${req.session.user.id}`);
        }

        const newCover = req.file ? `/uploads/${req.file.filename}` : project.cover;

        if (req.file && project.cover && project.cover !== newCover) {
            deleteFileIfExists(project.cover);
        }

        db.run(
            'UPDATE projects SET title = ?, description = ?, link = ?, cover = ? WHERE id = ? AND user_id = ?',
            [title, description, link, newCover, projectId, userId],
            function (err) {
                if (err) {
                    return res.render('editProject', {
                        project: { id: projectId, title, description, link, cover: newCover },
                        error: "Ошибка при обновлении"
                    });
                }
                res.redirect(`/profile/${req.session.user.id}`);
            }
        );
    });
});

//Форма удаления проекта
router.post('/delete/:id', ensureAuth, (req, res) => {

    const projectId = req.params.id;
    const userId = req.session.user.id;

    db.get('SELECT * FROM projects WHERE id = ? AND user_id = ?', [projectId, userId], (err, project) => {
        if (err || !project) {
            return res.redirect(`/profile/${userId}`);
        }

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
            console.error(`Ошибка при парсинге layout проекта ${projectId}:`, e.message);
        }

        db.run('DELETE FROM projects WHERE id = ? AND user_id = ?', [projectId, userId], (err) => {
            if (err) {
                console.error('Ошибка при удалении проекта:', err.message);
            }
            res.redirect(`/profile/${userId}`);
        });
    });
});

//Форма страницы макета проекта
router.get('/project/:id/view', (req, res) => {
    const projectId = req.params.id;
    const token = req.csrfToken();
    db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
        if (err || !project) {
            return res.status(404).render('errors/404', { title: '404 - Не найдено' });
        }

        res.render('viewProject', { project, csrfToken: token });
    });
});

//Поставить "лайк"
router.post('/project/:id/like', (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user?.id;

    if (!userId) {
        return res.status(401).json({ success: false, error: 'Авторизуйтесь для оценки проекта' });
    }

    db.get('SELECT * FROM likes WHERE user_id = ? AND project_id = ?', [userId, projectId], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: 'Ошибка базы данных' });

        if (row) {
            return res.json({ success: false, error: 'Вы уже оценили этот проект' });
        }
        db.run('INSERT INTO likes (user_id, project_id) VALUES (?, ?)', [userId, projectId], (err) => {
            if (err) return res.status(500).json({ success: false, error: 'Ошибка при сохранении оценки' });

            db.run('UPDATE projects SET popularity = popularity + 1 WHERE id = ?', [projectId], (err) => {
                if (err) return res.status(500).json({ success: false, error: 'Ошибка обновления популярности' });

                res.json({ success: true });
            });
        });
    });
});

//Форма страницы редактирования макета проекта
router.get('/project/:id/edit-page', (req, res) => {
    const projectId = req.params.id;

    db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
        if (err || !project) {
            return res.status(404).render('errors/404', { title: '404 - Не найдено' });
        }

        if (!req.session.user || req.session.user.id !== project.user_id) {
            return res.status(403).render('errors/403', { title: '403 - Запрещено' });
        }

        const token = req.csrfToken();
        res.render('editProjectPage', {
            project,
            layout: project.layout ? JSON.parse(project.layout) : [],
        csrfToken: token
        });
    });
});

router.get('/unsupported-screen', (req, res) => {
    res.status(400).render('unsupportedScreen',  {
        title: '404 - Не найдено',
        message: "Ваш текущий размер экрана пока не поддерживается"
    });
});

//Загрузка изображения на макете
router.post('/project/:id/upload-image', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
});

//Удаления изображения на макете
router.post('/delete-upload', (req, res) => {
    const { path } = req.body;
    deleteFileIfExists(path);
    res.json({ success: true });
});

//Загрузка layout
router.get('/api/project/:id/layout', async (req, res) => {
    const projectId = req.params.id;

    try {
        const project = await dbGet('SELECT layout FROM projects WHERE id = ?', [projectId]);

        if (project) {
            const layout = project.layout ? JSON.parse(project.layout) : [];
            res.json({ layout });
        } else {
            res.status(404).json({ error: 'Project not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при загрузке проекта' });
    }
});

//Сохранение layout
router.post('/api/project/:id/layout', async (req, res) => {
    const projectId = req.params.id;
    const { layout } = req.body;

    if (!layout) {
        return res.status(400).json({ error: 'Layout is required' });
    }

    try {
        await dbRun('UPDATE projects SET layout = ? WHERE id = ?', [JSON.stringify(layout), projectId]);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при сохранении проекта' });
    }
});

module.exports = router;