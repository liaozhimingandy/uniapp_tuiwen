<template>
  <view class="avatar" :style="wrapStyle">
    <image v-if="url" class="avatar-img" :src="url" mode="aspectFill" />
    <text v-else class="avatar-text" :style="{fontSize: textSize}">{{ initial }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 头像
 *
 * 没上传头像时按昵称生成一个稳定的彩色底 + 首字，不需要请求任何接口；
 * 颜色由昵称哈希决定，同一用户在任何页面都是同一个颜色（纯随机会让列表花花绿绿）。
 */
import {computed} from 'vue';
import {imageUrl} from '@/api';

const props = withDefaults(
  defineProps<{
    /** 昵称或用户名 */
    name?: string;
    /** 后端返回的头像相对路径 / 完整地址 */
    src?: string;
    /** 尺寸（rpx） */
    size?: number;
  }>(),
  {name: '', src: '', size: 80},
);

/** 头像完整地址（相对路径拼 CDN） */
const url = computed(() => (props.src ? imageUrl(props.src) : ''));

/** 首字：中文取第一个字，英文取首字母大写 */
const initial = computed(() => {
  const name = (props.name || '').trim();
  if (!name) return '·';
  const first = name.replace(/\s+/g, '').charAt(0);
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
});

/** 从固定色板里按名字哈希取色，保证同一用户颜色一致 */
const COLORS = ['#5B8FF9', '#61DDAA', '#F6BD16', '#7262FD', '#78D3F8', '#9661BC', '#F6903D', '#008685'];
const background = computed(() => {
  const name = props.name || '';
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return COLORS[hash % COLORS.length];
});

const wrapStyle = computed(() => ({
  width: `${props.size}rpx`,
  height: `${props.size}rpx`,
  borderRadius: `${Math.round(props.size / 2)}rpx`,
  backgroundColor: background.value,
}));

const textSize = computed(() => `${Math.round(props.size * 0.42)}rpx`);
</script>

<style lang="scss" scoped>
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-img {
  width: 100%;
  height: 100%;
}

.avatar-text {
  color: #ffffff;
  font-weight: 600;
  line-height: 1;
}
</style>
