import { AUTH_TOKEN_KEY } from "@/config";

/**
 * 爱发电订阅：封装云对象 `afdian-subscriber`。
 * 主路径：档位列表 → 带 BIND 备注的收银链接（Webhook 自动绑账号）；`claimAfdianOrder` 为订单号兜底认领。
 */
export const SUBSCRIPTION_DEBUG_TAG = "[afdianSubscription]";

const afdianSubscriber = uniCloud.importObject("afdian-subscriber");

/**
 * 云端 `bound:false` 时返回的 user 不含 afdian* 字段，若直接 `{...prev,...res.user}` 会沿用本地旧 ID，绑定态会误判。
 */
export function mergeAuthUserAfterSubscriptionPull(prevUser, statusRes) {
  const pu =
    typeof prevUser === "object" && prevUser !== null && !Array.isArray(prevUser) ? prevUser : {};
  if (!statusRes) {
    return pu;
  }
  if (statusRes.bound === false) {
    const u = typeof statusRes.user === "object" && statusRes.user !== null ? statusRes.user : {};
    return {
      ...pu,
      ...u,
      afdianUserId: "",
      afdianUserPrivateId: "",
      afdianSubscription: null,
    };
  }
  return { ...pu, ...(statusRes.user || {}) };
}

/** 读镜像 / 必要时 query-sponsor，并写回用户的 `afdianSubscription` */
export const refreshAfdianSubscription = async () => {
  const token = uni.getStorageSync(AUTH_TOKEN_KEY);
  console.log(SUBSCRIPTION_DEBUG_TAG, "refreshAfdianSubscription start", {
    hasToken: Boolean(String(token || "").trim()),
  });
  try {
    const res = await afdianSubscriber.getSubscriptionStatus({ token });
    const u = res?.user || {};
    console.log(SUBSCRIPTION_DEBUG_TAG, "refreshAfdianSubscription ok", {
      bound: res?.bound,
      afdianUserId: Boolean(String(u.afdianUserId || "").trim()),
      afdianUserPrivateId: Boolean(String(u.afdianUserPrivateId || "").trim()),
      subActive: res?.subscription?.active,
      source: res?.subscription?.source,
    });
    return res;
  } catch (err) {
    console.warn(SUBSCRIPTION_DEBUG_TAG, "refreshAfdianSubscription error", err?.message || err, err);
    throw err;
  }
};

/** `out_trade_no` 需在 Webhook 落库且支付成功（status=2） */
export const claimAfdianOrder = (payload) =>
  afdianSubscriber.claimOrderByTradeNo({
    token: uni.getStorageSync(AUTH_TOKEN_KEY),
    ...(payload || {}),
  });

/** 读库 `subscriber_plans`，含未登录预览用的 `checkoutPreviewUrl`（无 BIND） */
export const listSubscriptionPlans = () => afdianSubscriber.listSubscriptionPlans();

/** 已登录：写入一次性 nonce，下单链接备注含 `BIND:<nonce>` */
export const getPlanSubscribeUrl = (payload) =>
  afdianSubscriber.getPlanSubscribeUrl({
    token: uni.getStorageSync(AUTH_TOKEN_KEY),
    ...(payload || {}),
  });
