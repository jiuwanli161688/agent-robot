<template>
  <view class="page">
    <view class="card">
      <view class="title">忘记密码</view>
      <input v-model.trim="form.email" class="input" type="text" placeholder="请输入注册邮箱" />

      <view class="code-row">
        <input v-model.trim="form.emailCode" class="input code-input" type="number" maxlength="6" placeholder="邮箱验证码" />
        <button class="code-btn" :disabled="isCodeSending || codeCountdown > 0 || !isEmailValid" @click="handleSendCode">
          {{ codeCountdown > 0 ? `${codeCountdown}s` : "获取验证码" }}
        </button>
      </view>

      <input v-model="form.newPassword" class="input" type="password" placeholder="新密码（至少6位）" />
      <input v-model="form.confirmPassword" class="input" type="password" placeholder="确认新密码" />

      <button class="submit-btn" :disabled="isSubmitting" @click="handleSubmit">
        {{ isSubmitting ? "提交中..." : "重置密码" }}
      </button>

      <view class="footer">
        <text>记起密码了？</text>
        <text class="link" @click="goLogin">去登录</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from "@/config";
import { resetPasswordByEmail, sendResetPasswordCode } from "@/apis/user";

const form = reactive({
  email: "",
  emailCode: "",
  newPassword: "",
  confirmPassword: "",
});

const isSubmitting = ref(false);
const isCodeSending = ref(false);
const codeCountdown = ref(0);
let countdownTimer = null;

const isEmailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email));

const toast = (title) => {
  uni.showToast({
    title,
    icon: "none",
  });
};

const startCountdown = () => {
  codeCountdown.value = 60;
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    codeCountdown.value -= 1;
    if (codeCountdown.value <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
};

const handleSendCode = async () => {
  if (!isEmailValid.value) {
    toast("请输入正确邮箱");
    return;
  }
  isCodeSending.value = true;
  try {
    const result = await sendResetPasswordCode({ email: form.email });
    toast(result?.message || "验证码已发送");
    startCountdown();
  } catch (error) {
    const errorMsg = error?.message || "验证码发送失败";
    if (errorMsg.includes("未注册")) {
      uni.showModal({
        title: "提示",
        content: "该邮箱尚未注册，是否前往注册？",
        confirmText: "去注册",
        success: (res) => {
          if (res.confirm) {
            uni.navigateTo({ url: "/pages/user/register" });
          }
        },
      });
    } else {
      toast(errorMsg);
    }
  } finally {
    isCodeSending.value = false;
  }
};

const handleSubmit = async () => {
  if (!isEmailValid.value) {
    toast("请输入正确邮箱");
    return;
  }
  if (!/^\d{6}$/.test(form.emailCode)) {
    toast("请输入6位验证码");
    return;
  }
  if (!form.newPassword || form.newPassword.length < 6) {
    toast("新密码至少6位");
    return;
  }
  if (form.newPassword !== form.confirmPassword) {
    toast("两次密码不一致");
    return;
  }

  isSubmitting.value = true;
  try {
    const result = await resetPasswordByEmail({
      email: form.email,
      emailCode: form.emailCode,
      newPassword: form.newPassword,
      confirmPassword: form.confirmPassword,
    });
    uni.setStorageSync(AUTH_TOKEN_KEY, result?.token || "");
    uni.setStorageSync(AUTH_USER_KEY, result?.user || {});
    toast("密码已重置");
    setTimeout(() => {
      uni.reLaunch({ url: "/pages/chat/index" });
    }, 400);
  } catch (error) {
    toast(error?.message || "重置失败");
  } finally {
    isSubmitting.value = false;
  }
};

const goLogin = () => {
  uni.navigateBack({
    fail: () => uni.redirectTo({ url: "/pages/user/login" }),
  });
};

onBeforeUnmount(() => {
  clearInterval(countdownTimer);
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

.code-row {
  display: flex;
  gap: 12rpx;
  align-items: center;
  margin-bottom: 18rpx;
}

.code-input {
  margin-bottom: 0;
  flex: 1;
}

.code-btn {
  width: 230rpx;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 14rpx;
  font-size: 26rpx;
  background: #2563eb;
  color: #ffffff;
}

.code-btn[disabled] {
  background: #cbd5e1;
  color: #ffffff;
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
