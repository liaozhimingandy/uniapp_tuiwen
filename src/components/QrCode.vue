<template>
  <canvas
    class="qr"
    :canvas-id="canvasId"
    :style="{width: size + 'px', height: size + 'px'}"
  />
</template>

<script setup lang="ts">
/**
 * 二维码画布组件（H5 / 小程序 / App 通用）
 *
 * 用 qrcode-generator 生成布尔矩阵，再用 uni-app 经典 canvas API 逐模块绘制。
 * - 经典 canvas（createCanvasContext + draw）三端都支持，避免 2d 新 API 的各端差异
 * - 模块绘制时 +0.6px 容差，抵消抗锯齿带来的模块间细缝，扫码更稳
 */
import {onMounted, watch} from 'vue';
import {qrMatrix} from '@/utils/qrcode';

const props = withDefaults(
  defineProps<{
    /** 要编码的内容（链接 / 文本） */
    text: string;
    /** 画布边长（px） */
    size?: number;
    /** 安静区（模块数），默认 3，避免边缘被裁 */
    margin?: number;
    /** 前景色 */
    fg?: string;
    /** 背景色 */
    bg?: string;
  }>(),
  {size: 240, margin: 3, fg: '#111111', bg: '#ffffff'},
);

// 每个组件一个唯一 canvas-id，避免多实例互相串
const canvasId = `qr_${Math.random().toString(36).slice(2, 9)}`;

const draw = () => {
  if (!props.text) return;
  const ctx = uni.createCanvasContext(canvasId);
  const matrix = qrMatrix(props.text);
  const count = matrix.length;
  const total = count + props.margin * 2;
  const cell = props.size / total;

  // 背景
  ctx.setFillStyle(props.bg);
  ctx.fillRect(0, 0, props.size, props.size);

  // 模块
  ctx.setFillStyle(props.fg);
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!matrix[r][c]) continue;
      const x = (c + props.margin) * cell;
      const y = (r + props.margin) * cell;
      // +0.6 容差填补抗锯齿缝隙
      ctx.fillRect(x, y, cell + 0.6, cell + 0.6);
    }
  }
  ctx.draw();
};

onMounted(draw);
watch(() => props.text, draw);

// 暴露 canvasId 给页面（用于保存到相册）
defineExpose({canvasId});
</script>

<style scoped>
.qr {
  display: block;
}
</style>
