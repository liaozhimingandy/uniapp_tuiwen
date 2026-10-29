<template>
  <view class="hub">
    <!-- 头部：标题 + 发表视频 -->
    <view class="head">
      <text class="head__title">我的视频</text>
      <view class="head__upload" :class="{'head__upload--busy': uploading}" @tap="chooseAndUpload">
        <text>{{ uploading ? `上传中 ${uploadPercent}%` : '＋ 发表视频' }}</text>
      </view>
    </view>

    <!-- 上传进度条 -->
    <view v-if="uploading" class="upbar">
      <view class="upbar__inner" :style="{width: uploadPercent + '%'}" />
    </view>

    <!-- 加载态 -->
    <view v-if="loading && videos.length === 0" class="state">
      <view class="spinner" />
      <text class="state__text">加载中…</text>
    </view>
    <view v-else-if="videos.length === 0" class="state">
      <text class="state__emoji">🎬</text>
      <text class="state__text">还没有视频，点右上角「发表视频」上传第一个吧</text>
    </view>

    <!-- 三列网格：封面 + 时长 + 状态角标 -->
    <view v-else class="grid">
      <view v-for="item in videos" :key="item.video_id" class="cell" @tap="onTapVideo(item)">
        <view class="cell__cover">
          <image
            v-if="item.poster_url"
            class="cell__img"
            :src="staticLink(item.poster_url)"
            mode="aspectFill"
          />
          <view v-else class="cell__img cell__img--ph">
            <text>{{ statusText(item) }}</text>
          </view>
          <!-- 时长角标 -->
          <text v-if="item.duration" class="cell__duration">{{ fmtDuration(item.duration) }}</text>
          <!-- 转码状态角标 -->
          <view v-if="item.transcode_status !== 2" class="cell__status" :class="{'cell__status--fail': item.transcode_status === 3}">
            <text>{{ statusText(item) }}</text>
          </view>
        </view>
        <text class="cell__title ellipsis">{{ item.title || '未命名视频' }}</text>
        <view class="cell__meta">
          <text>❤ {{ formatCount(item.like_count) }}</text>
          <text>💬 {{ formatCount(item.comment_count) }}</text>
          <text>★ {{ formatCount(item.favorite_count) }}</text>
        </view>
      </view>
    </view>

    <view v-if="videos.length && loading" class="loadmore">加载中…</view>
    <view v-else-if="videos.length && !hasMore" class="loadmore">没有更多了</view>
  </view>
</template>

<script setup lang="ts">
/**
 * 我的视频（视频号管理页）
 *
 * - 网格展示自己上传的全部视频（含转码中/失败，角标标注状态）
 * - 「发表视频」：chooseVideo 选片 → 标题弹窗 → uploadFile 带进度上传
 * - 上传成功后刷新列表；转码是异步的，成功/失败由后端回调更新
 *
 * 免登录不可见：未登录直接跳登录页。
 */
import {ref} from 'vue';
import {onLoad, onPullDownRefresh, onReachBottom} from '@dcloudio/uni-app';
import {fetchMyVideos, uploadVideoFile} from '@/api';
import {staticLink} from '@/config';
import {isLoggedIn} from '@/utils/token';
import {LOGIN_PAGE, toast} from '@/api/request';
import type {IMyVideo} from '@/types';

const PAGE_SIZE = 12;

const videos = ref<IMyVideo[]>([]);
const loading = ref(false);
const hasMore = ref(true);
const offset = ref(0);

/** 上传状态 */
const uploading = ref(false);
const uploadPercent = ref(0);

/** 计数格式化：过万显示 1.2w */
const formatCount = (n?: number | null): string => {
  const v = Number(n) || 0;
  if (v < 10000) return String(v);
  return `${(v / 10000).toFixed(1)}w`;
};

/** 秒 → mm:ss */
const fmtDuration = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const statusText = (item: IMyVideo): string => {
  switch (item.transcode_status) {
    case 0:
      return '排队中';
    case 1:
      return '转码中';
    case 3:
      return '转码失败';
    default:
      return '';
  }
};

const load = async (append: boolean) => {
  if (!isLoggedIn()) {
    uni.reLaunch({url: LOGIN_PAGE});
    return;
  }
  if (loading.value) return;
  if (!append) {
    offset.value = 0;
    hasMore.value = true;
  }
  loading.value = true;
  try {
    const list = await fetchMyVideos(offset.value, PAGE_SIZE);
    const fresh = append ? (list as IMyVideo[]) : (list as IMyVideo[]);
    videos.value = append ? [...videos.value, ...fresh] : fresh;
    offset.value += fresh.length;
    hasMore.value = fresh.length >= PAGE_SIZE;
  } catch (err: any) {
    if (err?.status === 401) {
      uni.reLaunch({url: LOGIN_PAGE});
      return;
    }
    toast(err?.detail || '加载失败');
  } finally {
    loading.value = false;
  }
};

/** 选片 → 标题 → 上传 */
const chooseAndUpload = () => {
  if (uploading.value) return;
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  uni.chooseVideo({
    sourceType: ['album', 'camera'],
    compressed: true,
    maxDuration: 60,
    success: (res) => {
      const filePath = res.tempFilePath;
      if (!filePath) return;
      // 大小预检（后端默认 100MB 上限, 超了直接提示省得上传半天失败）
      const sizeMB = Number(res.size) / 1024 / 1024;
      if (sizeMB > 100) {
        toast(`视频 ${sizeMB.toFixed(0)}MB 超过 100MB 上限`);
        return;
      }
      // 标题可选：弹窗里填，取消也能继续传
      uni.showModal({
        title: '给视频起个标题（可留空）',
        editable: true,
        placeholderText: '例如：周末爬山记录',
        success: (modal) => {
          if (!modal.confirm) return;
          void doUpload(filePath, (modal.content || '').trim());
        },
      });
    },
  });
};

const doUpload = async (filePath: string, title: string) => {
  uploading.value = true;
  uploadPercent.value = 0;
  try {
    await uploadVideoFile(filePath, title, (p) => {
      uploadPercent.value = p;
    });
    toast('上传成功，转码完成后即可播放');
    await load(false);
  } catch (err: any) {
    toast(err?.detail || '上传失败');
  } finally {
    uploading.value = false;
  }
};

/** 点视频：成功的提示去视频流看；未转码完的说明状态 */
const onTapVideo = (item: IMyVideo) => {
  if (item.transcode_status === 2) {
    toast('已发布，可在视频流中查看');
  } else if (item.transcode_status === 3) {
    toast(`转码失败${item.transcode_msg ? '：' + item.transcode_msg : ''}`);
  } else {
    toast('转码中，完成后自动上架');
  }
};

onLoad(() => void load(false));
onPullDownRefresh(async () => {
  await load(false);
  uni.stopPullDownRefresh();
});
onReachBottom(() => {
  if (hasMore.value && !loading.value) void load(true);
});
</script>

<style lang="scss" scoped>
.hub {
  min-height: 100vh;
  padding: 24rpx 24rpx 60rpx;
  background-color: #f7f8fa;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.head__title {
  font-size: 40rpx;
  font-weight: 700;
  color: #111111;
}

.head__upload {
  padding: 14rpx 32rpx;
  border-radius: 36rpx;
  background-color: #fe2c55;
  color: #ffffff;
  font-size: 27rpx;
}

.head__upload--busy {
  background-color: #ffb3c0;
}

.upbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 6rpx;
  background-color: rgba(254, 44, 85, 0.15);
  z-index: 10;
}

.upbar__inner {
  height: 100%;
  background-color: #fe2c55;
  transition: width 0.2s ease;
}

.state {
  padding-top: 200rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.state__emoji {
  font-size: 80rpx;
}

.state__text {
  margin-top: 20rpx;
  padding: 0 60rpx;
  font-size: 26rpx;
  color: #999999;
  text-align: center;
  line-height: 1.6;
}

.spinner {
  width: 64rpx;
  height: 64rpx;
  border: 6rpx solid rgba(0, 0, 0, 0.1);
  border-top-color: #fe2c55;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.cell {
  width: calc((100% - 32rpx) / 3);
}

.cell__cover {
  position: relative;
  width: 100%;
  height: 320rpx;
  border-radius: 12rpx;
  overflow: hidden;
  background-color: #eeeeee;
}

.cell__img {
  width: 100%;
  height: 100%;
}

.cell__img--ph {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  color: #999999;
}

.cell__duration {
  position: absolute;
  left: 10rpx;
  bottom: 10rpx;
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
  background-color: rgba(0, 0, 0, 0.55);
  color: #ffffff;
  font-size: 20rpx;
}

.cell__status {
  position: absolute;
  top: 10rpx;
  right: 10rpx;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  background-color: rgba(0, 0, 0, 0.55);
  color: #ffffff;
  font-size: 20rpx;
}

.cell__status--fail {
  background-color: rgba(250, 81, 81, 0.9);
}

.cell__title {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #333333;
  line-height: 1.4;
}

.cell__meta {
  display: flex;
  gap: 12rpx;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #999999;
}

.loadmore {
  padding: 30rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: #999999;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
