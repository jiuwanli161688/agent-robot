'use strict';

/**
 * 爱发电订阅云对象：档位、BIND 备注下单、订阅状态（Webhook 镜像 + query-sponsor）、订单认领。
 * 密钥见 runtime-config.json；支付订单入库由 afdian-webhook 完成。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USER_COLLECTION = 'app_users';
/** Webhook 写入的已支付订单；认领时校验 out_trade_no */
const ORDERS_COLLECTION = 'afdian_webhook_orders';
/** Webhook 维护的赞助到期镜像，刷新状态时优先读取 */
const MIRROR_COLLECTION = 'afdian_patron_mirror';
const PLANS_COLLECTION = 'subscriber_plans';
/** getPlanSubscribeUrl 写入 nonce；afdian-webhook 解析 remark 中 BIND:<nonce> 后核销 */
const BIND_NONCES_COLLECTION = 'afdian_bind_nonces';

const AFDIAN_ORDER_CREATE_BASE = 'https://ifdian.net/order/create';
const BIND_NONCE_TTL_MS = 30 * 60 * 1000;

const DEFAULT_SUBSCRIBER_PLANS = [
	{
		code: 'tier_basic',
		name: '基础档',
		subtitle: '入门之选',
		plan_id: '9586100a4a8c11f181895254001e7c00',
		product_type: 0,
		affiliate_code: '',
		priceLabel: '',
		perks: ['基础权益说明 1', '基础权益说明 2'],
		sort: 1,
		enabled: true
	},
	{
		code: 'tier_standard',
		name: '标准档',
		subtitle: '常用强度',
		plan_id: '9586100a4a8c11f181895254001e7c01',
		product_type: 0,
		affiliate_code: '',
		priceLabel: '',
		perks: ['更高配额或权益', '优先响应（示例）'],
		sort: 2,
		enabled: true
	},
	{
		code: 'tier_pro',
		name: '高级档',
		subtitle: '重度用户',
		plan_id: '9586100a4a8c11f181895254001e7c02',
		product_type: 0,
		affiliate_code: '',
		priceLabel: '',
		perks: ['顶配权益说明', '专属标识（示例）'],
		sort: 3,
		enabled: true
	}
];
const SHARED_CONFIG_PATHS = [path.join(__dirname, './runtime-config.json')];

const OPEN_QUERY_SPONSOR_URL = 'https://afdian.net/api/open/query-sponsor';

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

/** 开放平台请求签名（官方文档 query-sponsor 等接口） */
const md5SignOpenApi = (token, paramsObj, ts, creatorUserId) => {
	const params = JSON.stringify(paramsObj);
	const kvString = `params${params}ts${ts}user_id${creatorUserId}`;
	return crypto.createHash('md5').update(`${token}${kvString}`, 'utf8').digest('hex');
};

const httpPostJson = async (url, body) => {
	const res = await uniCloud.httpclient.request(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		data: body,
		dataType: 'json',
		timeout: 30000
	});
	const parsed = res.data;
	if (typeof parsed === 'string') {
		try {
			return JSON.parse(parsed);
		} catch (e) {
			throw new Error('开放平台响应解析失败');
		}
	}
	return parsed;
};

const getUserByAppToken = async (token) => {
	const raw = String(token || '').trim();
	if (!raw) {
		throw new Error('请先登录应用账号');
	}
	const db = uniCloud.database();
	const res = await db.collection(USER_COLLECTION).where({ token: raw }).limit(1).get();
	const user = Array.isArray(res.data) ? res.data[0] : null;
	if (!user) {
		throw new Error('登录已失效，请重新登录');
	}
	return user;
};

const pickPublicUser = (user) => ({
	userId: user.userId || user._id,
	username: user.username || '',
	email: user.email || '',
	avatar: user.avatar || ''
});

/** 拼装 ifdian 收银 URL；remark 含 BIND: 时由 Webhook 解析并完成账号关联 */
const buildAfdianOrderUrl = (plan_id, product_type, affiliate_code, remark) => {
	const pt = Number(product_type ?? 0);
	const pid = String(plan_id || '').trim();
	const aff = String(affiliate_code ?? '');
	const rm = String(remark ?? '');
	const qs = [
		`plan_id=${encodeURIComponent(pid)}`,
		`product_type=${encodeURIComponent(String(pt))}`,
		`remark=${encodeURIComponent(rm)}`,
		`affiliate_code=${encodeURIComponent(aff)}`
	].join('&');
	return `${AFDIAN_ORDER_CREATE_BASE}?${qs}`;
};

/** 若 subscriber_plans 为空则插入内置示例档位（生产环境务必换成真实 plan_id） */
const ensureDefaultSubscriberPlans = async () => {
	const db = uniCloud.database();
	const col = db.collection(PLANS_COLLECTION);
	const sample = await col.limit(1).get();
	if (Array.isArray(sample.data) && sample.data.length > 0) return;
	const now = Date.now();
	for (let i = 0; i < DEFAULT_SUBSCRIBER_PLANS.length; i += 1) {
		const row = DEFAULT_SUBSCRIBER_PLANS[i];
		await col.add({
			...row,
			createdAt: now,
			updatedAt: now
		});
	}
};

/** 返回前端列表项；checkoutPreviewUrl 无 BIND，仅供未登录预览 */
const pickPublicPlan = (doc) => ({
	_id: doc._id,
	code: doc.code || '',
	name: doc.name || '',
	subtitle: doc.subtitle || '',
	plan_id: doc.plan_id || '',
	product_type: Number(doc.product_type ?? 0),
	affiliate_code: String(doc.affiliate_code || ''),
	priceLabel: doc.priceLabel || '',
	perks: Array.isArray(doc.perks) ? doc.perks : [],
	sort: Number(doc.sort ?? 0),
	checkoutPreviewUrl: buildAfdianOrderUrl(doc.plan_id, doc.product_type, doc.affiliate_code, '')
});

/** 将 query-sponsor 返回的单条 sponsor 转为订阅快照；须匹配 boundUserId */
const normalizeSubscriptionRow = (sponsorRow, boundUserId) => {
	const uid = sponsorRow?.user?.user_id;
	if (!uid || uid !== boundUserId) {
		return null;
	}

	const seen = new Set();
	const candidates = [];
	const pushPlan = (plan) => {
		if (!plan || !plan.plan_id || seen.has(plan.plan_id)) return;
		seen.add(plan.plan_id);
		candidates.push(plan);
	};

	pushPlan(sponsorRow.current_plan);
	const plans = Array.isArray(sponsorRow.sponsor_plans) ? sponsorRow.sponsor_plans : [];
	plans.forEach(pushPlan);

	const now = Math.floor(Date.now() / 1000);
	let chosen = null;

	for (let i = 0; i < candidates.length; i += 1) {
		const plan = candidates[i];
		const permanent = Number(plan.permanent) === 1;
		const exp = plan.expire_time != null ? Number(plan.expire_time) : 0;
		const active = permanent || exp > now;
		if (active) {
			chosen = plan;
			break;
		}
	}

	if (!chosen) {
		return {
			active: false,
			planName: '',
			plan_id: '',
			expireAt: 0,
			lastPayTime: sponsorRow.last_pay_time || 0,
			allSumAmount: sponsorRow.all_sum_amount || '0.00'
		};
	}

	return {
		active: true,
		planName: String(chosen.name || '').trim() || '赞助方案',
		plan_id: String(chosen.plan_id || '').trim(),
		expireAt: (() => {
			const permanent = Number(chosen.permanent) === 1;
			let exp = chosen.expire_time != null ? Number(chosen.expire_time) : 0;
			if (permanent && (!exp || exp <= now)) {
				exp = Math.floor(Date.now() / 1000) + 50 * 365 * 86400;
			}
			return exp;
		})(),
		lastPayTime: sponsorRow.last_pay_time || 0,
		allSumAmount: sponsorRow.all_sum_amount || '0.00'
	};
};

/** 分页调用 query-sponsor，查找创作者赞助列表中的指定爱发电 user_id */
const fetchSubscriptionForUser = async (cfg, afdianUserId) => {
	const token = String(cfg.AFDIAN_API_TOKEN || '').trim();
	const creatorUserId = String(cfg.AFDIAN_CREATOR_USER_ID || '').trim();
	if (!token || !creatorUserId) {
		throw new Error('服务端未配置 AFDIAN_API_TOKEN 或 AFDIAN_CREATOR_USER_ID');
	}

	let page = 1;
	let totalPage = 1;

	do {
		const ts = Math.floor(Date.now() / 1000);
		const paramsObj = { page };
		const sign = md5SignOpenApi(token, paramsObj, ts, creatorUserId);
		const payload = {
			user_id: creatorUserId,
			params: JSON.stringify(paramsObj),
			ts,
			sign
		};

		const json = await httpPostJson(OPEN_QUERY_SPONSOR_URL, payload);
		if (Number(json.ec) !== 200) {
			throw new Error(json.em || '查询赞助者失败');
		}

		const list = json.data?.list || [];
		totalPage = Number(json.data?.total_page) || 1;

		for (let i = 0; i < list.length; i += 1) {
			const normalized = normalizeSubscriptionRow(list[i], afdianUserId);
			if (normalized) {
				return normalized;
			}
		}

		page += 1;
	} while (page <= totalPage);

	return {
		active: false,
		planName: '',
		plan_id: '',
		expireAt: 0,
		lastPayTime: 0,
		allSumAmount: '0.00'
	};
};

module.exports = {
	/** 上架档位列表；空库时写入 DEFAULT_SUBSCRIBER_PLANS 示例（上线请替换真实 plan_id） */
	async listSubscriptionPlans() {
		await ensureDefaultSubscriberPlans();
		const db = uniCloud.database();
		const res = await db.collection(PLANS_COLLECTION).where({ enabled: true }).get();
		const raw = Array.isArray(res.data) ? res.data : [];
		raw.sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
		return {
			plans: raw.map(pickPublicPlan)
		};
	},

	/**
	 * 已登录用户：生成含 BIND 备注的下单链接，并记录 nonce。
	 * Webhook 收到支付成功后校验 nonce，将 patron 写入当前 app 用户。
	 */
	async getPlanSubscribeUrl(payload = {}) {
		const user = await getUserByAppToken(payload.token);
		const plan_id = String(payload.plan_id || '').trim();
		if (!plan_id) {
			throw new Error('请选择订阅档位');
		}

		await ensureDefaultSubscriberPlans();
		const db = uniCloud.database();
		const pr = await db.collection(PLANS_COLLECTION).where({ plan_id, enabled: true }).limit(1).get();
		const plan = Array.isArray(pr.data) ? pr.data[0] : null;
		if (!plan) {
			throw new Error('订阅档位不存在或已下架');
		}

		const nonce = crypto.randomBytes(8).toString('hex');
		const now = Date.now();
		await db.collection(BIND_NONCES_COLLECTION).add({
			nonce,
			userId: user.userId,
			plan_id,
			used: false,
			createdAt: now,
			expiresAt: now + BIND_NONCE_TTL_MS
		});

		const remark = `BIND:${nonce}|请勿删除或修改本备注-用于自动绑定App账号`;
		const subscribeUrl = buildAfdianOrderUrl(
			plan.plan_id,
			plan.product_type,
			plan.affiliate_code,
			remark
		);

		return {
			subscribeUrl,
			expiresAt: now + BIND_NONCE_TTL_MS,
			hint: '爱发电收银页的「备注」已含绑定信息：请勿删除、改写或覆盖整段备注；支付成功后才会自动关联当前账号'
		};
	},

	/**
	 * 已绑定爱发电身份时：优先 patron 镜像判断有效期；未激活且配置了 Token 时再 query-sponsor。
	 * 结果写入 app_users.afdianSubscription。
	 */
	async getSubscriptionStatus(payload = {}) {
		const user = await getUserByAppToken(payload.token);
		const afdianUserId = String(user.afdianUserId || '').trim();
		const afdianUserPrivateId = String(user.afdianUserPrivateId || '').trim();

		console.log('[afdian-subscriber] getSubscriptionStatus:dbUser', {
			userId: user.userId,
			hasAfdianUserId: Boolean(afdianUserId),
			hasPrivateId: Boolean(afdianUserPrivateId)
		});
		if (!afdianUserId && !afdianUserPrivateId) {
			console.log('[afdian-subscriber] getSubscriptionStatus:unbound return');
			return {
				bound: false,
				user: pickPublicUser(user),
				subscription: null
			};
		}

		const db = uniCloud.database();
		const patronKey = afdianUserPrivateId || afdianUserId;
		let mirror = null;
		const mirrorRes = await db.collection(MIRROR_COLLECTION).where({ patronKey }).limit(1).get();
		mirror = Array.isArray(mirrorRes.data) ? mirrorRes.data[0] : null;

		console.log('[afdian-subscriber] getSubscriptionStatus:mirror', {
			patronKeySet: Boolean(String(patronKey || '').trim()),
			mirrorHit: Boolean(mirror)
		});

		const { config } = readRuntimeConfig();
		const nowSec = Math.floor(Date.now() / 1000);
		let subscription = null;

		if (mirror && Number(mirror.expireAtSec || 0) > 0) {
			const expireAt = Number(mirror.expireAtSec || 0);
			subscription = {
				active: expireAt > nowSec,
				planName: String(mirror.planName || ''),
				plan_id: String(mirror.planId || ''),
				expireAt,
				lastPayTime: nowSec,
				allSumAmount: '0.00',
				source: 'webhook',
				checkedAt: Date.now()
			};
		}

		const hasApi = Boolean(String(config.AFDIAN_API_TOKEN || '').trim() && String(config.AFDIAN_CREATOR_USER_ID || '').trim());
		if ((!subscription || !subscription.active) && hasApi && afdianUserId) {
			try {
				const apiSub = await fetchSubscriptionForUser(config, afdianUserId);
				subscription = {
					...apiSub,
					source: 'api',
					checkedAt: Date.now()
				};
			} catch (e) {
				console.warn('[afdian-subscriber] getSubscriptionStatus:query-sponsor_error', {
					message: e?.message || String(e),
					hadMirrorSub: Boolean(subscription)
				});
				if (!subscription) {
					const existing =
						user.afdianSubscription && typeof user.afdianSubscription === 'object'
							? user.afdianSubscription
							: null;
					if (existing) {
						subscription = {
							...existing,
							checkedAt: Date.now(),
							source: existing.source === 'none' ? 'none' : existing.source || 'none'
						};
					} else {
						subscription = {
							active: false,
							planName: '',
							plan_id: '',
							expireAt: 0,
							lastPayTime: 0,
							allSumAmount: '0.00',
							source: 'none',
							checkedAt: Date.now()
						};
					}
					console.log('[afdian-subscriber] getSubscriptionStatus:fallback_subscription_after_api_error');
				}
			}
		}

		if (!subscription) {
			subscription = {
				active: false,
				planName: '',
				plan_id: '',
				expireAt: 0,
				lastPayTime: 0,
				allSumAmount: '0.00',
				source: 'none',
				checkedAt: Date.now()
			};
		}

		const checkedAt = subscription.checkedAt || Date.now();
		await db.collection(USER_COLLECTION).doc(user._id).update({
			afdianSubscription: {
				...subscription,
				checkedAt
			},
			updatedAt: checkedAt
		});

		console.log('[afdian-subscriber] getSubscriptionStatus:ok', {
			bound: true,
			active: subscription.active,
			source: subscription.source,
			expireAt: subscription.expireAt
		});

		return {
			bound: true,
			user: {
				...pickPublicUser(user),
				afdianUserId,
				afdianUserPrivateId,
				afdianSubscription: {
					...subscription,
					checkedAt
				}
			},
			subscription: {
				...subscription,
				checkedAt
			}
		};
	},

	/** 订单号兜底：订单须在 Webhook 表且 status=2；写入认领者与 app_users 上的赞助身份 */
	async claimOrderByTradeNo(payload = {}) {
		const user = await getUserByAppToken(payload.token);
		const out_trade_no = String(payload.out_trade_no || '').trim();
		if (!out_trade_no) {
			throw new Error('请输入订单号');
		}

		const db = uniCloud.database();
		const orderRes = await db.collection(ORDERS_COLLECTION).where({ out_trade_no }).limit(1).get();
		const orderDoc = Array.isArray(orderRes.data) ? orderRes.data[0] : null;

		if (!orderDoc || Number(orderDoc.status) !== 2) {
			throw new Error('未找到已支付成功的订单，请核对订单号或稍后再试（需等待 Webhook 同步）');
		}

		const existingClaim = String(orderDoc.claimedByAppUserId || '').trim();
		if (existingClaim && existingClaim !== user.userId) {
			throw new Error('该订单已绑定其他应用账号');
		}

		const patronKey = String(orderDoc.patronKey || '').trim();
		let mirror = null;
		if (patronKey) {
			const mr = await db.collection(MIRROR_COLLECTION).where({ patronKey }).limit(1).get();
			mirror = Array.isArray(mr.data) ? mr.data[0] : null;
		}

		const nowSec = Math.floor(Date.now() / 1000);
		let expireAt = mirror ? Number(mirror.expireAtSec || 0) : 0;
		if (!expireAt) {
			const months = Math.max(1, Number(orderDoc.month) || 1);
			expireAt = Number(orderDoc.receivedAtSec || nowSec) + months * 31 * 86400;
		}
		const subscription = {
			active: expireAt > nowSec,
			planName: String(mirror?.planName || orderDoc.planName || ''),
			plan_id: String(orderDoc.plan_id || mirror?.planId || ''),
			expireAt,
			lastPayTime: Number(orderDoc.receivedAtSec || nowSec),
			allSumAmount: String(orderDoc.total_amount || '0.00'),
			source: 'webhook',
			checkedAt: Date.now()
		};

		const newAfdianUserId = String(orderDoc.user_id || '').trim();
		const newAfdianUserPrivateId = String(orderDoc.user_private_id || '').trim();

		await db.collection(ORDERS_COLLECTION).doc(orderDoc._id).update({
			claimedByAppUserId: user.userId,
			claimedAt: Date.now()
		});

		await db.collection(USER_COLLECTION).doc(user._id).update({
			afdianUserId: newAfdianUserId,
			afdianUserPrivateId: newAfdianUserPrivateId,
			afdianSubscription: subscription,
			updatedAt: Date.now()
		});

		return {
			user: {
				...pickPublicUser(user),
				afdianUserId: newAfdianUserId,
				afdianUserPrivateId: newAfdianUserPrivateId,
				afdianSubscription: subscription
			}
		};
	}
};
