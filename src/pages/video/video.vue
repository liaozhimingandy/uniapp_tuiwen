<template>
  <view class="feed">
    <!-- 加载 / 错误态 -->
    <view v-if="items.length === 0 && loading" class="state">
      <view class="spinner" />
      <text class="state__text">加载中…</text>
    </view>
    <view v-else-if="items.length === 0 && loadError" class="state" @tap="reload">
      <text class="state__emoji">⚠️</text>
      <text class="state__text">视频加载失败，点击重试</text>
    </view>

    <swiper
      v-else
      class="swiper"
      :vertical="true"
      :current="current"
      :duration="250"
      @change="onChange"
    >
      <swiper-item v-for="(item, idx) in items" :key="item.video_id">
        <view class="slide" @tap="togglePlay">
          <!-- 海报垫底，避免视频未起播时黑屏 -->
          <image
            v-if="item.poster_url"
            class="poster"
            :src="staticLink(item.poster_url)"
            mode="aspectFill"
          />
          <!-- #ifdef H5 -->
          <video
            :id="'hv' + idx"
            class="player"
            :src="item.play_url"
            :muted="!soundOn"
            :loop="true"
            playsinline
            webkit-playsinline
            x5-playsinline
            @play="onPlay"
            @pause="onPause"
          />
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <video
            :id="'uv' + idx"
            class="player"
            :src="item.play_url"
            :autoplay="idx === current"
            :loop="true"
            :show-center-play-btn="false"
            :enable-progress-gesture="false"
            object-fit="cover"
            @play="onPlay"
            @pause="onPause"
          />
          <!-- #endif -->

          <!-- 暂停时的中央播放图标 -->
          <view v-if="current === idx && !playing" class="playmask">
            <text class="playmask__icon">▶</text>
          </view>

          <!-- 右侧互动栏 -->
          <view class="side">
            <view class="side__avatar" @tap.stop="toggleFollow(item)">
              <image
                v-if="item.author?.avatar_url"
                class="side__img"
                :src="staticLink(item.author.avatar_url)"
                mode="aspectFill"
              />
              <view v-else class="side__img side__img--ph">@</view>
              <view class="side__plus">+</view>
            </view>
            <text class="side__name">{{ item.author?.nickname || '匿名' }}</text>
          </view>

          <!-- 底部文案 -->
          <view class="meta" @tap.stop>
            <text v-if="item.title" class="meta__title">{{ item.title }}</text>
            <text v-if="item.description" class="meta__desc">{{ item.description }}</text>
            <text class="meta__author">@{{ item.author?.nickname || '匿名' }}</text>
          </view>
        </view>
      </swiper-item>
    </swiper>

    <!-- 声音开关（H5 自动播放策略要求先静音，用户可手动开声） -->
    <!-- #ifdef H5 -->
    <view class="sound" @tap="toggleSound">
      <text>{{ soundOn ? '🔊' : '🔇' }}</text>
    </view>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
/**
 * 视频（推荐流）
 *
 * 全屏上下滑 swiper，每个 slide 一条视频：
 * - 微信 / App：用 uni `<video>`，m3u8 由原生播放器解码，无需额外处理
 * - H5：用原生 `<video>`，m3u8 走 hls.js 兜底（Chrome 不原生支持 HLS）
 *
 * 免登录：后端 `/videos/feed/` 在公开路由组，未登录也能拉取；
 * 关注按钮在没登录时跳登录页。
 *
 * 分页：游标分页，`next_cursor` 为空即到底；滚动到倒数第 2 条时预取下一页。
 */
import {computed, ref} from 'vue';
import {onLoad, onUnload} from '@dcloudio/uni-app';
// #ifdef H5
import Hls from 'hls.js';
// #endif
import {fetchVideoFeed, follow} from '@/api';
import {staticLink} from '@/config';
import {isLoggedIn} from '@/utils/token';
import {LOGIN_PAGE, toast} from '@/api/request';
import type {IVideoItem} from '@/types';

const items = ref<IVideoItem[]>([]);
const current = ref(0);
const hasMore = ref(true);
const loading = ref(false);
const loadError = ref(false);
const playing = ref(false);
const soundOn = ref(false);
const feedId = ref<string | null>(null);

// #ifdef H5
/** 已挂载 hls 实例，避免重复创建 */
const hlsMap = new Map<number, Hls>();
const hlsReady = new Set<number>();
// #endif

const currentItem = computed(() => items.value[current.value]);

/** 取某条视频的播放器（H5 用 DOM，其它用视频上下文） */
const getPlayer = (idx: number): any => {
  // #ifdef H5
  return document.getElementById('hv' + idx);
  // #endif
  // #ifndef H5
  return uni.createVideoContext('uv' + idx);
  // #endif
};

const playIdx = (idx: number) => {
  // 暂停其它条目
  items.value.forEach((_, i) => {
    if (i !== idx) getPlayer(i)?.pause?.();
  });
  const player = getPlayer(idx);
  if (!player) return;
  // #ifdef H5
  setupHls(idx, player as HTMLVideoElement);
  (player as HTMLVideoElement).muted = !soundOn.value;
  // #endif
  player.play?.();
};

// #ifdef H5
/**
 * m3u8 在 Chrome 上需要 hls.js；Safari 原生支持则直接赋值 src。
 */
const setupHls = (idx: number, el: HTMLVideoElement) => {
  const item = items.value[idx];
  if (!item?.play_url?.endsWith('.m3u8')) return;
  if (hlsReady.has(idx)) return;
  hlsReady.add(idx);
  try {
    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      if (!el.src) el.src = item.play_url;
      return;
    }
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(item.play_url);
      hls.attachMedia(el);
      hlsMap.set(idx, hls);
    }
  } catch {
    // 兜底失败就交给原生，不动声色
  }
};
// #endif

const onPlay = () => {
  playing.value = true;
};
const onPause = () => {
  // 只有当前条才更新"暂停图标"
  playing.value = false;
};

const togglePlay = () => {
  const player = getPlayer(current.value);
  if (!player) return;
  // #ifdef H5
  const el = player as HTMLVideoElement;
  if (el.paused) {
    playIdx(current.value);
  } else {
    el.pause();
  }
  // #endif
  // #ifndef H5
  if (playing.value) player.pause();
  else player.play();
  // #endif
};

// #ifdef H5
const toggleSound = () => {
  soundOn.value = !soundOn.value;
  const el = getPlayer(current.value) as HTMLVideoElement | null;
  if (el) el.muted = !soundOn.value;
};
// #endif

const onChange = (e: {detail: {current: number}}) => {
  current.value = e.detail.current;
  playIdx(current.value);
  // 滑到倒数第二条时预取下一页
  if (hasMore.value && !loading.value && current.value >= items.value.length - 2) {
    void loadMore();
  }
};

const loadMore = async () => {
  if (loading.value || !hasMore.value) return;
  loading.value = true;
  try {
    const last = items.value[items.value.length - 1];
    const page = await fetchVideoFeed(last?.video_id || null, feedId.value, 6);
    const fresh = (page.items ?? []).filter(
      (it) => !items.value.some((old) => old.video_id === it.video_id),
    );
    items.value = [...items.value, ...fresh];
    feedId.value = page.feed_id || feedId.value;
    hasMore.value = Boolean(page.next_cursor) && fresh.length > 0;
  } catch {
    loadError.value = items.value.length === 0;
  } finally {
    loading.value = false;
  }
};

const reload = () => {
  loadError.value = false;
  items.value = [];
  hasMore.value = true;
  feedId.value = null;
  void loadMore();
};

/** 关注作者（没登录跳登录页） */
const toggleFollow = (item: IVideoItem) => {
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  if (!item.author?.account_id) return;
  void follow(item.author.account_id)
    .then(() => toast('已关注'))
    .catch((err: any) => toast(err?.detail || '关注失败'));
};

onLoad(() => {
  void loadMore();
});

onUnload(() => {
  // #ifdef H5
  hlsMap.forEach((hls) => hls.destroy());
  hlsMap.clear();
  // #endif
});
</script>

<style lang="scss" scoped>
.feed {
  height: 100vh;
  background-color: #000000;
}

.swiper {
  height: 100vh;
}

.slide {
  position: relative;
  width: 100%;
  height: 100vh;
  background-color: #000000;
  overflow: hidden;
}

.poster,
.player {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.player {
  object-fit: cover;
}

.playmask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.playmask__icon {
  font-size: 96rpx;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.5);
}

.side {
  position: absolute;
  right: 20rpx;
  bottom: 220rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.side__avatar {
  position: relative;
  width: 84rpx;
  height: 84rpx;
}

.side__img {
  width: 84rpx;
  height: 84rpx;
  border-radius: 42rpx;
  border: 2rpx solid #ffffff;
  background-color: #333333;
}

.side__img--ph {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 36rpx;
}

.side__plus {
  position: absolute;
  left: 50%;
  bottom: -14rpx;
  transform: translateX(-50%);
  width: 32rpx;
  height: 32rpx;
  border-radius: 16rpx;
  background-color: #fe2c55;
  color: #ffffff;
  font-size: 26rpx;
  line-height: 32rpx;
  text-align: center;
}

.side__name {
  margin-top: 12rpx;
  max-width: 160rpx;
  font-size: 24rpx;
  color: #ffffff;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  position: absolute;
  left: 28rpx;
  right: 130rpx;
  bottom: 60rpx;
  display: flex;
  flex-direction: column;
}

.meta__title {
  font-size: 32rpx;
  font-weight: 600;
  color: #ffffff;
  line-height: 1.4;
}

.meta__desc {
  margin-top: 12rpx;
  font-size: 27rpx;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.5;
  max-height: 120rpx;
  overflow: hidden;
}

.meta__author {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.7);
}

.state {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.state__emoji {
  font-size: 80rpx;
}

.state__text {
  margin-top: 20rpx;
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.7);
}

.spinner {
  width: 64rpx;
  height: 64rpx;
  border: 6rpx solid rgba(255, 255, 255, 0.25);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sound {
  position: fixed;
  top: calc(20rpx + env(safe-area-inset-top));
  right: 24rpx;
  z-index: 20;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 32rpx;
  background-color: rgba(0, 0, 0, 0.4);
  font-size: 32rpx;
}
</style>
