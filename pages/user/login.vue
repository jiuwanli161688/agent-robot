<template>
  <view class="page">
    <view class="card">
      <view class="title">邮箱登录</view>
      <input v-model.trim="form.email" class="input" type="text" placeholder="请输入邮箱" />
      <input v-model="form.password" class="input" type="password" placeholder="请输入密码" />

      <button class="submit-btn" :disabled="isSubmitting" @click="handleLogin">
        {{ isSubmitting ? "登录中..." : "登录" }}
      </button>

      <view class="footer">
        <text>还没有账号？</text>
        <text class="link" @click="goRegister">去注册</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from "@/config";
import { loginByEmail } from "@/apis/user";

const form = reactive({
  email: "",
  password: "",
});
const isSubmitting = ref(false);

const toast = (title) => {
  uni.showToast({
    title,
    icon: "none",
  });
};

const isEmailValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const handleLogin = async () => {
  if (!isEmailValid(form.email)) {
    toast("请输入正确邮箱");
    return;
  }
  if (!form.password) {
    toast("请输入密码");
    return;
  }
  isSubmitting.value = true;
  try {
    const result = await loginByEmail({
      email: form.email,
      password: form.password,
    });
    uni.setStorageSync(AUTH_TOKEN_KEY, result?.token || "");
    uni.setStorageSync(AUTH_USER_KEY, result?.user || {});
    toast("登录成功");
    setTimeout(() => {
      uni.reLaunch({ url: "/pages/chat/index" });
    }, 350);
  } catch (error) {
    toast(error?.message || "登录失败");
  } finally {
    isSubmitting.value = false;
  }
};

const goRegister = () => {
  uni.navigateTo({ url: "/pages/user/register" });
};

onShow(() => {
  const token = uni.getStorageSync(AUTH_TOKEN_KEY);
  if (!token) return;
  uni.reLaunch({ url: "/pages/chat/index" });
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
  margin-top: 120rpx;
}

.title {
  font-size: 38rpx;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 26rpx;
}

.input {
  width: 100%;
  height: 84rpx;
  border: 1rpx solid #dbe2ea;
  border-radius: 14rpx;
  box-sizing: border-box;
  padding: 0 22rpx;
  font-size: 28rpx;
  margin-bottom: 18rpx;
  background: #fff;
}

.submit-btn {
  margin-top: 12rpx;
  height: 86rpx;
  line-height: 86rpx;
  border-radius: 14rpx;
  background: #0f172a;
  color: #ffffff;
  font-size: 30rpx;
}

.submit-btn[disabled] {
  background: #94a3b8;
}

.footer {
  margin-top: 24rpx;
  text-align: center;
  color: #64748b;
  font-size: 26rpx;
}

.link {
  margin-left: 8rpx;
  color: #2563eb;
}
</style>
