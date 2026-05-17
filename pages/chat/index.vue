<template>
  <view>
    <view class="ai-widget-container">
      <view v-if="isOpen" class="chat-panel">
        <view class="chat-header">
          <text class="title">AI智能专家</text>
          <IndustryPicker :options="industryOptions" :value="industryIndex" :disabled="isTyping" @change="handleIndustryChange" />
        </view>

        <scroll-view class="chat-content" scroll-y :scroll-into-view="scrollIntoViewId" :scroll-with-animation="true">
          <view v-if="showDefaultQuestions" class="default-questions">
            <view class="default-questions-title">你可以试试：</view>
            <view class="default-questions-list">
              <view
                v-for="(q, qIndex) in defaultQuestions"
                :key="`${currentIndustry.value}-${qIndex}`"
                class="default-question-chip"
                :class="{ disabled: isTyping }"
                @click="!isTyping && handleDefaultQuestionClick(q)"
              >
                <text class="default-question-text">{{ q }}</text>
              </view>
            </view>
          </view>

          <view
            v-for="(msg, index) in chatList"
            :id="`msg-${index}`"
            :key="index"
            :class="['msg-bubble', msg.role]"
          >
            <rich-text
              v-if="msg.role === 'assistant'"
              class="md-content"
              :nodes="renderMarkdown(msg.content)"
            />
            <text v-else class="msg-text">{{ msg.content }}</text>
            <text class="copy-icon" @click.stop="handleCopy(msg.content)">⧉</text>
          </view>
          <view v-if="isTyping" id="typing-msg" class="msg-bubble assistant">
            <rich-text class="md-content" :nodes="renderMarkdown(streamingText || '...')" />
          </view>
        </scroll-view>

        <view class="input-area">
          <input
            v-model="userInput"
            class="chat-input"
            :disabled="isTyping"
            placeholder="请输入"
            confirm-type="send"
            @confirm="handleSend"
          />
          <button v-if="isTyping" class="stop-btn" @click="handleStop">
            终止
          </button>
          <button v-else class="send-btn" :disabled="!userInput.trim()" @click="handleSend">
            发送
          </button>
        </view>
      </view>

      <view class="chat-trigger" @click="isOpen = !isOpen">
        <text class="trigger-text">{{ isOpen ? '×' : '💬' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { getDefaultQuestions, industryOptions } from "@/static/knowledgebase/industryOptions";
import IndustryPicker from "./components/IndustryPicker.vue";
import { requestChatProxy } from "@/apis/chat.js";
import { renderMarkdown } from "@/utils/markdown.js";
import { AUTH_TOKEN_KEY } from "@/config";

const isOpen = ref(true);
const userInput = ref("");
const currentIndustry = ref("beauty");
const industryIndex = ref(Math.max(0, industryOptions.findIndex((item) => item.value === currentIndustry.value)));
const isTyping = ref(false);
const streamingText = ref("");
const scrollIntoViewId = ref("");
const STREAM_DELAY_MS = 20;
const activeTaskId = ref(0);
const cancelledTaskId = ref(0);

const getWelcomeMessage = (industryValue) => {
  const industry = industryOptions.find((item) => item.value === industryValue);
  const industryLabel = industry?.label || "🌍 全能助手";
  return `您好！我是您的专属 ${industryLabel}，请问有什么可以帮您？`;
};
const chatList = ref([]);

const defaultQuestions = computed(() => getDefaultQuestions(currentIndustry.value));
const showDefaultQuestions = computed(() => {
  if (isTyping.value) return false;
  return chatList.value.length === 0 && defaultQuestions.value.length > 0;
});

const scrollToBottom = async () => {
  await nextTick();
  if (isTyping.value) {
    scrollIntoViewId.value = "typing-msg";
    return;
  }
  const lastIndex = chatList.value.length - 1;
  if (lastIndex >= 0) {
    scrollIntoViewId.value = `msg-${lastIndex}`;
  }
};

watch(chatList, () => {
  scrollToBottom();
}, { deep: true });

watch(streamingText, () => {
  if (isTyping.value) {
    scrollToBottom();
  }
});

const handleIndustryChange = (e) => {
  if (isTyping.value) return;
  const index = Number(e.detail.value || 0);
  industryIndex.value = index;
  currentIndustry.value = industryOptions[index].value;

  chatList.value = [];
  userInput.value = "";
  streamingText.value = "";
  scrollIntoViewId.value = "";
};

const normalizeResponseText = (data) => {
  if (typeof data === "string") return data;
  if (typeof data?.content === "string") return data.content;
  if (typeof data?.reply === "string") return data.reply;
  if (typeof data?.result === "string") return data.result;
  if (typeof data?.error === "string") return `服务异常：${data.error}`;
  if (typeof data?.message === "string") return `服务异常：${data.message}`;
  return "抱歉，服务暂时不可用。";
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getChunkSize = (textLength) => {
  if (textLength > 1200) return 12;
  if (textLength > 700) return 8;
  if (textLength > 350) return 4;
  return 2;
};

const streamReplyText = async (text, taskId) => {
  const safeText = typeof text === "string" ? text : "";
  streamingText.value = "";
  if (!safeText) return;

  const chunkSize = getChunkSize(safeText.length);
  for (let i = 0; i < safeText.length; i += chunkSize) {
    if (cancelledTaskId.value === taskId) return;
    streamingText.value += safeText.slice(i, i + chunkSize);
    await sleep(STREAM_DELAY_MS);
  }
};

const sendText = async (text) => {
  const userText = typeof text === "string" ? text.trim() : "";
  if (!userText || isTyping.value) return;

  const taskId = activeTaskId.value + 1;
  activeTaskId.value = taskId;

  chatList.value.push({ role: "user", content: userText });
  userInput.value = "";
  isTyping.value = true;
  streamingText.value = "...";
  await scrollToBottom();

  try {
    const result = await requestChatProxy({
      messages: chatList.value.slice(-5),
      industry: currentIndustry.value,
    });
    if (cancelledTaskId.value === taskId) return;
    const replyText = normalizeResponseText(result);
    await streamReplyText(replyText, taskId);
    if (cancelledTaskId.value === taskId) return;
    chatList.value.push({ role: "assistant", content: streamingText.value || replyText });
  } catch (error) {
    if (cancelledTaskId.value === taskId) return;
    chatList.value.push({ role: "assistant", content: "抱歉，连接服务器失败。" });
  } finally {
    if (activeTaskId.value === taskId) {
      isTyping.value = false;
      streamingText.value = "";
    }
    await scrollToBottom();
  }
};

const handleSend = async () => {
  await sendText(userInput.value);
};

const handleDefaultQuestionClick = async (q) => {
  await sendText(q);
};

const handleStop = async () => {
  if (!isTyping.value) return;
  cancelledTaskId.value = activeTaskId.value;
  isTyping.value = false;
  streamingText.value = "";
  await scrollToBottom();
};

const handleCopy = (content) => {
  const text = typeof content === "string" ? content : "";
  if (!text) return;
  uni.setClipboardData({
    data: text,
    success: () => {
      uni.showToast({
        title: "已复制",
        icon: "none",
      });
    },
  });
};

const ensureLogin = () => {
  const token = uni.getStorageSync(AUTH_TOKEN_KEY);
  if (token) return;
  uni.reLaunch({
    url: "/pages/user/login",
  });
};

onShow(() => {
  ensureLogin();
});
</script>

<style scoped>
.ai-widget-container {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 999;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
}

.chat-panel {
  width: 680rpx;
  height: 900rpx;
  border-radius: 24rpx;
  background-color: #ffffff;
  overflow: hidden;
  box-shadow: 0 12rpx 40rpx rgba(0, 0, 0, 0.15);
  pointer-events: auto;
}

.chat-header {
  padding: 24rpx;
  background-color: #007aff;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 30rpx;
  font-weight: 600;
}

.chat-content {
  height: 680rpx;
  padding: 24rpx;
  background-color: #f7f8fa;
  box-sizing: border-box;
}

.default-questions {
  margin-bottom: 18rpx;
}

.default-questions-title {
  font-size: 24rpx;
  color: #64748b;
  margin-bottom: 12rpx;
}

.default-questions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.default-question-chip {
  max-width: 100%;
  padding: 14rpx 16rpx;
  border-radius: 16rpx;
  background-color: rgba(255, 255, 255, 0.9);
  border: 1rpx solid #e5e7eb;
}

.default-question-chip.disabled {
  opacity: 0.6;
}

.default-question-text {
  font-size: 26rpx;
  color: #0f172a;
  line-height: 1.4;
}

.msg-bubble {
  position: relative;
  margin-bottom: 16rpx;
  padding: 16rpx 20rpx 44rpx;
  border-radius: 16rpx;
  width: fit-content;
  max-width: 82%;
  box-sizing: border-box;
}

.msg-text {
  font-size: 28rpx;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.md-content {
  font-size: 28rpx;
  line-height: 1.8;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.copy-icon {
  position: absolute;
  right: 12rpx;
  bottom: 8rpx;
  font-size: 24rpx;
  line-height: 1;
  color: #94a3b8;
}

.user .copy-icon {
  color: rgba(255, 255, 255, 0.8);
}

.user {
  margin-left: auto;
  background-color: #007aff;
}

.user .msg-text {
  color: #ffffff;
}

.assistant {
  margin-right: auto;
  background-color: #ffffff;
  border: 1rpx solid #eef0ff;
}

.assistant .msg-text {
  color: #333333;
}

.input-area {
  border-top: 1rpx solid #eeeeee;
  padding: 18rpx;
  display: flex;
  align-items: center;
  background-color: #ffffff;
}

.chat-input {
  flex: 1;
  height: 72rpx;
  padding: 0 20rpx;
  border: 1rpx solid #dddddd;
  border-radius: 12rpx;
  font-size: 28rpx;
  background-color: #ffffff;
}

.send-btn {
  margin-left: 14rpx;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 26rpx;
  border-radius: 12rpx;
  background-color: #007aff;
  color: #ffffff;
  font-size: 28rpx;
}

.send-btn[disabled] {
  background-color: #c7c7c7;
  color: #ffffff;
}

.stop-btn {
  margin-left: 14rpx;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 26rpx;
  border-radius: 12rpx;
  background-color: #ef4444;
  color: #ffffff;
  font-size: 28rpx;
}

.chat-trigger {
  position: fixed;
  right: 20rpx;
  bottom: 20rpx;
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background-color: #007aff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 20rpx rgba(0, 122, 255, 0.3);
  pointer-events: auto;
}

.trigger-text {
  color: #ffffff;
  font-size: 44rpx;
  line-height: 1;
}
</style>