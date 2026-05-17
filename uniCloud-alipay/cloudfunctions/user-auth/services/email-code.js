'use strict';
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const SHARED_CONFIG_PATHS = [
    path.join(__dirname, '../runtime-config.json')
];

let smtpTransporter = null;

const readRuntimeConfig = () => {
    for (const configPath of SHARED_CONFIG_PATHS) {
        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (e) {
            // ignore
        }
    }
    return {};
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const toInteger = (value, defaultValue) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return defaultValue;
    return Math.floor(num);
};
const getLocalDayStartMs = (timeMs) => {
    const date = new Date(timeMs);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};
const normalizeClientIp = (ip) => {
    const value = String(ip || '').trim();
    if (!value) return '';
    if (value.startsWith('::ffff:')) return value.slice(7);
    return value;
};

const toBoolean = (value, defaultValue = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
    }
    return defaultValue;
};

const getEmailConfig = () => {
    const localConfig = readRuntimeConfig();
    const host = String(localConfig.SMTP_HOST || '').trim();
    const port = Number(localConfig.SMTP_PORT || 0);
    const user = String(localConfig.SMTP_USER || '').trim();
    const pass = String(localConfig.SMTP_PASS || '').trim();
    const fromEmail = String(localConfig.SMTP_FROM_EMAIL || user).trim();
    const fromName = String(localConfig.SMTP_FROM_NAME || 'Agent Robot').trim();
    const secure = toBoolean(localConfig.SMTP_SECURE, port === 465);
    const expireSeconds = Number(localConfig.EMAIL_CODE_EXPIRE_SECONDS || 300);
    const resendSeconds = Number(localConfig.EMAIL_CODE_RESEND_SECONDS || 60);
    const dailyLimitPerEmail = toInteger(localConfig.EMAIL_CODE_DAILY_LIMIT_PER_EMAIL, 20);
    const hourlyLimitPerIp = toInteger(localConfig.EMAIL_CODE_HOURLY_LIMIT_PER_IP, 20);

    if (!host || !port || !user || !pass || !fromEmail) {
        throw new Error('邮箱服务未配置，请检查 SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM_EMAIL');
    }
    if (!Number.isFinite(expireSeconds) || expireSeconds < 60) {
        throw new Error('EMAIL_CODE_EXPIRE_SECONDS 配置无效，最小 60 秒');
    }
    if (!Number.isFinite(resendSeconds) || resendSeconds < 30) {
        throw new Error('EMAIL_CODE_RESEND_SECONDS 配置无效，最小 30 秒');
    }
    if (!Number.isFinite(dailyLimitPerEmail) || dailyLimitPerEmail < 1) {
        throw new Error('EMAIL_CODE_DAILY_LIMIT_PER_EMAIL 配置无效，最小 1');
    }
    if (!Number.isFinite(hourlyLimitPerIp) || hourlyLimitPerIp < 1) {
        throw new Error('EMAIL_CODE_HOURLY_LIMIT_PER_IP 配置无效，最小 1');
    }

    return {
        host,
        port,
        secure,
        user,
        pass,
        fromEmail,
        fromName,
        expireSeconds,
        resendSeconds,
        dailyLimitPerEmail,
        hourlyLimitPerIp
    };
};

const getSmtpTransporter = (emailConfig) => {
    if (smtpTransporter) return smtpTransporter;
    smtpTransporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth: {
            user: emailConfig.user,
            pass: emailConfig.pass
        }
    });
    return smtpTransporter;
};

const SCENE_EMAIL = {
    register: {
        subject: '注册验证码',
        intro: '您正在进行账号注册。'
    },
    reset_password: {
        subject: '重置密码验证码',
        intro: '您正在重置登录密码。'
    }
};

const sendVerifyCodeEmail = async ({ emailConfig, targetEmail, code, scene = 'register' }) => {
    const meta = SCENE_EMAIL[scene] || SCENE_EMAIL.register;
    const expireMinutes = Math.ceil(emailConfig.expireSeconds / 60);
    const transporter = getSmtpTransporter(emailConfig);
    return transporter.sendMail({
        from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
        to: targetEmail,
        subject: meta.subject,
        text: `${meta.intro}您的验证码为 ${code}，${expireMinutes} 分钟内有效。`,
        html: `
<div style="font-family: Arial, Helvetica, sans-serif; color: #111827;">
  <p>您好，</p>
  <p>${meta.intro}</p>
  <p>您的验证码是：</p>
  <p style="font-size: 28px; font-weight: 700; letter-spacing: 2px;">${code}</p>
  <p>验证码 ${expireMinutes} 分钟内有效，请勿泄露给他人。</p>
</div>
`.trim()
    });
};

const sendEmailCode = async ({
    email,
    clientIp,
    collectionName = 'app_email_codes',
    scene = 'register'
} = {}) => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedClientIp = normalizeClientIp(clientIp);
    if (!isValidEmail(normalizedEmail)) {
        throw new Error('邮箱格式不正确');
    }

    const emailConfig = getEmailConfig();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const now = Date.now();
    const db = uniCloud.database();
    const codes = db.collection(collectionName);
    const dbCmd = db.command;

    const latestCodeRes = await codes.where({ email: normalizedEmail }).orderBy('createdAt', 'desc').limit(1).get();
    const latestCode = Array.isArray(latestCodeRes.data) ? latestCodeRes.data[0] : null;
    const resendMs = emailConfig.resendSeconds * 1000;
    if (latestCode && now - Number(latestCode.createdAt || 0) < resendMs) {
        const remainSeconds = Math.ceil((resendMs - (now - Number(latestCode.createdAt || 0))) / 1000);
        throw new Error(`请求过于频繁，请 ${remainSeconds} 秒后重试`);
    }

    const dayStartMs = getLocalDayStartMs(now);
    const emailDailyRes = await codes.where({
        email: normalizedEmail,
        createdAt: dbCmd.gte(dayStartMs)
    }).limit(emailConfig.dailyLimitPerEmail).get();
    const emailDailyCount = Array.isArray(emailDailyRes.data) ? emailDailyRes.data.length : 0;
    if (emailDailyCount >= emailConfig.dailyLimitPerEmail) {
        throw new Error(`该邮箱今日验证码发送已达上限（${emailConfig.dailyLimitPerEmail}次）`);
    }

    if (normalizedClientIp) {
        const hourStartMs = now - 60 * 60 * 1000;
        const ipHourlyRes = await codes.where({
            requestIp: normalizedClientIp,
            createdAt: dbCmd.gte(hourStartMs)
        }).limit(emailConfig.hourlyLimitPerIp).get();
        const ipHourlyCount = Array.isArray(ipHourlyRes.data) ? ipHourlyRes.data.length : 0;
        if (ipHourlyCount >= emailConfig.hourlyLimitPerIp) {
            throw new Error(`当前IP在1小时内发送已达上限（${emailConfig.hourlyLimitPerIp}次）`);
        }
    }

    let mailResult;
    try {
        mailResult = await sendVerifyCodeEmail({
            emailConfig,
            targetEmail: normalizedEmail,
            code,
            scene
        });
    } catch (error) {
        const reason = String(error?.message || '').slice(0, 160);
        throw new Error(`验证码邮件发送失败${reason ? `：${reason}` : ''}`);
    }

    await codes.add({
        email: normalizedEmail,
        code,
        scene,
        createdAt: now,
        expiresAt: now + emailConfig.expireSeconds * 1000,
        used: false,
        requestIp: normalizedClientIp,
        channel: 'smtp',
        sent: true,
        messageId: String(mailResult?.messageId || ''),
        dateStr: new Date(now).toISOString().replace('T', ' ').substring(0, 19)
    });

    console.log(`[user-auth.obj] 验证码已发送到邮箱: ${normalizedEmail}`);
    return {
        message: '验证码发送成功，请查收邮箱'
    };
};

module.exports = {
    normalizeEmail,
    isValidEmail,
    sendEmailCode
};
