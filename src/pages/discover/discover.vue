<template>
  <view class="page">
    <!-- 顶部搜索条（微信发现页同款位置） -->
    <view class="searchbar" @tap="goSearch">
      <text class="searchbar__icon">🔍</text>
      <text class="searchbar__ph">搜索用户、内容</text>
    </view>

    <!-- 入口分组：微信「发现」页样式 —— 白底列表行 + 圆角图标 + 右箭头 -->
    <view class="group">
      <view class="cell" @tap="goVideo">
        <view class="cell__icon cell__icon--video">📺</view>
        <text class="cell__label">视频号</text>
        <text class="cell__arrow">›</text>
      </view>
      <view class="cell" @tap="goSnap">
        <view class="cell__icon cell__icon--snap">🌙</view>
        <text class="cell__label">树洞</text>
        <text class="cell__sub">天亮即焚</text>
        <text class="cell__arrow">›</text>
      </view>
    </view>

    <view class="group">
      <view class="cell" @tap="goNotice">
        <view class="cell__icon cell__icon--notice">🔔</view>
        <text class="cell__label">通知中心</text>
        <text v-if="unreadCount > 0" class="cell__badge">{{ unreadBadge }}</text>
        <text class="cell__arrow">›</text>
      </view>
      <view class="cell" @tap="goFollow">
        <view class="cell__icon cell__icon--follow">👥</view>
        <text class="cell__label">我的关注</text>
        <text class="cell__arrow">›</text>
      </view>
    </view>

    <!-- 热门内容：最近 7 天点赞最多的公开帖 -->
    <view v-if="hotPosts.length || hotOffset > 0" class="block">
      <view class="block__head">
        <text class="block__title">热门内容</text>
        <view class="block__refresh" @tap="shuffleHot">
          <text class="block__refresh-icon" :class="{'block__refresh-icon--spin': hotShuffling}">⟳</text>
          <text class="block__refresh-text">换一批</text>
        </view>
      </view>
      <view
        v-for="(item, index) in hotPosts"
        :key="item.post_id"
        class="hot"
        @tap="goDetail(item.post_id)"
      >
        <text class="hot__rank" :class="{'hot__rank--top': index < 3}">{{ index + 1 }}</text>
        <view class="hot__main">
          <text class="hot__text">{{ hotSummary(item) }}</text>
          <view class="hot__meta">
            <text class="hot__author">{{ hotAuthor(item.account_id) }}</text>
            <text class="hot__likes">❤ {{ formatCount(item.like_count) }}</text>
          </view>
        </view>
        <image v-if="hotThumb(item)" class="hot__thumb" :src="hotThumb(item)" mode="aspectFill" />
      </view>
    </view>

    <!-- 系统公告（受通知设置「系统公告」开关控制） -->
    <view v-if="showNotice" class="block">
      <view class="block__head">
        <text class="block__title">系统公告</text>
        <text v-if="noticeLoading" class="block__tip">加载中…</text>
      </view>

      <view v-if="!noticeLoading && notices.length === 0" class="block__empty">暂无公告</view>

      <view
        v-for="n in notices"
        :key="n.id"
        class="notice"
      >
        <view class="notice__row">
          <text class="notice__title">{{ n.title || '公告' }}</text>
          <text class="notice__time">{{ formatSmartTime(n.created_at) }}</text>
        </view>
        <text class="notice__content">{{ noticeText(n) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 发现（微信风格二级入口聚合页）
 *
 * 版式对齐微信「发现」页：顶部搜索条 + 白底分组列表行（图标/标题/箭头），
 * 树洞、视频号等二级入口收在这里；下方叠加热门内容与系统公告。
 */
import {computed, ref} from 'vue';
import {onPullDownRefresh, onShow} from '@dcloudio/uni-app';
import {fetchHotPosts, fetchNotices, fetchUnreadCount, imageUrl} from '@/api';
import {formatSmartTime} from '@/utils/datetime';
import {contentImages, contentText, formatCount, stripHtml} from '@/utils/text';
import {useAccountStore, useUserCacheStore} from '@/stores/account';
import {getNotificationSettings} from '@/utils/notification';
import {LOGIN_PAGE, toast} from '@/api/request';
import type {IContent, INotice, IPost} from '@/types';

const accountStore = useAccountStore();
const userCacheStore = useUserCacheStore();

const hotPosts = ref<IPost[]>([]);
const notices = ref<INotice[]>([]);
const noticeLoading = ref(false);
const unreadCount = ref(0);
/** 热门翻页偏移（「换一批」递增，到底回到 0 循环） */
const hotOffset = ref(0);
const hotShuffling = ref(false);
/** 是否展示系统公告：受通知设置控制 */
const showNotice = computed(() => getNotificationSettings().systemNotice);

/** 未读数超过 99 显示 99+ */
const unreadBadge = computed(() => (unreadCount.value > 99 ? '99+' : String(unreadCount.value)));

const goSearch = () => uni.navigateTo({url: '/pages/search/search'});
const goSnap = () => uni.navigateTo({url: '/pages/snap/snap'});
const goNotice = () => uni.navigateTo({url: '/pages/notice/notice'});
/** 视频是 tabBar 页面，必须用 switchTab */
const goVideo = () => uni.switchTab({url: '/pages/video/video'});

const goDetail = (postId: string) => uni.navigateTo({url: `/pages/detail/detail?id=${postId}`});

/** 关注列表需要登录态（要自己的 account_id），未登录跳登录页 */
const goFollow = () => {
  if (!accountStore.loggedIn) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  const id = accountStore.account.account_id;
  if (!id) {
    toast('请先登录');
    return;
  }
  uni.navigateTo({url: `/pages/follow/follow?id=${id}&tab=followee`});
};

/** 热门条目摘要：HTML 去标签 + 截两行（CSS clamp），纯图帖给占位文案 */
const hotSummary = (post: IPost): string => {
  const text = stripHtml(contentText(post.content));
  return text || '分享了几张图片';
};

/** 热门条目首图缩略图（无图返回空串，模板隐藏） */
const hotThumb = (post: IPost): string => {
  const imgs = contentImages(post.content);
  return imgs.length ? imageUrl(imgs[0]) : '';
};

/** 热门条目作者名：走用户缓存（同一作者只请求一次），未加载完先显示占位 */
const hotAuthor = (accountId: string): string => {
  const author = userCacheStore.accountMap[accountId];
  if (!author) {
    void userCacheStore.fetchUser(accountId).catch(() => undefined);
    return '…';
  }
  return author.nickname || author.username || '匿名用户';
};

/** 公告正文：后端 content 是 {text}，兼容直接给字符串的情况 */
const noticeText = (n: INotice): string => {
  const c = n.content as IContent | string | undefined;
  if (!c) return '';
  if (typeof c === 'string') return c;
  return c.text || '';
};

const loadHotPosts = async (offset = 0) => {
  try {
    const page = await fetchHotPosts(5, offset);
    const items = (page.items ?? []) as IPost[];
    hotPosts.value = items;
    hotOffset.value = offset;
  } catch {
    // 热门失败不影响发现页主体，直接隐藏区块
    hotPosts.value = [];
    hotOffset.value = 0;
  }
};

/** 换一批：向后翻一页；没有下一页数据时回到开头 */
const shuffleHot = async () => {
  if (hotShuffling.value) return;
  hotShuffling.value = true;
  const nextOffset = hotOffset.value + 5;
  try {
    const page = await fetchHotPosts(5, nextOffset);
    const items = (page.items ?? []) as IPost[];
    if (items.length > 0) {
      hotPosts.value = items;
      hotOffset.value = nextOffset;
    } else {
      await loadHotPosts(0);
    }
  } catch {
    toast('换一批失败，请重试');
  } finally {
    hotShuffling.value = false;
  }
};

const loadNotices = async () => {
  noticeLoading.value = true;
  try {
    const page = await fetchNotices();
    notices.value = (page.items ?? []).slice(0, 8) as INotice[];
  } catch {
    // 公告失败不影响发现页主体
    notices.value = [];
  } finally {
    noticeLoading.value = false;
  }
};

/** 未读通知数（需登录，失败静默 —— 红点只是辅助提示） */
const loadUnread = async () => {
  const id = accountStore.account.account_id;
  if (!accountStore.loggedIn || !id) {
    unreadCount.value = 0;
    return;
  }
  try {
    const res = await fetchUnreadCount(id);
    unreadCount.value = res.count ?? 0;
  } catch {
    unreadCount.value = 0;
  }
};

onShow(() => {
  void refresh(false);
});

/** 拉取发现页全部数据；下拉时 force=true 会连公告一起刷新 */
const refresh = async (force: boolean) => {
  const tasks: Promise<unknown>[] = [loadHotPosts(), loadUnread()];
  if (force || getNotificationSettings().systemNotice) {
    tasks.push(loadNotices());
  }
  await Promise.allSettled(tasks);
};

onPullDownRefresh(async () => {
  await refresh(true);
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px));
  box-sizing: border-box;
  background-color: $bg-page;
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}

/* ---------------- 顶部搜索条 ---------------- */
.searchbar {
  display: flex;
  align-items: center;
  margin: 20rpx 24rpx 24rpx;
  padding: 0 24rpx;
  height: 76rpx;
  border-radius: 40rpx;
  background-color: $bg-card;
}

.searchbar__icon {
  margin-right: 12rpx;
  font-size: 28rpx;
}

.searchbar__ph {
  font-size: 27rpx;
  color: $text-3;
}

/* ---------------- 微信风格分组列表 ---------------- */
.group {
  margin: 0 24rpx 24rpx;
  border-radius: 20rpx;
  background-color: $bg-card;
  overflow: hidden;
}

.cell {
  display: flex;
  align-items: center;
  padding: 26rpx 32rpx;
  border-bottom: 1rpx solid $border;
}

.cell:last-child {
  border-bottom: none;
}

.cell__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  border-radius: 18rpx;
  margin-right: 24rpx;
  font-size: 36rpx;
  flex-shrink: 0;
}

.cell__icon--video {
  background-color: rgba(255, 90, 90, 0.12);
}

.cell__icon--snap {
  background-color: rgba(2, 122, 255, 0.12);
}

.cell__icon--notice {
  background-color: rgba(255, 170, 0, 0.14);
}

.cell__icon--follow {
  background-color: rgba(124, 92, 255, 0.12);
}

.cell__label {
  font-size: 29rpx;
  font-weight: 500;
  color: $text-1;
}

.cell__sub {
  margin-left: 14rpx;
  font-size: 22rpx;
  color: $text-3;
}

.cell__badge {
  margin-left: auto;
  min-width: 34rpx;
  padding: 0 10rpx;
  height: 34rpx;
  line-height: 34rpx;
  border-radius: 17rpx;
  background-color: #fa5151;
  font-size: 20rpx;
  color: #ffffff;
  text-align: center;
}

.cell__arrow {
  margin-left: auto;
  font-size: 36rpx;
  color: #c8c9cc;
  line-height: 1;
}

/* badge 和 arrow 同时存在时，badge 顶掉 margin-left:auto */
.cell__badge + .cell__arrow {
  margin-left: 12rpx;
}

/* ---------------- 内容区块（热门/公告共用） ---------------- */
.block {
  margin: 0 24rpx 24rpx;
  border-radius: 20rpx;
  background-color: $bg-card;
  overflow: hidden;
}

.block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx 12rpx;
}

.block__title {
  font-size: 30rpx;
  font-weight: 600;
  color: $text-1;
}

.block__sub {
  font-size: 22rpx;
  color: $text-3;
}

.block__refresh {
  display: flex;
  align-items: center;
  padding: 6rpx 0;
}

.block__refresh-icon {
  font-size: 28rpx;
  color: $brand;
  margin-right: 6rpx;
}

.block__refresh-icon--spin {
  animation: hot-spin 0.6s linear infinite;
}

@keyframes hot-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.block__refresh-text {
  font-size: 24rpx;
  color: $brand;
}

.block__tip {
  font-size: 24rpx;
  color: $text-3;
}

.block__empty {
  padding: 32rpx;
  text-align: center;
  font-size: 25rpx;
  color: $text-3;
}

/* ---------------- 热门内容条目 ---------------- */
.hot {
  display: flex;
  align-items: flex-start;
  padding: 24rpx 32rpx;
  border-top: 1rpx solid $border;
}

.hot__rank {
  width: 44rpx;
  font-size: 30rpx;
  font-weight: 700;
  font-style: italic;
  color: $text-3;
  flex-shrink: 0;
}

.hot__rank--top {
  color: #ff7a45;
}

.hot__main {
  flex: 1;
  min-width: 0;
}

.hot__text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 27rpx;
  line-height: 1.5;
  color: $text-1;
  word-break: break-all;
}

.hot__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10rpx;
}

.hot__author {
  font-size: 22rpx;
  color: $text-3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hot__likes {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: 22rpx;
  color: #ff7a45;
}

.hot__thumb {
  width: 128rpx;
  height: 128rpx;
  margin-left: 20rpx;
  border-radius: 12rpx;
  background-color: #f2f3f5;
  flex-shrink: 0;
}

/* ---------------- 公告条目 ---------------- */
.notice {
  padding: 24rpx 32rpx;
  border-top: 1rpx solid $border;
}

.notice__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.notice__title {
  font-size: 28rpx;
  font-weight: 500;
  color: $text-1;
}

.notice__time {
  font-size: 21rpx;
  color: $text-3;
  flex-shrink: 0;
  margin-left: 16rpx;
}

.notice__content {
  display: block;
  margin-top: 8rpx;
  font-size: 25rpx;
  line-height: 1.6;
  color: $text-2;
}
</style>
