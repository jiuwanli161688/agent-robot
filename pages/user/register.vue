<template>
  <view class="page">
    <view class="card">
      <view class="title">创建账号</view>

      <view class="avatar-row">
        <image class="avatar" :src="form.avatar || defaultAvatar" mode="aspectFill" />
        <button class="avatar-btn" size="mini" @click="handleChooseAvatar">选择头像</button>
      </view>

      <input v-model.trim="form.username" class="input" placeholder="请输入用户名" />
      <input v-model.trim="form.avatar" class="input" placeholder="头像地址（可选）" />
      <input v-model.trim="form.email" class="input" type="text" placeholder="请输入邮箱" />

      <view class="code-row">
        <input v-model.trim="form.emailCode" class="input code-input" type="number" maxlength="6" placeholder="请输入邮箱验证码" />
        <button class="code-btn" :disabled="isCodeSending || codeCountdown > 0 || !isEmailValid" @click="handleSendCode">
          {{ codeCountdown > 0 ? `${codeCountdown}s` : "获取验证码" }}
        </button>
      </view>

      <input v-model="form.password" class="input" type="password" placeholder="请输入密码（至少6位）" />
      <input v-model="form.confirmPassword" class="input" type="password" placeholder="请再次输入密码" />

      <button class="submit-btn" :disabled="isSubmitting" @click="handleRegister">
        {{ isSubmitting ? "注册中..." : "注册" }}
      </button>

      <view class="footer">
        <text>已有账号？</text>
        <text class="link" @click="goLogin">去登录</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { registerByEmail, sendEmailCode } from "@/apis/user";

const defaultAvatar = "https://dummyimage.com/200x200/edf2f7/94a3b8.png&text=Avatar";
const form = reactive({
  avatar: "",
  username: "",
  email: "",
  emailCode: "",
  password: "",
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

const handleChooseAvatar = () => {
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: (res) => {
      const filePath = res?.tempFilePaths?.[0];
      if (!filePath) return;
      form.avatar = filePath;
    },
  });
};

const handleSendCode = async () => {
  if (!isEmailValid.value) {
    toast("请输入正确邮箱");
    return;
  }
  isCodeSending.value = true;
  try {
    const result = await sendEmailCode({ email: form.email });
    toast(result?.message || "验证码已发送");
    if (result?.devCode) {
      toast(`演示验证码：${result.devCode}`);
    }
    startCountdown();
  } catch (error) {
    toast(error?.message || "验证码发送失败");
  } finally {
    isCodeSending.value = false;
  }
};

const validateRegisterForm = () => {
  if (!form.username) return "请输入用户名";
  if (!isEmailValid.value) return "请输入正确邮箱";
  if (!/^\d{6}$/.test(form.emailCode)) return "请输入6位验证码";
  if (!form.password || form.password.length < 6) return "密码至少6位";
  if (form.password !== form.confirmPassword) return "两次密码不一致";
  return "";
};

const handleRegister = async () => {
  const invalidMessage = validateRegisterForm();
  if (invalidMessage) {
    toast(invalidMessage);
    return;
  }
  isSubmitting.value = true;
  try {
    await registerByEmail({
      avatar: form.avatar,
      username: form.username,
      email: form.email,
      emailCode: form.emailCode,
      password: form.password,
      confirmPassword: form.confirmPassword,
    });
    toast("注册成功");
    setTimeout(() => {
      uni.redirectTo({ url: "/pages/user/login" });
    }, 500);
  } catch (error) {
    toast(error?.message || "注册失败");
  } finally {
    isSubmitting.value = false;
  }
};

const goLogin = () => {
  uni.redirectTo({ url: "/pages/user/login" });
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
}

.title {
  font-size: 38rpx;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 26rpx;
}

.avatar-row {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.avatar {
  width: 110rpx;
  height: 110rpx;
  border-radius: 50%;
  background: #e2e8f0;
}

.avatar-btn {
  margin-left: 20rpx;
  font-size: 24rpx;
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
