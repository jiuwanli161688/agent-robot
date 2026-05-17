'use strict';

/**
 * 爱发电 Webhook 接收端：需在 uniCloud 控制台对本云函数做「URL 化 / HTTP 访问」部署。
 * 本项目 chat-proxy 使用 `${API_BASE_URL}/api/chat`（见 config/index.js），建议为本函数配置同级前缀例如：
 *   https://api.zhihaiyuan-aichat.top/api/afdian-webhook
 * 具体路径以控制台为准；爱发电后台 Webhook 填写上述完整 HTTPS URL。
 *
 * 部署后请在 HBuilderX 上传本云函数；密钥校验见同级目录读取的 ../afdian-subscriber/runtime-config.json 中 AFDIAN_WEBHOOK_SECRET。
 */

const fs = require('fs');
const path = require('path');

const ORDERS_COLLECTION = 'afdian_webhook_orders';
const MIRROR_COLLECTION = 'afdian_patron_mirror';
const USER_COLLECTION = 'app_users';
const BIND_NONCES_COLLECTION = 'afdian_bind_nonces';
const CONFIG_PATH = path.join(__dirname, '../afdian-subscriber/runtime-config.json');

const readRuntimeConfig = () => {
	try {
		const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object') return parsed;
	} catch (e) {
		// ignore
	}
	return {};
};

const httpOkPayload = () => ({
	ec: 200,
	em: ''
});

/**
 * 爱发电要求 HTTP 响应体为 JSON：{"ec":200,"em":""}（根级字段）。
 * uniCloud URL 化：直接 return 普通 Object 会作为响应体序列化（见官方「返回 Object」说明）。
 * 若 return {statusCode,headers,body} 且未按厂商正确识别「集成响应」，会被整段序列化成一层外壳，
 * 爱发电校验会失败（根级没有 ec）。
 */
const okResponse = () => httpOkPayload();

const getHttpMethod = (event) =>
	String(event?.httpMethod || event?.requestMethod || event?.method || 'POST').toUpperCase();

const parseBodyJson = (event) => {
	let raw = event?.body;
	if (event?.isBase64Encoded && typeof raw === 'string') {
		try {
			raw = Buffer.from(raw, 'base64').toString('utf8');
		} catch (e) {
			raw = '{}';
		}
	}
	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw || '{}');
		} catch (e) {
			return {};
		}
	}
	if (raw && typeof raw === 'object') return raw;
	return typeof event === 'object' && event && !event.body ? event : {};
};

const headerMatchesSecret = (event, secret) => {
	const headers = event?.headers || {};
	const lower = {};
	Object.keys(headers).forEach((k) => {
		lower[String(k).toLowerCase()] = headers[k];
	});
	const incoming =
		lower['x-webhook-secret'] ||
		lower['x-afdian-webhook-secret'] ||
		String(lower['authorization'] || '').replace(/^Bearer\s+/i, '') ||
		'';
	return String(incoming || '').trim() === secret;
};

const extractOrder = (payload) => {
	if (payload?.data?.type === 'order' && payload.data.order && typeof payload.data.order === 'object') {
		return payload.data.order;
	}
	if (payload?.type === 'order' && payload.order && typeof payload.order === 'object') {
		return payload.order;
	}
	return null;
};

const pickPlanName = (order) => {
	const sku = Array.isArray(order?.sku_detail) ? order.sku_detail[0] : null;
	if (sku?.name) return String(sku.name);
	return '';
};

const extendPatronMirror = async (db, order, nowSec) => {
	const patronKey =
		String(order.user_private_id || '').trim() || String(order.user_id || '').trim();
	if (!patronKey) return;

	const months = Math.max(1, Number(order.month) || 1);
	const extendSec = months * 31 * 86400;
	const planName = pickPlanName(order);

	const col = db.collection(MIRROR_COLLECTION);
	const res = await col.where({ patronKey }).limit(1).get();
	const prev = Array.isArray(res.data) ? res.data[0] : null;
	const prevExpire = prev ? Number(prev.expireAtSec || 0) : 0;
	const base = Math.max(nowSec, prevExpire);
	const newExpire = base + extendSec;

	const doc = {
		patronKey,
		user_private_id: String(order.user_private_id || ''),
		user_id: String(order.user_id || ''),
		expireAtSec: newExpire,
		lastOutTradeNo: String(order.out_trade_no || ''),
		planId: String(order.plan_id || ''),
		planName,
		updatedAt: Date.now()
	};

	if (prev && prev._id) {
		await col.doc(prev._id).update(doc);
	} else {
		await col.add(doc);
	}
};

const tryAutoBindFromRemark = async (db, order, orderDocId, receivedAtSec) => {
	const remark = String(order.remark || '').trim();
	const m = /BIND:([a-f0-9]{16})/i.exec(remark);
	if (!m) return;

	const nonce = m[1].toLowerCase();
	const nonces = db.collection(BIND_NONCES_COLLECTION);
	const nr = await nonces.where({ nonce, used: false }).limit(1).get();
	const row = Array.isArray(nr.data) ? nr.data[0] : null;
	if (!row || Number(row.expiresAt || 0) < Date.now()) return;

	const users = db.collection(USER_COLLECTION);
	const ur = await users.where({ userId: row.userId }).limit(1).get();
	const appUser = Array.isArray(ur.data) ? ur.data[0] : null;
	if (!appUser) return;

	const patronKey =
		String(order.user_private_id || '').trim() || String(order.user_id || '').trim();
	let mirror = null;
	if (patronKey) {
		const mr = await db.collection(MIRROR_COLLECTION).where({ patronKey }).limit(1).get();
		mirror = Array.isArray(mr.data) ? mr.data[0] : null;
	}

	const nowSec = Math.floor(Date.now() / 1000);
	let expireAt = mirror ? Number(mirror.expireAtSec || 0) : 0;
	if (!expireAt) {
		const months = Math.max(1, Number(order.month) || 1);
		expireAt = receivedAtSec + months * 31 * 86400;
	}

	const subscription = {
		active: expireAt > nowSec,
		planName: String(mirror?.planName || pickPlanName(order) || ''),
		plan_id: String(order.plan_id || mirror?.planId || ''),
		expireAt,
		lastPayTime: receivedAtSec,
		allSumAmount: String(order.total_amount ?? '0.00'),
		source: 'webhook',
		bindMode: 'remark_nonce',
		checkedAt: Date.now()
	};

	const newAfdianUserId = String(order.user_id || '').trim();
	const newAfdianUserPrivateId = String(order.user_private_id || '').trim();

	await db.collection(ORDERS_COLLECTION).doc(orderDocId).update({
		claimedByAppUserId: row.userId,
		claimedAt: Date.now()
	});

	await users.doc(appUser._id).update({
		afdianUserId: newAfdianUserId,
		afdianUserPrivateId: newAfdianUserPrivateId,
		afdianSubscription: subscription,
		updatedAt: Date.now()
	});

	await nonces.doc(row._id).update({
		used: true,
		usedAt: Date.now(),
		usedOutTradeNo: String(order.out_trade_no || '')
	});
};

const persistSuccessfulOrder = async (order) => {
	const out_trade_no = String(order.out_trade_no || '').trim();
	if (!out_trade_no) return;

	const db = uniCloud.database();
	const orders = db.collection(ORDERS_COLLECTION);
	const dup = await orders.where({ out_trade_no }).limit(1).get();
	if (Array.isArray(dup.data) && dup.data.length > 0) {
		return;
	}

	const nowMs = Date.now();
	const nowSec = Math.floor(nowMs / 1000);
	const patronKey =
		String(order.user_private_id || '').trim() || String(order.user_id || '').trim();

	const addRes = await orders.add({
		out_trade_no,
		user_id: String(order.user_id || ''),
		user_private_id: String(order.user_private_id || ''),
		patronKey,
		plan_id: String(order.plan_id || ''),
		month: Number(order.month) || 1,
		total_amount: String(order.total_amount ?? ''),
		show_amount: String(order.show_amount ?? ''),
		status: Number(order.status),
		product_type: Number(order.product_type ?? 0),
		planName: pickPlanName(order),
		rawOrder: order,
		receivedAt: nowMs,
		receivedAtSec: nowSec,
		claimedByAppUserId: '',
		claimedAt: null
	});

	let orderDocId = addRes.id || addRes._id;
	if (!orderDocId) {
		const again = await orders.where({ out_trade_no }).limit(1).get();
		const doc = Array.isArray(again.data) ? again.data[0] : null;
		orderDocId = doc ? doc._id : '';
	}

	await extendPatronMirror(db, order, nowSec);

	if (orderDocId) {
		try {
			await tryAutoBindFromRemark(db, order, orderDocId, nowSec);
		} catch (e) {
			console.error('[afdian-webhook] 备注自动绑定失败', e);
		}
	}
};

/** 仅打关键字段，便于对照爱发电文档且不刷屏 */
const payloadProbe = (payload) => {
	if (!payload || typeof payload !== 'object') return String(payload);
	const top = Object.keys(payload).slice(0, 12);
	const dt = payload.data?.type;
	const hasOrder = Boolean(payload.data?.order || payload.order);
	return { topKeys: top, dataType: dt, hasOrder };
};

exports.main = async (event) => {
	const method = getHttpMethod(event);
	const bodyHint =
		typeof event?.body === 'string'
			? `(len=${event.body.length}${event?.isBase64Encoded ? ',base64' : ''})`
			: event?.body != null
				? '(object)'
				: '(empty)';

	if (method === 'GET' || method === 'HEAD') {
		console.log('[afdian-webhook] ping', method);
		return okResponse();
	}

	console.log('[afdian-webhook] request', method, bodyHint);

	const cfg = readRuntimeConfig();
	const secret = String(cfg.AFDIAN_WEBHOOK_SECRET || '').trim();
	if (secret && !headerMatchesSecret(event, secret)) {
		console.warn(
			'[afdian-webhook] secret 校验失败：请确认爱发电或网关能带上 x-webhook-secret / Authorization Bearer；不需要校验时请清空 runtime-config 中 AFDIAN_WEBHOOK_SECRET'
		);
		return okResponse();
	}

	try {
		const payload = parseBodyJson(event);
		const order = extractOrder(payload);
		if (!order) {
			console.warn('[afdian-webhook] 正文无法解析为订单，结构预览:', JSON.stringify(payloadProbe(payload)));
			return okResponse();
		}

		const status = Number(order.status);
		if (status !== 2) {
			console.log('[afdian-webhook] 忽略非成功订单 status=', status, 'out_trade_no=', order.out_trade_no);
			return okResponse();
		}

		await persistSuccessfulOrder(order);
		console.log('[afdian-webhook] 已处理支付成功订单', String(order.out_trade_no || ''));
	} catch (e) {
		console.error('[afdian-webhook] 处理异常:', e);
	}

	return okResponse();
};
