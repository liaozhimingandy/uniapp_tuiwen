<template>
  <view class="page">
    <!-- 顶部导航：Logo + 搜索 / 通知（发布走右下角 FAB，单手更顺手） -->
    <view class="topnav">
      <text class="topnav__logo">推文</text>
      <view class="topnav__actions">
        <view class="topnav__btn" hover-class="topnav__btn--hover" @tap="goSearch">
          <text class="topnav__icon">搜</text>
        </view>
        <view class="topnav__btn" hover-class="topnav__btn--hover" @tap="goNotification">
          <text class="topnav__icon">铃</text>
        </view>
      </view>
    </view>

    <!-- 推荐 / 关注 双 Feed -->
    <view class="feedtabs">
      <view class="feedtabs__item" :class="{'feedtabs__item--on': feedTab === 'rec'}" @tap="switchFeed('rec')">
        <text>推荐</text>
      </view>
      <view class="feedtabs__item" :class="{'feedtabs__item--on': feedTab === 'follow'}" @tap="switchFeed('follow')">
        <text>关注</text>
      </view>
    </view>

    <!-- 未登录提示条：仍能浏览公开推文，发帖/互动时再引导登录 -->
    <view v-if="!accountStore.loggedIn" class="loginbar" @tap="goLogin">
      <text class="loginbar__text">登录后可发布与互动</text>
      <text class="loginbar__action">去登录 ›</text>
    </view>

    <!-- 新内容提示条：轮询发现新帖时浮在顶部，点一下插入列表（仅推荐流） -->
    <view v-if="feedTab === 'rec' && pendingPosts.length && newContentAlert" class="newbar" @tap="applyPending">
      <text>{{ pendingPosts.length }} 条新内容，点击查看 ›</text>
    </view>

    <!-- 推荐流 -->
    <template v-if="feedTab === 'rec'">
      <view v-if="posts.length === 0 && !loading" class="empty">
        <text>还没有内容，发一条试试</text>
      </view>

      <PostCard v-for="item in posts" :key="item.post_id" :post="item" />

      <LoadMore v-if="posts.length > 0" :status="loadStatus" @refresh="refresh" />
    </template>

    <!-- 关注流 -->
    <template v-else>
      <!-- 未登录：引导登录（关注流必须知道"我是谁"） -->
      <view v-if="!accountStore.loggedIn" class="empty">
        <text class="empty__title">登录后查看关注的人的动态</text>
        <view class="empty__btn" @tap="goLogin">去登录</view>
      </view>

      <template v-else>
        <view v-if="followPosts.length === 0 && !followLoading" class="empty">
          <text class="empty__title">关注的人还没有发布内容</text>
          <view class="empty__btn" @tap="goDiscover">去发现更多用户</view>
        </view>

        <PostCard v-for="item in followPosts" :key="item.post_id" :post="item" />

        <LoadMore v-if="followPosts.length > 0" :status="followLoadStatus" @refresh="loadFollowFeed" />
      </template>
    </template>

    <!-- 发帖入口（固定右下角，避开 tabBar） -->
    <view v-if="accountStore.loggedIn" class="fab" @tap="goPublish">
      <text class="fab__icon">+</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 首页信息流：推荐 / 关注 双 Feed
 *
 * 分页：后端是**游标分页**（cursor = 上一页最后一条的 post_id），
 * 不是 offset 分页——用 offset 在有人发新帖时会重复/漏数据。
 *
 * 刷新策略：
 * - 下拉刷新：重新拉第一页并整体替换
 * - 进入页面：只拉 `/posts/latest/`，把本地没有的攒成"新内容"提示条，
 *   不打断用户正在看的位置（直接插到顶部会让列表跳动）
 *
 * 双 Feed：
 * - 推荐：复用 postStore（匿名可看公开帖）
 * - 关注：独立本地列表（需登录，关注对象的公开帖 + 自己的帖子）
 */
import {computed, ref} from 'vue';
import {onHide, onPullDownRefresh, onReachBottom, onShow, onUnload} from '@dcloudio/uni-app';
import PostCard from '@/components/PostCard.vue';
import LoadMore from '@/components/LoadMore.vue';
import {fetchFollowPosts, fetchLatestPosts, fetchPosts} from '@/api';
import {useAccountStore, usePostStore} from '@/stores/account';
import {getNotificationSettings} from '@/utils/notification';
import type {IPost} from '@/types';
import {LOGIN_PAGE, toast} from '@/api/request';

/** 轮询间隔：每 30s 拉一次最新，发现新帖才提示（不打断浏览） */
const POLL_INTERVAL = 30_000;

const accountStore = useAccountStore();
const postStore = usePostStore();

/** 当前 Feed：rec = 推荐（匿名可用），follow = 关注（需登录） */
const feedTab = ref<'rec' | 'follow'>('rec');

const posts = computed(() => postStore.posts);
const loading = ref(false);
/** 下拉/首屏请求在途时，避免触底重复拉 */
const loadingMore = ref(false);
const hasMore = ref(true);
/** 本地没有的最新帖子 */
const pendingPosts = ref<IPost[]>([]);
/** 是否允许浮出"新内容"提示（受通知设置控制） */
const newContentAlert = ref(true);
/** 轮询定时器（离开页面必须清掉，否则后台一直打接口） */
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ---------------- 关注流（独立列表，不污染 postStore） ----------------
const followPosts = ref<IPost[]>([]);
const followLoading = ref(false);
const followLoadingMore = ref(false);
const followHasMore = ref(true);
/** 是否加载过第一页（切 Tab 时按需拉，不预取） */
let followLoaded = false;

const loadStatus = computed<'idle' | 'loading' | 'nomore'>(() => {
  if (loadingMore.value) return 'loading';
  return hasMore.value ? 'idle' : 'nomore';
});

const followLoadStatus = computed<'idle' | 'loading' | 'nomore'>(() => {
  if (followLoadingMore.value) return 'loading';
  return followHasMore.value ? 'idle' : 'nomore';
});

/** 首屏 / 下拉刷新：重拉第一页 */
const refresh = async (silent = false) => {
  if (loading.value) return;
  loading.value = true;
  try {
    const page = await fetchPosts(null, 10);
    const items = page.items ?? [];
    postStore.reset();
    postStore.addPosts(items);
    hasMore.value = items.length >= 10;
    pendingPosts.value = [];
  } catch (error: any) {
    if (!silent) toast(error?.detail || '加载失败，请下拉重试');
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
};

/** 触底加载下一页（按当前 Tab 分别走各自的游标） */
const loadMore = async () => {
  if (feedTab.value === 'follow') {
    void loadFollowFeed(true);
    return;
  }
  if (loading.value || loadingMore.value || !hasMore.value) return;
  const last = posts.value[posts.value.length - 1];
  if (!last) return;

  loadingMore.value = true;
  try {
    const page = await fetchPosts(last.post_id, 10);
    const items = page.items ?? [];
    postStore.addPosts(items);
    // 返回不足一页即到底：再请求一次也是空，没必要让用户多点一次
    hasMore.value = items.length >= 10;
  } catch (error: any) {
    toast(error?.detail || '加载更多失败');
  } finally {
    loadingMore.value = false;
  }
};

/** 关注流：首屏 / 加载更多（append=true 时取下一页） */
const loadFollowFeed = async (append = false) => {
  if (!accountStore.loggedIn) return;
  if (append && (followLoadingMore.value || !followHasMore.value)) return;

  if (append) followLoadingMore.value = true;
  else followLoading.value = true;

  try {
    const last = append ? followPosts.value[followPosts.value.length - 1] : null;
    const page = await fetchFollowPosts(last?.post_id ?? null, 10);
    const items = page.items ?? [];

    // 去重 + 按时间倒序，防止翻页边界重复
    const map = new Map<string, IPost>();
    const merged = append ? [...followPosts.value, ...items] : items;
    merged.forEach((item) => map.set(item.post_id, item));
    followPosts.value = Array.from(map.values())
      .sort((a, b) => (a.post_id > b.post_id ? -1 : 1));

    followHasMore.value = items.length >= 10;
    followLoaded = true;
  } catch (error: any) {
    toast(error?.detail || '加载失败，请下拉重试');
  } finally {
    followLoading.value = false;
    followLoadingMore.value = false;
    uni.stopPullDownRefresh();
  }
};

/** 切换 Feed：关注流首次进入按需拉一页 */
const switchFeed = (tab: 'rec' | 'follow') => {
  if (feedTab.value === tab) return;
  feedTab.value = tab;
  if (tab === 'follow' && !followLoaded && accountStore.loggedIn) {
    void loadFollowFeed();
  }
};

/** 拉最新（不打断当前列表，未登录也能看公开推文，故不限制登录；只对推荐流有意义） */
const checkLatest = async () => {
  if (loading.value) return;
  try {
    const page = await fetchLatestPosts();
    const items = page.items ?? [];
    const known = new Set(posts.value.map((item) => item.post_id));
    const fresh = items.filter((item) => !known.has(item.post_id));
    // 去重 + 限流：提示条只是"有新内容"，攒太多反而挡住内容
    const seen = new Set<string>();
    pendingPosts.value = [...fresh, ...pendingPosts.value]
      .filter((item) => {
        if (seen.has(item.post_id)) return false;
        seen.add(item.post_id);
        return true;
      })
      .slice(0, 20);
  } catch {
    // 静默：只是提示条，失败不该弹窗
  }
};

/** 应用新内容：插到列表顶部并清空提示 */
const applyPending = () => {
  postStore.addPosts(pendingPosts.value);
  pendingPosts.value = [];
  uni.pageScrollTo({scrollTop: 0, duration: 200});
};

const goLogin = () => uni.navigateTo({url: LOGIN_PAGE});
const goSearch = () => uni.navigateTo({url: '/pages/search/search'});
const goNotification = () => uni.navigateTo({url: '/pages/notification/notification'});
const goDiscover = () => uni.switchTab({url: '/pages/discover/discover'});
const goPublish = () => {
  if (!accountStore.loggedIn) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  uni.navigateTo({url: '/pages/publish/publish'});
};

onShow(() => {
  // 未登录也能展示公开推文：首屏加载、有内容后再轮询"新内容"提示条
  const settings = getNotificationSettings();
  newContentAlert.value = settings.newContentAlert;
  if (posts.value.length === 0) {
    void refresh(true);
  } else {
    void checkLatest();
  }
  // 关注流：登录后回来时若为空则补拉（如刚登录/刚关注了人）
  if (feedTab.value === 'follow' && accountStore.loggedIn && !followLoaded) {
    void loadFollowFeed();
  }
  // 开启"新内容提醒"才轮询，离开页面会停掉
  startPolling(settings.newContentAlert);
});

/** 启动轮询（先清旧的，避免来回切换页面重复挂定时器） */
const startPolling = (enabled: boolean) => {
  stopPolling();
  if (!enabled) return;
  pollTimer = setInterval(() => {
    void checkLatest();
  }, POLL_INTERVAL);
};

/** 停止轮询 */
const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

onHide(stopPolling);
onUnload(stopPolling);

onPullDownRefresh(() => {
  // 按当前 Tab 刷新各自的流
  if (feedTab.value === 'follow' && accountStore.loggedIn) {
    followLoaded = false;
    void loadFollowFeed();
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
  min-height: 100vh;
  background-color: $bg-page;
  padding-bottom: 24rpx;
}

.topnav {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx;
  background-color: $bg-page;
}

.topnav__logo {
  font-size: 36rpx;
  font-weight: 700;
  color: $brand;
  letter-spacing: 2rpx;
}

.topnav__actions {
  display: flex;
  align-items: center;
}

.topnav__btn {
  width: 64rpx;
  height: 64rpx;
  margin-left: 16rpx;
  border-radius: 32rpx;
  background-color: $bg-card;
  border: 1rpx solid $border;
  display: flex;
  align-items: center;
  justify-content: center;
}

.topnav__btn--hover {
  background-color: $brand-light;
}

.topnav__icon {
  font-size: 28rpx;
  color: $text-1;
}

.feedtabs {
  position: sticky;
  /* 跟在 topnav（64+32rpx 高）下面吸附 */
  top: 96rpx;
  z-index: 29;
  display: flex;
  justify-content: center;
  background-color: $bg-page;
  padding: 8rpx 0 0;
}

.feedtabs__item {
  position: relative;
  padding: 12rpx 40rpx;
  font-size: 30rpx;
  color: $text-2;
}

.feedtabs__item--on {
  font-weight: 700;
  color: $text-1;

  /* 下划线指示条 */
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 4rpx;
    transform: translateX(-50%);
    width: 48rpx;
    height: 6rpx;
    border-radius: 3rpx;
    background-color: $brand;
  }
}

.loginbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16rpx 24rpx 0;
  padding: 20rpx 28rpx;
  border-radius: 16rpx;
  background-color: $brand-light;
}

.loginbar__text {
  font-size: 26rpx;
  color: $brand;
}

.loginbar__action {
  font-size: 26rpx;
  font-weight: 600;
  color: $brand;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 48rpx;
}

.empty__title {
  font-size: 27rpx;
  color: $text-3;
}

.empty__btn {
  margin-top: 28rpx;
  padding: 16rpx 56rpx;
  border-radius: 999rpx;
  font-size: 27rpx;
  color: #ffffff;
  background-color: $brand;
}

.newbar {
  position: sticky;
  top: 140rpx;
  z-index: 20;
  margin: 16rpx auto;
  width: fit-content;
  max-width: 84%;
  padding: 14rpx 32rpx;
  border-radius: 999rpx;
  text-align: center;
  font-size: 25rpx;
  color: #ffffff;
  background-color: $brand;
  box-shadow: 0 6rpx 18rpx rgba(2, 122, 255, 0.35);
}

.fab {
  position: fixed;
  right: 36rpx;
  bottom: calc(48rpx + env(safe-area-inset-bottom));
  /* #ifdef H5 */
  /* H5 的 tabBar 是 position:fixed 覆盖层（z-index 998），固定的 FAB 会被压在下面 */
  bottom: calc(48rpx + 50px + env(safe-area-inset-bottom));
  /* #endif */
  width: 104rpx;
  height: 104rpx;
  border-radius: 52rpx;
  background-color: $brand;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(2, 122, 255, 0.35);
}

.fab__icon {
  color: #ffffff;
  font-size: 56rpx;
  line-height: 1;
  margin-top: -4rpx;
}
</style>
