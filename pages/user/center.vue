<template>
  <view class="page">
    <view class="card profile-card">
      <view class="title">用户中心</view>
      <view v-if="!loggedIn" class="muted-row">
        <text>未登录</text>
        <text class="link" @click="goLogin">去登录</text>
      </view>
      <view v-else class="profile-body">
        <image class="avatar" :src="user.avatar || defaultAvatar" mode="aspectFill" />
        <view class="info">
          <text class="name">{{ user.username || "用户" }}</text>
          <text class="email">{{ user.email || "" }}</text>
        </view>
      </view>
    </view>

    <view class="card section-card">
      <view class="section-title">爱发电订阅</view>
      <view v-if="!loggedIn" class="muted-row">登录后可查看与云端同步的赞助状态。</view>
      <view v-else class="afdian-rows">
        <view class="row">
          <text class="k">绑定</text>
          <text :class="['v', subscription.bound ? 'ok' : '']">{{ subscription.bound ? "已关联" : "未关联" }}</text>
        </view>
        <view class="row">
          <text class="k">权益</text>
          <text :class="['v', subscription.active ? 'ok' : 'warn']">{{
            subscription.active ? "有效期内" : "未生效或过期"
          }}</text>
        </view>
        <text v-if="subscription.planName" class="plan-line">{{ subscription.planName }}</text>
        <text v-if="subscription.expireLabel" class="expire-line">到期：{{ subscription.expireLabel }}</text>
      </view>
      <button class="btn" @click="goSubscriber">管理订阅 / 支付</button>
      <button class="btn light" :disabled="syncing || !loggedIn" @click="syncSubscription">
        {{ syncing ? "同步中…" : "同步订阅状态" }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from "@/config";
import {
  mergeAuthUserAfterSubscriptionPull,
  refreshAfdianSubscription,
  SUBSCRIPTION_DEBUG_TAG,
} from "@/apis/subscriber";

const defaultAvatar = "https://dummyimage.com/200x200/edf2f7/94a3b8.png&text=Me";

const loggedIn = ref(false);
const user = ref({});
const syncing = ref(false);

const subscription = reactive({
  bound: false,
  active: false,
  planName: "",
  expireLabel: "",
});

const toast = (title) => uni.showToast({ title, icon: "none" });

const formatTs = (sec) => {
  const n = Number(sec || 0);
  if (!n) return "";
  const d = new Date(n * 1000);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const syncFromStorage = () => {
  const u = uni.getStorageSync(AUTH_USER_KEY) || {};
  user.value = u;
  const sub = u?.afdianSubscription;
  const uid = String(u?.afdianUserId || "").trim();
  const pid = String(u?.afdianUserPrivateId || "").trim();
  subscription.bound = Boolean(uid || pid);
  subscription.active = Boolean(sub?.active);
  subscription.planName = String(sub?.planName || "");
  subscription.expireLabel = sub?.expireAt ? formatTs(sub.expireAt) : "";
  console.log(SUBSCRIPTION_DEBUG_TAG, "center syncFromStorage", {
    userId: u?.userId || u?.id,
    bound: subscription.bound,
    active: subscription.active,
    expireAt: sub?.expireAt,
    uidLen: uid.length,
    pidLen: pid.length,
  });
};

const syncSubscription = async () => {
  if (!loggedIn.value) return;
  syncing.value = true;
  try {
    const res = await refreshAfdianSubscription();
    const prev = uni.getStorageSync(AUTH_USER_KEY) || {};
    const next = mergeAuthUserAfterSubscriptionPull(prev, res);
    uni.setStorageSync(AUTH_USER_KEY, next);
    console.log(SUBSCRIPTION_DEBUG_TAG, "center syncSubscription merged", {
      bound: res?.bound,
      nextBound: Boolean(
        String(next.afdianUserId || "").trim() || String(next.afdianUserPrivateId || "").trim()
      ),
    });
    syncFromStorage();
    toast(res?.subscription?.active ? "已同步：当前有效" : "已同步");
  } catch (e) {
    console.warn(SUBSCRIPTION_DEBUG_TAG, "center syncSubscription failed", e?.message || e);
    toast(e?.message || "同步失败");
  } finally {
    syncing.value = false;
  }
};

const pullSubscriptionSilent = async () => {
  if (!loggedIn.value) return;
  try {
    const res = await refreshAfdianSubscription();
    const prev = uni.getStorageSync(AUTH_USER_KEY) || {};
    const next = mergeAuthUserAfterSubscriptionPull(prev, res);
    uni.setStorageSync(AUTH_USER_KEY, next);
    console.log(SUBSCRIPTION_DEBUG_TAG, "center pullSubscriptionSilent merged", { bound: res?.bound });
    syncFromStorage();
  } catch (e) {
    console.warn(
      SUBSCRIPTION_DEBUG_TAG,
      "center pullSubscriptionSilent skipped (仍使用本地缓存，常见原因：云对象报错、网络、或 Open API 失败)",
      e?.message || e
    );
  }
};

const goLogin = () => uni.navigateTo({ url: "/pages/user/login" });
const goSubscriber = () => uni.navigateTo({ url: "/pages/subscriber/index" });

onShow(() => {
  loggedIn.value = Boolean(uni.getStorageSync(AUTH_TOKEN_KEY));
  console.log(SUBSCRIPTION_DEBUG_TAG, "center onShow", { loggedIn: loggedIn.value });
  syncFromStorage();
  pullSubscriptionSilent();
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
  padding: 28rpx;
  margin-bottom: 22rpx;
  box-shadow: 0 12rpx 34rpx rgba(15, 23, 42, 0.06);
}

.title {
  font-size: 36rpx;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 20rpx;
}

.profile-body {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 22rpx;
}

.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 60rpx;
  background: #e2e8f0;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.name {
  font-size: 32rpx;
  font-weight: 600;
  color: #0f172a;
}

.email {
  font-size: 26rpx;
  color: #64748b;
  word-break: break-all;
}

.muted-row {
  font-size: 28rpx;
  color: #64748b;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 16rpx;
}

.afdian-rows {
  margin-bottom: 18rpx;
}

.row {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.k {
  font-size: 28rpx;
  color: #64748b;
}

.v {
  font-size: 28rpx;
  font-weight: 500;
  color: #94a3b8;
}

.v.ok {
  color: #15803d;
}

.v.warn {
  color: #c2410c;
}

.plan-line {
  display: block;
  font-size: 26rpx;
  color: #334155;
  margin-top: 8rpx;
}

.expire-line {
  display: block;
  font-size: 24rpx;
  color: #94a3b8;
  margin-top: 6rpx;
}

.btn {
  margin-top: 14rpx;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 14rpx;
  font-size: 28rpx;
  background: #0f172a;
  color: #ffffff;
}

.btn.light {
  background: #f1f5f9;
  color: #0f172a;
}

.btn.ghost {
  background: transparent;
  border: 1rpx solid #cbd5e1;
  color: #475569;
}

.btn[disabled] {
  opacity: 0.55;
}

.link {
  margin-left: 12rpx;
  color: #2563eb;
}
</style>
