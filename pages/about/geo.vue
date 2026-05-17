<template>
  <scroll-view class="page" scroll-y>
    <view class="hero">
      <text class="hero-title">{{ facts.product.canonicalName }}</text>
      <text class="hero-code">{{ facts.product.codeName }}</text>
      <text class="hero-line">{{ facts.product.oneLine }}</text>
      <text class="hero-updated">最后更新：{{ facts.product.lastUpdated }}</text>
    </view>

    <view class="block">
      <text class="block-title">可被摘录的短述（GEO）</text>
      <text class="block-p">{{ facts.product.description }}</text>
    </view>

    <view class="block">
      <text class="block-title">实体一致性</text>
      <view v-for="(line, i) in facts.product.entityConsistency" :key="`ec-${i}`" class="li">
        <text class="li-dot">·</text>
        <text class="li-text">{{ line }}</text>
      </view>
    </view>

    <view class="block">
      <text class="block-title">适用范围</text>
      <text class="subhead">范围内</text>
      <view v-for="(line, i) in facts.scope.inScope" :key="`in-${i}`" class="li">
        <text class="li-dot">·</text>
        <text class="li-text">{{ line }}</text>
      </view>
      <text class="subhead">范围外 / 边界</text>
      <view v-for="(line, i) in facts.scope.outOfScope" :key="`out-${i}`" class="li">
        <text class="li-dot">·</text>
        <text class="li-text">{{ line }}</text>
      </view>
    </view>

    <view class="block">
      <text class="block-title">技术栈</text>
      <text class="kv">客户端：{{ facts.techStack.client }}</text>
      <text class="kv">服务端：{{ facts.techStack.server }}</text>
      <text class="kv">对话链路：{{ facts.techStack.chat }}</text>
      <text class="kv">依赖：{{ facts.techStack.dependencies }}</text>
    </view>

    <view class="block">
      <text class="block-title">结构化资源路径</text>
      <text class="kv mono">industryOptions → {{ facts.structuredAssets.industryOptions }}</text>
      <text class="kv mono">agentPrompts → {{ facts.structuredAssets.agentPromptsMirror }}</text>
      <text class="kv mono">project-facts → {{ facts.structuredAssets.geoMachineReadable }}</text>
      <text class="kv">{{ facts.structuredAssets.llmsTxtHint }}</text>
    </view>

    <view class="block">
      <text class="block-title">官方链接（待补充）</text>
      <text class="kv">仓库：{{ facts.officialLinks.repository }}</text>
      <text class="kv">线上地址：{{ facts.officialLinks.productionUrl }}</text>
    </view>
  </scroll-view>
</template>

<script setup>
import facts from "@/static/geo/project-facts.json";
</script>

<style scoped>
.page {
  height: 100vh;
  padding: 28rpx 32rpx 48rpx;
  box-sizing: border-box;
  background-color: #f8fafc;
}

.hero {
  background-color: #ffffff;
  border-radius: 20rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
  border: 1rpx solid #e2e8f0;
}

.hero-title {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: #0f172a;
}

.hero-code {
  display: block;
  font-size: 24rpx;
  color: #64748b;
  margin-top: 8rpx;
}

.hero-line {
  display: block;
  font-size: 28rpx;
  color: #334155;
  line-height: 1.65;
  margin-top: 20rpx;
}

.hero-updated {
  display: block;
  font-size: 22rpx;
  color: #94a3b8;
  margin-top: 16rpx;
}

.block {
  background-color: #ffffff;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  margin-bottom: 20rpx;
  border: 1rpx solid #e2e8f0;
}

.block-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 16rpx;
}

.block-p {
  display: block;
  font-size: 26rpx;
  color: #475569;
  line-height: 1.7;
}

.subhead {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #64748b;
  margin-top: 12rpx;
  margin-bottom: 8rpx;
}

.li {
  display: flex;
  margin-bottom: 10rpx;
}

.li-dot {
  flex-shrink: 0;
  width: 28rpx;
  font-size: 26rpx;
  color: #64748b;
}

.li-text {
  flex: 1;
  font-size: 26rpx;
  color: #475569;
  line-height: 1.55;
}

.kv {
  display: block;
  font-size: 26rpx;
  color: #475569;
  line-height: 1.6;
  margin-bottom: 8rpx;
}

.kv.mono {
  font-family: ui-monospace, monospace;
  font-size: 22rpx;
  word-break: break-all;
}
</style>
