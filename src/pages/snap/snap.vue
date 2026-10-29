<template>
  <view class="page">
    <!-- 顶部状态条 -->
    <view class="status">
      <view class="status__left">
        <text class="status__dot" :class="{'status__dot--on': isOpen}" />
        <text class="status__text">{{ isOpen ? '今夜开放中' : '板块休息中' }}</text>
      </view>
      <text class="status__countdown">{{ countdownText }}</text>
    </view>

    <!-- 关闭时段 -->
    <view v-if="!isOpen" class="closed">
      <text class="closed__title">这里只在深夜开放</text>
      <text class="closed__desc">每日 23:00 ~ 次日 06:00</text>
      <text class="closed__countdown">{{ countdownText }}</text>
      <text class="closed__tip">到点后自动开放，所有内容天亮即焚</text>
    </view>

    <!-- 开放时段 -->
    <template v-else>
      <view class="notice">
        <text>今夜所有心事早上 6 点永久清除，不留痕迹</text>
      </view>

      <view v-if="snaps.length === 0 && !loading" class="empty empty--dark">还没有人说话，做第一个吧</view>

      <view
        v-for="item in snaps"
        :key="item.id"
        class="snap"
        :style="{backgroundColor: emotionBg(item.emotion)}"
      >
        <view class="snap__head">
          <text class="snap__alias">{{ item.alias_name }}</text>
          <text class="snap__time">{{ formatSmartTime(item.created_at) }}</text>
        </view>
        <text class="snap__text">{{ item.content?.text }}</text>
        <view class="snap__foot">
          <text v-if="item.emotion" class="snap__emotion">{{ emotionLabel(item.emotion) }}</text>
          <view class="snap__like" :class="{'snap__like--on': likedIds.has(item.id)}" @tap="like(item)">
            <text class="snap__like-icon">♡</text>
            <text class="snap__like-count">{{ item.like_count || 0 }}</text>
          </view>
        </view>
      </view>

      <LoadMore v-if="snaps.length > 0" :status="loadStatus" idle-text="上拉加载更多" />
    </template>

    <!-- 写下心事 -->
    <view v-if="isOpen" class="fab" @tap="openSheet">
      <text class="fab__icon">＋</text>
    </view>

    <!-- 发布面板 -->
    <view v-if="sheetVisible" class="sheet-mask" @tap="sheetVisible = false">
      <view class="sheet" @tap.stop>
        <view class="sheet__head">
          <text class="sheet__title">今晚想说什么</text>
          <text class="sheet__close" @tap="sheetVisible = false">×</text>
        </view>

        <textarea
          v-model="form.text"
          class="sheet__input"
          placeholder="没人知道你是谁，说出来会好一点…"
          placeholder-class="sheet__placeholder"
          :maxlength="SNAP_CONTENT_MAX"
          :show-confirm-bar="false"
          :adjust-position="true"
        />
        <text class="sheet__counter">{{ form.text.length }}/{{ SNAP_CONTENT_MAX }}</text>

        <text class="sheet__label">此刻心情</text>
        <scroll-view class="emotions" scroll-x>
          <view
            v-for="item in EMOTION_OPTIONS"
            :key="item.value"
            class="emotion"
            :class="{'emotion--on': form.emotion === item.value}"
            @tap="form.emotion = item.value"
          >
            {{ item.label }}
          </view>
        </scroll-view>

        <view class="sheet__row">
          <input
            v-model="form.alias_name"
            class="sheet__alias"
            placeholder="留空则随机匿名"
            placeholder-class="sheet__placeholder"
            :maxlength="16"
          />
        </view>

        <view class="sheet__submit" :class="{'is-disabled': submitting}" @tap="submit">
          {{ submitting ? '发布中…' : '说出来' }}
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 天亮即焚（树洞）
 *
 * 开放窗口：**用户本地时间 23:00 ~ 次日 06:00**
 * - 前端用 `isInDailyWindow` 判断（与 `X-Timezone` 上报同一个时区来源）
 * - 后端按 `X-Timezone` 过滤数据，两端口径一致，出国也不会"页面开着但列表是空的"
 *
 * 分页：后端是 offset 分页（不是游标），所以用 `snaps.length` 当 offset。
 * 轮询：开放时段每 15 秒拉一次 latest，只做"合并去重"，不打断阅读位置。
 */
import {computed, reactive, ref} from 'vue';
import {onHide, onLoad, onPullDownRefresh, onReachBottom, onShow, onUnload} from '@dcloudio/uni-app';
import LoadMore from '@/components/LoadMore.vue';
import {fetchLatestSnaps, fetchSnaps, likeSnap, publishSnap} from '@/api';
import {
  EMOTION_BG,
  EMOTION_OPTIONS,
  EMOTIONS,
  SNAP_BURN_HOUR,
  SNAP_CONTENT_MAX,
  SNAP_OPEN_HOUR,
} from '@/config/constants';
import {
  compareTimeDesc,
  formatCountdown,
  formatSmartTime,
  isInDailyWindow,
  secondsUntilDailyWindowEnd,
} from '@/utils/datetime';
import {randomAlias} from '@/utils/text';
import {isLoggedIn} from '@/utils/token';
import {LOGIN_PAGE, toast} from '@/api/request';
import type {ISnap} from '@/types';

/** 轮询间隔：15 秒（比 Web 端的 3 秒慢，移动端要考虑流量与耗电） */
const POLL_INTERVAL = 15000;

const snaps = ref<ISnap[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(true);
const isOpen = ref(isInDailyWindow(SNAP_OPEN_HOUR, SNAP_BURN_HOUR));
const remainSeconds = ref(0);
const likedIds = ref<Set<number>>(new Set());

const sheetVisible = ref(false);
const submitting = ref(false);
const form = reactive({
  text: '',
  emotion: 1,
  alias_name: '',
});

let tickTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
/** 轮询并发护栏：上一次没回来就跳过本次，避免两次请求各自合并再互相覆盖 */
let polling = false;

const loadStatus = computed<'idle' | 'loading' | 'nomore'>(() => {
  if (loadingMore.value) return 'loading';
  return hasMore.value ? 'idle' : 'nomore';
});

/** 倒计时文案：开放中显示距天亮，休息中显示距离开放 */
const countdownText = computed(() => formatCountdown(remainSeconds.value));

/** 情绪文案与底色 */
const emotionLabel = (value?: number): string => (value ? EMOTIONS[value] || '' : '');
const emotionBg = (value?: number): string => (value ? EMOTION_BG[value] || 'transparent' : 'transparent');

/** 计算剩余秒数：开放中 → 距 06:00；休息中 → 距 23:00 */
const recalcCountdown = () => {
  if (isOpen.value) {
    remainSeconds.value = secondsUntilDailyWindowEnd(SNAP_BURN_HOUR);
    return;
  }
  const now = new Date();
  const next = new Date(now);
  next.setHours(SNAP_OPEN_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  remainSeconds.value = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
};

/** 每秒 tick：跨过 23:00 / 06:00 时自动切换开放状态并拉数据 */
const tick = () => {
  const open = isInDailyWindow(SNAP_OPEN_HOUR, SNAP_BURN_HOUR);
  if (open !== isOpen.value) {
    isOpen.value = open;
    if (open) {
      void refresh();
      startPoll();
    } else {
      stopPoll();
      // 关板后数据会被后端清空，本地也清掉，避免次日看到"幽灵内容"
      snaps.value = [];
    }
  }
  recalcCountdown();
};

/** 合并去重 + 时间倒序 */
const merge = (items: ISnap[]) => {
  const map = new Map<number, ISnap>();
  [...snaps.value, ...items].forEach((item) => map.set(item.id, item));
  snaps.value = Array.from(map.values()).sort((a, b) => compareTimeDesc(a.created_at, b.created_at));
};

/** 拉最新（轮询 / 首屏） */
const fetchLatest = async (silent = true) => {
  if (polling) return;
  polling = true;
  if (!silent) loading.value = true;
  try {
    const page = await fetchLatestSnaps();
    merge(page.items ?? []);
  } catch {
    // 轮询失败静默：网络抖动不该每秒弹一次错误
  } finally {
    loading.value = false;
    polling = false;
  }
};

/** 首屏 / 下拉刷新 */
const refresh = async () => {
  snaps.value = [];
  hasMore.value = true;
  await fetchLatest(false);
  uni.stopPullDownRefresh();
};

/** 上拉加载更多（offset 分页） */
const loadMore = async () => {
  if (!isOpen.value || loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const page = await fetchSnaps(snaps.value.length, 10);
    const items = page.items ?? [];
    merge(items);
    const total = page.total ?? 0;
    // 后端可能不返回 total：以"本次不足一页"作为到底判断
    hasMore.value = total ? snaps.value.length < total : items.length >= 10;
  } catch {
    toast('加载失败，请稍后重试');
  } finally {
    loadingMore.value = false;
  }
};

/** 点赞（本地去重：同一设备同一条只记一次，避免连点刷数） */
const like = async (item: ISnap) => {
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  if (likedIds.value.has(item.id)) {
    toast('已经赞过了');
    return;
  }
  try {
    const result = await likeSnap(item.id);
    item.like_count = result?.like_count ?? (item.like_count || 0) + 1;
    // Set 是浅响应：整体替换才能触发视图更新
    likedIds.value = new Set([...likedIds.value, item.id]);
  } catch {
    toast('点赞失败');
  }
};

/** 打开面板 */
const openSheet = () => {
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  sheetVisible.value = true;
};

/** 发布 */
const submit = async () => {
  if (submitting.value) return;
  const text = form.text.trim();
  if (!text) {
    toast('写点什么吧');
    return;
  }

  submitting.value = true;
  try {
    await publishSnap({
      // 后端未强制要求昵称：留空则随机生成一个匿名代号
      alias_name: form.alias_name.trim() || randomAlias(),
      content: {text},
      emotion: form.emotion,
    });
    sheetVisible.value = false;
    form.text = '';
    form.alias_name = '';
    toast('已发布，天亮即焚');
    // 立即刷新，不等轮询
    await fetchLatest(false);
    uni.pageScrollTo({scrollTop: 0, duration: 200});
  } catch (error: any) {
    toast(error?.detail || '发布失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
};

/** 开启轮询 */
const startPoll = () => {
  stopPoll();
  pollTimer = setInterval(() => {
    if (isOpen.value) void fetchLatest(true);
  }, POLL_INTERVAL);
};

/** 停止轮询 */
const stopPoll = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

onLoad(() => {
  recalcCountdown();
  tickTimer = setInterval(tick, 1000);
  if (isOpen.value) void refresh();
});

onShow(() => {
  if (!isOpen.value) return;
  startPoll();
});

onHide(() => stopPoll());
onUnload(() => {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  stopPoll();
});

onPullDownRefresh(() => {
  if (!isOpen.value) {
    uni.stopPullDownRefresh();
    return;
  }
  void refresh();
});

onReachBottom(() => {
  void loadMore();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px));
  box-sizing: border-box;
  background-color: #141423;
  color: #ffffff;
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
}

.status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 32rpx;
  background-color: rgba(255, 255, 255, 0.04);
}

.status__left {
  display: flex;
  align-items: center;
}

.status__dot {
  width: 12rpx;
  height: 12rpx;
  margin-right: 12rpx;
  border-radius: 6rpx;
  background-color: #6b6b7b;
}

.status__dot--on {
  background-color: #4ade80;
}

.status__text {
  font-size: 25rpx;
  color: #c9c9d6;
}

.status__countdown {
  font-size: 25rpx;
  color: #8b8b9c;
  font-variant-numeric: tabular-nums;
}

.closed {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 200rpx 48rpx;
}

.closed__title {
  font-size: 36rpx;
  font-weight: 600;
}

.closed__desc {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #8b8b9c;
}

.closed__countdown {
  margin-top: 48rpx;
  font-size: 64rpx;
  font-weight: 300;
  letter-spacing: 4rpx;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
}

.closed__tip {
  margin-top: 32rpx;
  font-size: 23rpx;
  color: #6b6b7b;
}

.notice {
  padding: 18rpx 32rpx;
  font-size: 23rpx;
  color: #f0c36d;
  background-color: rgba(240, 195, 109, 0.08);
}

.empty--dark {
  color: #6b6b7b;
}

.snap {
  margin: 0 20rpx 16rpx;
  padding: 28rpx 24rpx;
  border-radius: 16rpx;
  background-color: rgba(255, 255, 255, 0.05);
}

.snap__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.snap__alias {
  font-size: 27rpx;
  font-weight: 600;
  color: #d8d8e6;
}

.snap__time {
  font-size: 21rpx;
  color: #6b6b7b;
}

.snap__text {
  display: block;
  margin-top: 14rpx;
  font-size: 30rpx;
  line-height: 1.75;
  color: #f2f2f7;
  word-break: break-word;
}

.snap__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18rpx;
}

.snap__emotion {
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
  font-size: 21rpx;
  color: #a9a9bb;
  background-color: rgba(255, 255, 255, 0.06);
}

.snap__like {
  display: flex;
  align-items: center;
  color: #8b8b9c;
}

.snap__like--on {
  color: #ff6b81;
}

.snap__like-icon {
  font-size: 30rpx;
}

.snap__like-count {
  margin-left: 6rpx;
  font-size: 23rpx;
}

.fab {
  position: fixed;
  right: 36rpx;
  bottom: calc(48rpx + env(safe-area-inset-bottom));
  /* #ifdef H5 */
  /* 同首页：H5 的 tabBar 是固定覆盖层，FAB 要让开 */
  bottom: calc(48rpx + 50px + env(safe-area-inset-bottom));
  /* #endif */
  width: 104rpx;
  height: 104rpx;
  border-radius: 52rpx;
  background-color: #027aff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(2, 122, 255, 0.4);
}

.fab__icon {
  color: #ffffff;
  font-size: 52rpx;
  line-height: 1;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  /* 高于 H5 的 tabBar（z-index 998）：否则底部的发布按钮会被导航栏盖住 */
  z-index: 999;
}

.sheet {
  width: 100%;
  padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
  background-color: #1e1e2e;
  border-top-left-radius: 24rpx;
  border-top-right-radius: 24rpx;
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sheet__title {
  font-size: 32rpx;
  font-weight: 600;
}

.sheet__close {
  padding: 0 8rpx;
  font-size: 44rpx;
  color: #8b8b9c;
  line-height: 1;
}

.sheet__input {
  width: 100%;
  height: 220rpx;
  margin-top: 24rpx;
  padding: 20rpx;
  border-radius: 12rpx;
  background-color: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  font-size: 29rpx;
  line-height: 1.7;
}

.sheet__placeholder {
  color: #6b6b7b;
}

.sheet__counter {
  display: block;
  margin-top: 8rpx;
  text-align: right;
  font-size: 21rpx;
  color: #6b6b7b;
}

.sheet__label {
  display: block;
  margin-top: 24rpx;
  font-size: 24rpx;
  color: #a9a9bb;
}

.emotions {
  margin-top: 16rpx;
  white-space: nowrap;
}

.emotion {
  display: inline-block;
  margin-right: 16rpx;
  padding: 10rpx 26rpx;
  border-radius: 28rpx;
  font-size: 24rpx;
  color: #c9c9d6;
  background-color: rgba(255, 255, 255, 0.08);
}

.emotion--on {
  background-color: #027aff;
  color: #ffffff;
}

.sheet__row {
  margin-top: 24rpx;
}

.sheet__alias {
  height: 76rpx;
  padding: 0 20rpx;
  border-radius: 12rpx;
  background-color: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  font-size: 27rpx;
}

.sheet__submit {
  margin-top: 32rpx;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 44rpx;
  background-color: #027aff;
  color: #ffffff;
  font-size: 30rpx;
}

.is-disabled {
  opacity: 0.5;
}
</style>
