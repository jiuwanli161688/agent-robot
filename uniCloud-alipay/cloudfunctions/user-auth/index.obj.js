'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeEmail, isValidEmail, sendEmailCode } = require('./services/email-code');

const SHARED_CONFIG_PATHS = [
  path.join(__dirname, './runtime-config.json')
];

const USER_COLLECTION = 'app_users';
const EMAIL_CODE_COLLECTION = 'app_email_codes';
const DEFAULT_PASSWORD_SALT = 'agent-robot-auth-salt';
const DEFAULT_AVATAR = 'https://dummyimage.com/200x200/edf2f7/94a3b8.png&text=Avatar';

const readRuntimeConfig = () => {
  for (const configPath of SHARED_CONFIG_PATHS) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { config: parsed };
      }
    } catch (e) {
      // ignore
    }
  }
  return { config: {} };
};

const hashPassword = (password, salt) => crypto.createHash('sha256').update(`${password}|${salt}`).digest('hex');
const createToken = () => crypto.randomBytes(24).toString('hex');
const createUserId = () => `u_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

module.exports = {
  async sendCode(payload = {}) {
    const clientInfo = typeof this.getClientInfo === 'function' ? this.getClientInfo() : {};
    const clientIp = String(
      clientInfo.clientIP ||
      clientInfo.clientIp ||
      payload.clientIP ||
      payload.clientIp ||
      payload.ip ||
      ''
    ).trim();
    return sendEmailCode({
      email: payload.email,
      clientIp,
      collectionName: EMAIL_CODE_COLLECTION
    });
  },

  async register(payload = {}) {
    const rawAvatar = String(payload.avatar || '').trim();
    const avatar = rawAvatar || DEFAULT_AVATAR;
    const username = String(payload.username || '').trim();
    const email = normalizeEmail(payload.email);
    const emailCode = String(payload.emailCode || '').trim();
    const password = String(payload.password || '');
    const confirmPassword = String(payload.confirmPassword || '');

    if (!username) throw new Error('用户名不能为空');
    if (!isValidEmail(email)) throw new Error('邮箱格式不正确');
    if (!/^\d{6}$/.test(emailCode)) throw new Error('验证码格式错误');
    if (password.length < 6) throw new Error('密码至少6位');
    if (password !== confirmPassword) throw new Error('两次密码不一致');

    const now = Date.now();
    const db = uniCloud.database();
    const users = db.collection(USER_COLLECTION);
    const codes = db.collection(EMAIL_CODE_COLLECTION);

    const [existUserRes, codeRes] = await Promise.all([
      users.where({ email }).limit(1).get(),
      codes.where({
        email,
        code: emailCode,
        used: false
      }).orderBy('createdAt', 'desc').limit(1).get()
    ]);

    if (Array.isArray(existUserRes.data) && existUserRes.data.length > 0) {
      throw new Error('该邮箱已注册');
    }

    const matchedCode = Array.isArray(codeRes.data) ? codeRes.data[0] : null;
    if (!matchedCode) {
      throw new Error('验证码错误或已失效');
    }
    if (Number(matchedCode.expiresAt || 0) < now) {
      throw new Error('验证码已过期，请重新获取');
    }

    const { config: localConfig } = readRuntimeConfig();
    const passwordSalt = String(localConfig.AUTH_PASSWORD_SALT || DEFAULT_PASSWORD_SALT);
    const passwordHash = hashPassword(password, passwordSalt);
    const token = createToken();
    const userId = createUserId();

    const userDoc = {
      userId,
      avatar,
      username,
      email,
      passwordHash,
      token,
      emailVerified: true,
      emailVerifiedAt: now,
      registerType: 'email',
      status: 'active',
      profile: {
        username,
        avatar
      },
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now
    };

    const addRes = await users.add(userDoc);
    if (!addRes || !addRes.id) {
      throw new Error('用户数据写入失败，请重试');
    }
    await codes.doc(matchedCode._id).update({
      used: true,
      usedAt: now
    });

    return {
      userId,
      message: '注册成功，用户信息已写入数据库'
    };
  },

  async login(payload = {}) {
    const email = normalizeEmail(payload.email);
    const password = String(payload.password || '');

    if (!isValidEmail(email)) throw new Error('邮箱格式不正确');
    if (!password) throw new Error('密码不能为空');

    const { config: localConfig } = readRuntimeConfig();
    const passwordSalt = String(localConfig.AUTH_PASSWORD_SALT || DEFAULT_PASSWORD_SALT);
    const currentHash = hashPassword(password, passwordSalt);

    const db = uniCloud.database();
    const users = db.collection(USER_COLLECTION);
    const userRes = await users.where({ email }).limit(1).get();
    const user = Array.isArray(userRes.data) ? userRes.data[0] : null;

    if (!user || String(user.passwordHash || '') !== currentHash) {
      throw new Error('邮箱或密码错误');
    }

    const now = Date.now();
    const token = createToken();
    await users.doc(user._id).update({
      token,
      lastLoginAt: now,
      updatedAt: now
    });

    return {
      token,
      user: {
        userId: user.userId || user._id,
        username: user.username || '',
        email: user.email,
        avatar: user.avatar || ''
      }
    };
  }
};
