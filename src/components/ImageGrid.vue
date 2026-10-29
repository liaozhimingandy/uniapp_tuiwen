<template>
  <view class="image-grid" :class="`image-grid--${images.length === 1 ? 'single' : 'multi'}`">
    <view
      v-for="(path, index) in images"
      :key="path + index"
      class="image-grid__cell"
      :class="cellClass"
      @tap.stop="preview(index)"
    >
      <image class="image-grid__img" :src="resolve(path)" mode="aspectFill" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 九宫格图片
 *
 * 规则（对齐微信朋友圈）：
 * - 1 张：大图，保持比例（用 aspectFit 的容器宽度做上限）
 * - 2~9 张：三列网格
 * 点击进入系统预览，预览列表用完整 CDN 地址（相对路径预览会 404）。
 */
import {computed} from 'vue';
import {imageUrl} from '@/api';

const props = defineProps<{
  /** 后端返回的相对路径列表 */
  images: string[];
}>();

/** 拼接完整地址 */
const resolve = (path: string): string => imageUrl(path);

/** 单图不裁切，多图统一正方形 */
const cellClass = computed(() => (props.images.length === 1 ? 'image-grid__cell--single' : ''));

/** 预览：可左右滑动看完整组图 */
const preview = (index: number) => {
  const urls = props.images.map(resolve);
  uni.previewImage({urls, current: urls[index]});
};
</script>

<style lang="scss" scoped>
.image-grid {
  display: flex;
  flex-wrap: wrap;
  margin-top: 12rpx;
}

.image-grid__cell {
  width: 200rpx;
  height: 200rpx;
  margin-right: 8rpx;
  margin-bottom: 8rpx;
  border-radius: 8rpx;
  overflow: hidden;
  background-color: #f2f3f5;
}

/* 三列时去掉每行最后一个的右边距，避免右侧留白不对齐 */
.image-grid--multi .image-grid__cell:nth-child(3n) {
  margin-right: 0;
}

.image-grid__cell--single {
  width: 480rpx;
  height: 360rpx;
}

.image-grid__img {
  width: 100%;
  height: 100%;
}
</style>
