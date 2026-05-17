<template>
  <view class="page">
    <view class="card">
      <view class="title">会员订阅</view>
      <view class="intro">
        <text class="intro-text">
          选择档位后将跳转爱发电收银。已登录时备注中会带有以 BIND:
          开头的绑定令牌，请勿删改，否则无法自动关联会员。
        </text>
      </view>

      <view v-if="plansLoading" class="muted">加载档位中…</view>
      <view v-else-if="!plans.length" class="muted">暂无订阅档位，请在云端数据库 subscriber_plans 配置。</view>
      <view v-else class="plan-list">
        <view v-for="p in plans" :key="p._id || p.plan_id" class="plan-card">
          <view class="plan-head">
            <text class="plan-name">{{ p.name }}</text>
            <text class="plan-price">{{ p.priceLabel }}</text>
          </view>
          <text v-if="p.subtitle" class="plan-sub">{{ p.subtitle }}</text>
          <view v-if="p.perks?.length" class="perks">
            <text v-for="(line, idx) in p.perks" :key="idx" class="perk-line">· {{ line }}</text>
          </view>
          <button class="btn-plan" :disabled="openingPlanId === p.plan_id" @click="handleSubscribe(p)">
            {{ openingPlanId === p.plan_id ? "跳转中…" : "去订阅" }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 会员订阅：已登录调用 getPlanSubscribeUrl（收银备注含 BIND，Webhook 关联账号）；
 * 未登录仅打开无 BIND 的预览链接。进入本页会静默刷新订阅快照到 AUTH_USER_KEY。
 */
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from "@/config";
import {
  getPlanSubscribeUrl,
  listSubscriptionPlans,
  mergeAuthUserAfterSubscriptionPull,
  refreshAfdianSubscription,
  SUBSCRIPTION_DEBUG_TAG,
} from "@/apis/subscriber";

const plans = ref([]);
const plansLoading = ref(false);
const openingPlanId = ref("");
const loggedIn = ref(false);

const toast = (title) => uni.showToast({ title, icon: "none" });

const nowUnixSec = () => Math.floor(Date.now() / 1000);

/** 订阅快照到期时间展示（秒 → 本地） */
const formatExpire = (sec) => {
  const n = Number(sec || 0);
  if (!n) return "—";
  const d = new Date(n * 1000);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 结合 subscriber_plans 解析当前在订档位 sort（sort 越大越高档，用于升降档判断） */
const resolveCurrentPlan = (plansList, user) => {
  const bound = Boolean(
    String(user?.afdianUserId || "").trim() || String(user?.afdianUserPrivateId || "").trim()
  );
  const sub = user?.afdianSubscription || {};
  const expireAt = Number(sub.expireAt || 0);
  const active = Boolean(sub.active) && expireAt > nowUnixSec();
  let plan_id = String(sub.plan_id || "").trim();
  if (!plan_id && sub.planName) {
    const nm = String(sub.planName || "").trim();
    const byName = plansList.find((x) => String(x.name || "").trim() === nm);
    if (byName) plan_id = String(byName.plan_id || "").trim();
  }
  const row = plansList.find((x) => String(x.plan_id) === plan_id);
  const sort = row ? Number(row.sort ?? 0) : 0;
  return { bound, active, expireAt, plan_id, sort, planName: String(sub.planName || "") };
};

/**
 * new：未绑定或无有效订阅
 * same：同 plan_id
 * upgrade / downgrade：按 sort 比较
 * unknown_tier：在订但无法匹配本地档位 sort，不拦截降档（仅提示）
 */
const classifyTierChange = (current, targetPlan) => {
  if (!current.bound || !current.active) return "new";
  const tPid = String(targetPlan.plan_id || "").trim();
  const cPid = current.plan_id;
  if (cPid && tPid && cPid === tPid) return "same";
  const tSort = Number(targetPlan.sort ?? 0);
  const cSort = Number(current.sort ?? 0);
  if (cSort === 0) return "unknown_tier";
  if (tSort > cSort) return "upgrade";
  if (tSort < cSort) return "downgrade";
  return "same";
};

const confirmModal = (opts) =>
  new Promise((resolve) => {
    uni.showModal({
      ...opts,
      success: (res) => resolve(Boolean(res.confirm)),
    });
  });

const refreshUserSubscriptionSnapshot = async () => {
  try {
    const res = await refreshAfdianSubscription();
    const prev = uni.getStorageSync(AUTH_USER_KEY) || {};
    const next = mergeAuthUserAfterSubscriptionPull(prev, res);
    uni.setStorageSync(AUTH_USER_KEY, next);
    console.log(SUBSCRIPTION_DEBUG_TAG, "subscriber refreshUserSubscriptionSnapshot merged", {
      bound: res?.bound,
    });
  } catch (e) {
    console.warn(SUBSCRIPTION_DEBUG_TAG, "subscriber refreshUserSubscriptionSnapshot failed", e?.message || e);
  }
};

/** App 外链打开；H5 跳转；其余端复制链接 */
const openExternalUrl = (url) => {
  if (!url) return;
  if (typeof plus !== "undefined" && plus.runtime?.openURL) {
    plus.runtime.openURL(url);
    return;
  }
  // #ifdef H5
  if (typeof window !== "undefined") {
    window.location.href = url;
    return;
  }
  // #endif
  uni.setClipboardData({
    data: url,
    success: () => toast("链接已复制，请在浏览器打开"),
  });
};

/** @param variant 'bind' 需保留备注绑定；'guest' 未登录预览链接 */
const confirmOpenAfdianCheckout = (url, variant = "guest") => {
  if (!url) return;
  const contentBind =
    "即将前往爱发电完成支付。\n\n【重要】收银页的「备注」已自动填入绑定令牌（以 BIND: 开头）。该内容为系统自动生成，请勿删除、修改或追加无关文字，否则当前账号无法自动开通订阅。\n若误改请关闭页面，返回本 App 重新发起订阅；也可在支付成功后使用订单号手动认领。";
  const contentGuest =
    "即将前往爱发电完成支付。当前未登录，无法自动绑定账号；支付后需在 App 内使用订单号认领，或先登录再订阅。";
  uni.showModal({
    title: "跳转爱发电",
    content: variant === "bind" ? contentBind : contentGuest,
    confirmText: "去支付",
    cancelText: "取消",
    success: (res) => {
      if (res.confirm) openExternalUrl(url);
    },
  });
};

/** 云库 subscriber_plans → plans（含 checkoutPreviewUrl） */
const loadPlans = async () => {
  plansLoading.value = true;
  try {
    const res = await listSubscriptionPlans();
    plans.value = Array.isArray(res?.plans) ? res.plans : [];
  } catch (e) {
    plans.value = [];
    toast(e?.message || "档位加载失败");
  } finally {
    plansLoading.value = false;
  }
};

/** 未登录：预览链接；已登录：先刷新订阅快照，再按同档/升降档提示 */
const handleSubscribe = async (p) => {
  const planId = String(p?.plan_id || "").trim();
  if (!planId) {
    toast("方案无效");
    return;
  }
  if (!loggedIn.value) {
    toast("请先登录以启用自动绑定（或通过订单号认领）");
    confirmOpenAfdianCheckout(p.checkoutPreviewUrl, "guest");
    return;
  }
  openingPlanId.value = planId;
  try {
    await refreshUserSubscriptionSnapshot();
    const user = uni.getStorageSync(AUTH_USER_KEY) || {};
    const current = resolveCurrentPlan(plans.value, user);
    const tier = classifyTierChange(current, p);

    if (tier === "downgrade") {
      await confirmModal({
        title: "温馨提示",
        content:
          "当前订阅仍在有效期内，如需更换为更低档位，请在当前权益到期后再操作。",
        showCancel: false,
        confirmText: "我知道了",
      });
      return;
    }

    if (tier === "same") {
      const ok = await confirmModal({
        title: "续订说明",
        content:
          "你已订阅该档位。再次支付将在爱发电侧叠加延长有效期（具体规则以收银页与爱发电为准），是否继续？",
        confirmText: "继续",
        cancelText: "取消",
      });
      if (!ok) return;
    } else if (tier === "upgrade") {
      const until = formatExpire(current.expireAt);
      const ok = await confirmModal({
        title: "升级订阅",
        content: `即将升级到更高档位。\n当前权益预计有效期至：${until}\n支付成功后权益与爱发电订单同步，是否继续？`,
        confirmText: "继续",
        cancelText: "取消",
      });
      if (!ok) return;
    } else if (tier === "unknown_tier") {
      const ok = await confirmModal({
        title: "继续支付",
        content:
          "检测到当前仍有有效订阅，但未能与本地档位表完全匹配。将继续跳转爱发电收银，升降档及时长以爱发电页面为准，是否继续？",
        confirmText: "继续",
        cancelText: "取消",
      });
      if (!ok) return;
    }

    const res = await getPlanSubscribeUrl({ plan_id: planId });
    const url = res?.subscribeUrl;
    if (!url) {
      toast("未生成链接");
      return;
    }
    confirmOpenAfdianCheckout(url, "bind");
  } catch (error) {
    toast(error?.message || "无法发起订阅");
  } finally {
    openingPlanId.value = "";
  }
};

const refreshSessionState = () => {
  const token = uni.getStorageSync(AUTH_TOKEN_KEY);
  loggedIn.value = Boolean(token);
};

onShow(async () => {
  refreshSessionState();
  await loadPlans();
  if (loggedIn.value) {
    try {
      const res = await refreshAfdianSubscription();
      const prev = uni.getStorageSync(AUTH_USER_KEY) || {};
      const next = mergeAuthUserAfterSubscriptionPull(prev, res);
      uni.setStorageSync(AUTH_USER_KEY, next);
      console.log(SUBSCRIPTION_DEBUG_TAG, "subscriber onShow merged", { bound: res?.bound });
    } catch (e) {
      console.warn(
        SUBSCRIPTION_DEBUG_TAG,
        "subscriber onShow refresh failed（未绑定或云对象异常时常见）",
        e?.message || e
      );
    }
  }
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: 28rpx;
  box-sizing: border-box;
}

.card {
  background: #ffffff;
  border-radius: 20rpx;
  padding: 32rpx 28rpx;
  box-shadow: 0 12rpx 34rpx rgba(15, 23, 42, 0.08);
}

.title {
  font-size: 38rpx;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 18rpx;
}

.intro {
  font-size: 26rpx;
  color: #64748b;
  line-height: 1.55;
  margin-bottom: 24rpx;
}

.intro-text {
  color: #64748b;
}

.muted {
  font-size: 26rpx;
  color: #94a3b8;
  margin-bottom: 16rpx;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-bottom: 28rpx;
}

.plan-card {
  border: 1rpx solid #e2e8f0;
  border-radius: 16rpx;
  padding: 22rpx;
  background: #fafbfc;
}

.plan-head {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: baseline;
  gap: 16rpx;
}

.plan-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #0f172a;
}

.plan-price {
  font-size: 26rpx;
  color: #2563eb;
  flex-shrink: 0;
}

.plan-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #64748b;
}

.perks {
  margin-top: 14rpx;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.perk-line {
  font-size: 24rpx;
  color: #475569;
}

.btn-plan {
  margin-top: 18rpx;
  height: 76rpx;
  line-height: 76rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  background: #0f172a;
  color: #ffffff;
}

.btn-plan[disabled] {
  opacity: 0.55;
}
</style>
