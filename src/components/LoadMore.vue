<template>
  <view class="load-more">
    <text v-if="status === 'loading'">加载中…</text>
    <text v-else-if="status === 'nomore'">{{ nomoreText }}</text>
    <text v-else class="load-more__hint" @tap="$emit('refresh')">{{ idleText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 列表底部状态条
 *
 * 三种状态收敛在一个组件里，避免每个列表各写一遍
 * （各写一遍的典型后果：有的页面到底了还在转圈，有的页面永远显示"加载更多"）。
 */
withDefaults(
  defineProps<{
    status: 'idle' | 'loading' | 'nomore';
    nomoreText?: string;
    idleText?: string;
  }>(),
  {nomoreText: '没有更多了', idleText: '下拉刷新'},
);

defineEmits<{(e: 'refresh'): void}>();
</script>

<style lang="scss" scoped>
.load-more {
  padding: 32rpx 0 48rpx;
  text-align: center;
  color: $text-3;
  font-size: 24rpx;
}

.load-more__hint {
  color: $brand;
}
</style>
