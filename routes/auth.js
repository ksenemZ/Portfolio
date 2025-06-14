//Скрипт маршрутов связанных с регистрацией, авторизацией и выходом из системы

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require("crypto");
const { findUserByEmail, findUserByUsername } = require('../models/userModel');
const rateLimit = require('express-rate-limit');
const db = require('../models/db');
const nodemailer = require('nodemailer');
const { promisify } = require('util');
const dbRun = promisify(db.run.bind(db));
const axios = require('axios');

async function logAction(userId, action) {
    await dbRun('INSERT INTO logs (user_id, action) VALUES (?, ?)', [userId, action]);
}

//Ограничитель количества попыток для входа
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    validate: {trustProxy: true},
    keyGenerator: (req) => {
        const username = req.body.username || 'unknown';
        return `${req.ip}:${username.toLowerCase()}`;
    },
    handler: (req, res) => {
        const ip = req.ip;
        const time = new Date().toISOString();
        const username = req.body.username || 'unknown';

        logAction('null', `[LOGIN RATE LIMIT] IP ${req.ip} для пользователя "${username}" превысил лимит. ${new Date().toISOString()}`);

        console.warn(`[LOGIN RATE LIMIT] ${ip} превысил лимит входа — ${time}`);

        const token = req.csrfToken();

        res.status(429).render('login', {
            error: 'Слишком много попыток входа. Попробуйте снова через 15 минут.',
            csrfToken: token
        });
    }
});

//Форма авторизации
router.get('/login', (req, res) => {
    const token = req.csrfToken();
    res.render('login', { error: null, csrfToken: token });
});
router.post('/login', loginLimiter, async (req, res) => {
    const { identifier, password, 'g-recaptcha-response': recaptchaResponse } = req.body;

    // Проверка reCAPTCHA
    if (!recaptchaResponse) {
        return res.status(400).render('login', {
            error: 'Пожалуйста, подтвердите, что вы не робот',
            csrfToken: req.csrfToken()
        });
    }

    try {
        const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=6Lfl_2ArAAAAAIONwAiTQo9ZVMvhnd_0HVQr8eD6&response=${recaptchaResponse}`;
        const response = await axios.post(verifyURL);
        const data = response.data;

        if (!data.success) {
            return res.status(400).render('login', {
                error: 'Проверка капчи не пройдена',
                csrfToken: req.csrfToken()
            });
        }
    } catch (err) {
        console.error('Ошибка проверки reCAPTCHA:', err);
        return res.status(500).render('login', {
            error: 'Ошибка проверки капчи. Попробуйте снова.',
            csrfToken: req.csrfToken()
        });
    }

    let user;

    if (identifier.includes('@')) {
        user = await findUserByEmail(identifier);
    } else {
        user = await findUserByUsername(identifier);
    }

    if (!user || !(await bcrypt.compare(password, user.password))) {
        await bcrypt.compare('dummy', '$2b$10$abcdefghijklmnopqrstuv');
        return res.status(401).render('login', {
            error: 'Неверный email или пароль',
            csrfToken: req.csrfToken()
        });
    }

    req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        cover: user.cover,
        bio: user.bio,
        github: user.github,
        telegram: user.telegram,
        linkedin: user.linkedin,
        emailVerified: user.email_verified,
        role: user.role };
    res.redirect('/');
});

//Форма восстановления
router.get('/forgot', (req, res) => {
    res.render('forgotPassword', { error: null, success: null, csrfToken: req.csrfToken() });
});

//Обработка формы восстановления
router.post('/forgot', async (req, res) => {
    const email = req.body.email.trim();
    const token = req.csrfToken();

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) {
            return res.render('forgotPassword', { error: 'Пользователь не найден', success: null, csrfToken: token });
        }

        const tempPassword = crypto.randomBytes(6).toString('hex');
        const hashed = await bcrypt.hash(tempPassword, 10);

        db.run('UPDATE users SET password = ? WHERE email = ?', [hashed, email], async (updateErr) => {
            if (updateErr) {
                return res.render('forgotPassword', { error: 'Ошибка сброса пароля', success: null, csrfToken: token });
            }

            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: 'portfol.io.ivpeksites@gmail.com',
                    pass: 'pwos qkbd xeto hsqr'
                }
            });

            const mailOptions = {
                from: 'portfol.io.ivpeksites@gmail.com',
                to: email,
                subject: 'Сброс пароля',
                text: `Здравствуйте!\n\nВаш новый временный пароль: ${tempPassword}\n\nПожалуйста, войдите с этим паролем и смените его в профиле.`
            };

            try {
                await transporter.sendMail(mailOptions);
                res.render('forgotPassword', {
                    success: 'Временный пароль отправлен на почту',
                    error: null,
                    csrfToken: token
                });
            } catch (e) {
                console.error(e);
                res.render('forgotPassword', {
                    error: 'Не удалось отправить email. Попробуйте позже.',
                    success: null,
                    csrfToken: token
                });
            }
        });
    });
});

//Форма выхода из системы
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

module.exports = router;
