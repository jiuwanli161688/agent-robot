'use strict';
const fs = require('fs');
const path = require('path');

// --- 配置区（统一从 common/runtime-config.json 读取） ---
const SHARED_CONFIG_PATHS = [
    path.join(__dirname, './runtime-config.json'),
];

const AGENTS = require('./agentPrompts');

const readRuntimeConfig = () => {
    for (const configPath of SHARED_CONFIG_PATHS) {
        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return { config: parsed, configPath };
            }
        } catch (e) {
            // ignore
        }
    }
    return { config: {}, configPath: '' };
};

const maskSecret = (text) => {
    const value = String(text || '');
    if (!value) return '';
    if (value.length <= 8) return '****';
    return `${value.slice(0, 4)}****${value.slice(-4)}`;
};

const getModelCandidates = (localConfig) => {
    const models = localConfig?.MODELS;
    if (!models || typeof models !== 'object' || Array.isArray(models) || Object.keys(models).length === 0) {
        throw new Error('MODELS 未配置可用模型');
    }
    const defaultModelKey = String(localConfig?.DEFAULT_MODEL_KEY || '').trim();
    const allKeys = Object.keys(models);
    if (!defaultModelKey) {
        throw new Error('DEFAULT_MODEL_KEY 未配置');
    }
    if (!models[defaultModelKey]) {
        throw new Error(`DEFAULT_MODEL_KEY 对应模型不存在：${defaultModelKey}`);
    }

    const seen = new Set();
    const orderedKeys = [defaultModelKey, ...allKeys]
        .filter(Boolean)
        .filter((key) => {
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    const candidates = orderedKeys.map((key) => ({
        modelKey: key,
        ...models[key]
    })).filter((item) => item && typeof item === 'object');

    if (!candidates.length) {
        throw new Error('MODELS 未配置可用模型');
    }

    return {
        source: 'MODELS',
        candidates
    };
};

const getRuntimeConfig = (localConfig) => {
    const resolved = getModelCandidates(localConfig);
    const maxMessages = Number(localConfig.MAX_MESSAGES);
    const maxMessageLength = Number(localConfig.MAX_MESSAGE_LENGTH);
    if (!Number.isFinite(maxMessages) || maxMessages <= 0) {
        throw new Error('MAX_MESSAGES 必须为正数');
    }
    if (!Number.isFinite(maxMessageLength) || maxMessageLength <= 0) {
        throw new Error('MAX_MESSAGE_LENGTH 必须为正数');
    }

    const candidates = resolved.candidates.map((item) => {
        const apiKey = String(item?.SCNET_API_KEY || '').trim();
        const url = String(item?.SCNET_URL || '').trim();
        const modelName = String(item?.SCNET_MODEL_NAME || '').trim();
        const modelKey = String(item?.modelKey || 'unknown').trim();
        if (!apiKey) {
            throw new Error(`模型 ${modelKey} 的 SCNET_API_KEY 未配置`);
        }
        if (!url) {
            throw new Error(`模型 ${modelKey} 的 SCNET_URL 未配置`);
        }
        if (!/^https:\/\//i.test(url)) {
            throw new Error(`模型 ${modelKey} 的 SCNET_URL 必须为 https 地址`);
        }
        if (!modelName) {
            throw new Error(`模型 ${modelKey} 的 SCNET_MODEL_NAME 未配置`);
        }
        return { modelKey, apiKey, url, modelName };
    });

    console.log('[chat-proxy][runtime-config]', {
        CONFIG_SOURCE: resolved.source,
        CANDIDATE_MODELS: candidates.map((item) => ({
            modelKey: item.modelKey,
            SCNET_API_KEY: maskSecret(item.apiKey),
            SCNET_URL: item.url,
            SCNET_MODEL_NAME: item.modelName
        })),
        MAX_MESSAGES: maxMessages,
        MAX_MESSAGE_LENGTH: maxMessageLength
    });

    return { candidates, maxMessages, maxMessageLength };
};

const normalizeMessages = (messages, maxMessages, maxMessageLength) => {
    if (!Array.isArray(messages)) return [];

    return messages
        .filter((msg) => msg && typeof msg === 'object')
        .map((msg) => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: String(msg.content || '').slice(0, maxMessageLength)
        }))
        .filter((msg) => msg.content.trim().length > 0)
        .slice(-maxMessages);
};

const extractReplyContent = (data) => {
    if (!data || typeof data !== 'object') return '';
    if (typeof data?.choices?.[0]?.message?.content === 'string') return data.choices[0].message.content;
    if (typeof data?.choices?.[0]?.text === 'string') return data.choices[0].text;
    if (typeof data?.message?.content === 'string') return data.message.content;
    if (typeof data?.reply === 'string') return data.reply;
    if (typeof data?.content === 'string') return data.content;
    if (typeof data?.result === 'string') return data.result;
    if (typeof data?.data?.content === 'string') return data.data.content;
    if (typeof data?.data?.reply === 'string') return data.data.reply;
    return '';
};

const extractErrorMessage = (data) => {
    if (!data || typeof data !== 'object') return '';
    if (typeof data?.error?.message === 'string') return data.error.message;
    if (typeof data?.message === 'string') return data.message;
    if (typeof data?.msg === 'string') return data.msg;
    if (typeof data?.error === 'string') return data.error;
    return '';
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildHttpResponse = (statusCode, payload) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
});

const parsePayload = (event) => {
    if (event && typeof event.body === 'string') {
        return JSON.parse(event.body || '{}');
    }
    return event || {};
};

const isRetryableNetworkError = (errorMessage) => {
    const msg = String(errorMessage || '').toUpperCase();
    return (
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('ESOCKETTIMEDOUT') ||
        msg.includes('EAI_AGAIN') ||
        msg.includes('ENOTFOUND')
    );
};

const requestWithRetry = async (url, options, maxAttempts = 3) => {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await uniCloud.httpclient.request(url, options);
        } catch (error) {
            lastError = error;
            const message = String(error?.message || error || '');
            const canRetry = attempt < maxAttempts && isRetryableNetworkError(message);
            if (!canRetry) break;
            await sleep(300 * attempt);
        }
    }
    throw lastError;
};

const chatProxyMain = async (payload) => {
    const { messages = [], industry } = payload;
    const systemPrompt = AGENTS[industry] || AGENTS.general;
    try {
        const { config: localConfig, configPath } = readRuntimeConfig();
        if (!configPath) {
            throw new Error('公共配置文件不存在或格式错误：cloudfunctions/common/runtime-config.json');
        }
        const { candidates, maxMessages, maxMessageLength } = getRuntimeConfig(localConfig);
        console.log(`[chat-proxy] 使用配置文件: ${configPath}`);
        const safeMessages = normalizeMessages(messages, maxMessages, maxMessageLength);
        const failReasons = [];

        for (const candidate of candidates) {
            try {
                const res = await requestWithRetry(candidate.url, {
                    method: 'POST',
                    data: {
                        model: candidate.modelName,
                        messages: [{ role: "system", content: systemPrompt }, ...safeMessages],
                        stream: false
                    },
                    headers: {
                        'Authorization': `Bearer ${candidate.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    dataType: 'json',
                    timeout: 60000
                });

                const statusCode = Number(res?.statusCode || res?.status || 0);
                const upstreamError = extractErrorMessage(res?.data);
                const content = extractReplyContent(res?.data);

                if (statusCode && statusCode >= 400) {
                    throw new Error(`上游接口异常(${statusCode})：${upstreamError || '无错误详情'}`);
                }
                if (!content) {
                    throw new Error(`上游返回结构未匹配：${JSON.stringify(res?.data || {}).slice(0, 500)}`);
                }

                return {
                    content,
                    modelKey: candidate.modelKey,
                    modelName: candidate.modelName
                };
            } catch (error) {
                const reason = String(error?.message || error || '未知错误');
                failReasons.push(`${candidate.modelKey}:${reason}`);
                console.warn(`[chat-proxy] 模型 ${candidate.modelKey} 不可用，尝试下一个模型。原因: ${reason}`);
            }
        }

        throw new Error(`所有模型均不可用：${failReasons.join(' | ')}`);

    } catch (e) {
        const errorMessage = String(e?.message || e || '');
        console.error('chat-proxy 请求失败:', e);
        return {
            error: isRetryableNetworkError(errorMessage)
                ? `网络连接异常（${errorMessage}），请稍后重试`
                : String(e?.message || 'AI 服务暂时不可用')
        };
    }
};

const resolveRoute = (event) => {
    const pathName = String(event?.path || '').trim();
    if (pathName) return pathName;
    if (event && event.messages) return '/api/chat';
    return '';
};

exports.main = async (event) => {
    const route = resolveRoute(event);
    // if (!route.includes('/api/chat')) {
    //     return buildHttpResponse(404, { message: '接口不存在' });
    // }
    let payload;
    try {
        payload = parsePayload(event);
    } catch (e) {
        return buildHttpResponse(400, { message: '请求格式错误' });
    }
    return chatProxyMain(payload);
};