<template>
  <view class="page">
    <!-- 未登录提示条：仍能浏览公开推文，发帖/互动时再引导登录 -->
    <view v-if="!accountStore.loggedIn" class="loginbar" @tap="goLogin">
      <text class="loginbar__text">登录后可发布与互动</text>
      <text class="loginbar__action">去登录 ›</text>
    </view>

    <!-- 新内容提示条：轮询发现新帖时浮在顶部，点一下插入列表 -->
    <view v-if="pendingPosts.length" class="newbar" @tap="applyPending">
      <text>{{ pendingPosts.length }} 条新内容，点击查看</text>
    </view>

    <view v-if="posts.length === 0 && !loading" class="empty">
      <text>还没有内容，发一条试试</text>
    </view>

    <PostCard v-for="item in posts" :key="item.post_id" :post="item" />

    <LoadMore v-if="posts.length > 0" :status="loadStatus" @refresh="refresh" />

    <!-- 发帖入口（固定右下角，避开 tabBar） -->
    <view v-if="accountStore.loggedIn" class="fab" @tap="goPublish">
      <text class="fab__icon">+</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 首页信息流
 *
 * 分页：后端是**游标分页**（cursor = 上一页最后一条的 post_id），
 * 不是 offset 分页——用 offset 在有人发新帖时会重复/漏数据。
 *
 * 刷新策略：
 * - 下拉刷新：重新拉第一页并整体替换
 * - 进入页面：只拉 `/posts/latest/`，把本地没有的攒成"新内容"提示条，
 *   不打断用户正在看的位置（直接插到顶部会让列表跳动）
 */
import {computed, ref} from 'vue';
import {onPullDownRefresh, onReachBottom, onShow} from '@dcloudio/uni-app';
import PostCard from '@/components/PostCard.vue';
import LoadMore from '@/components/LoadMore.vue';
import {fetchLatestPosts, fetchPosts} from '@/api';
import {useAccountStore, usePostStore} from '@/stores/account';
import type {IPost} from '@/types';
import {LOGIN_PAGE, toast} from '@/api/request';

const accountStore = useAccountStore();
const postStore = usePostStore();

const posts = computed(() => postStore.posts);
const loading = ref(false);
/** 下拉/首屏请求在途时，避免触底重复拉 */
const loadingMore = ref(false);
const hasMore = ref(true);
/** 本地没有的最新帖子 */
const pendingPosts = ref<IPost[]>([]);

const loadStatus = computed<'idle' | 'loading' | 'nomore'>(() => {
  if (loadingMore.value) return 'loading';
  return hasMore.value ? 'idle' : 'nomore';
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

/** 触底加载下一页 */
const loadMore = async () => {
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

/** 拉最新（不打断当前列表，未登录也能看公开推文，故不限制登录） */
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
const goRegister = () => uni.navigateTo({url: '/pages/register/register'});
const goPublish = () => {
  if (!accountStore.loggedIn) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  uni.navigateTo({url: '/pages/publish/publish'});
};

onShow(() => {
  // 未登录也能展示公开推文：首屏加载、有内容后再轮询"新内容"提示条
  if (posts.value.length === 0) {
    void refresh(true);
    return;
  }
  void checkLatest();
});

onPullDownRefresh(() => {
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

.newbar {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 16rpx 0;
  text-align: center;
  font-size: 25rpx;
  color: $brand;
  background-color: $brand-light;
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
