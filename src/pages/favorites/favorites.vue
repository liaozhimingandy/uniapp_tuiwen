<template>
  <view class="page">
    <view v-if="loading" class="empty">加载中…</view>
    <view v-else-if="posts.length === 0" class="empty">还没有收藏内容</view>

    <view v-for="item in posts" :key="item.post_id" class="card">
      <PostCard :post="item" />
    </view>

    <LoadMore v-if="posts.length > 0" :status="loadStatus" @refresh="loadMore" />
  </view>
</template>

<script setup lang="ts">
/**
 * 我的收藏
 *
 * 数据源: GET /favorites/account/{me}/（非本人只返回公开收藏；
 * 本页只展示自己的，天然全量）。游标分页复用作品流同款 LoadMore。
 */
import {computed, ref} from 'vue';
import {onLoad, onPullDownRefresh, onReachBottom} from '@dcloudio/uni-app';
import PostCard from '@/components/PostCard.vue';
import LoadMore from '@/components/LoadMore.vue';
import {fetchFavoritedPosts} from '@/api';
import {useAccountStore} from '@/stores/account';
import {compareTimeDesc} from '@/utils/datetime';
import type {IPost} from '@/types';
import {toast} from '@/api/request';

const accountStore = useAccountStore();

const posts = ref<IPost[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(true);

const loadStatus = computed<'idle' | 'loading' | 'nomore'>(() => {
  if (loadingMore.value) return 'loading';
  return hasMore.value ? 'idle' : 'nomore';
});

const LIMIT = 10;

const load = async (append = false) => {
  const me = accountStore.account?.account_id;
  if (!me || (append && (loadingMore.value || !hasMore.value))) return;
  if (append) loadingMore.value = true;
  else loading.value = true;

  try {
    const last = append ? posts.value[posts.value.length - 1] : null;
    const res = await fetchFavoritedPosts(me, last?.post_id ?? null, LIMIT);
    const items = res.items ?? [];
    const merged = append ? [...posts.value, ...items] : items;

    // 去重 + 时间倒序（与作品流同口径）
    const map = new Map<string, IPost>();
    merged.forEach((item) => map.set(item.post_id, item));
    posts.value = Array.from(map.values()).sort((a, b) => compareTimeDesc(a.created_at, b.created_at));

    hasMore.value = items.length >= LIMIT;
  } catch (error: any) {
    toast(error?.detail || '加载失败');
  } finally {
    loading.value = false;
    loadingMore.value = false;
    uni.stopPullDownRefresh();
  }
};

const loadMore = () => load(true);

onLoad(() => {
  void load();
});

onPullDownRefresh(() => {
  void load();
});

onReachBottom(() => {
  void load(true);
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $bg-page;
  padding-bottom: 40rpx;
}

.card {
  margin: 20rpx 24rpx 0;
}

.empty {
  text-align: center;
  padding: 160rpx 0;
  font-size: 26rpx;
  color: $text-3;
}
</style>
