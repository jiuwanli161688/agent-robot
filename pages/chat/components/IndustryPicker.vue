<template>
  <picker
    :range="options"
    :range-key="rangeKey"
    :value="value"
    :disabled="disabled"
    @change="onChange"
  >
    <view class="industry-select" :class="{ disabled }">{{ displayLabel }}</view>
  </picker>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  options: {
    type: Array,
    default: () => [],
  },
  rangeKey: {
    type: String,
    default: "label",
  },
  value: {
    type: Number,
    default: 0,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["change"]);

const displayLabel = computed(() => {
  const list = Array.isArray(props.options) ? props.options : [];
  const idx = Number.isFinite(props.value) ? props.value : 0;
  const item = list[idx];
  if (!item) return "";
  return item?.[props.rangeKey] ?? "";
});

const onChange = (e) => {
  emit("change", e);
};
</script>

<style scoped>
.industry-select {
  padding: 8rpx 12rpx;
  border-radius: 10rpx;
  background-color: rgba(255, 255, 255, 0.2);
  color: #ffffff;
  font-size: 24rpx;
}

.industry-select.disabled {
  opacity: 0.6;
}
</style>

