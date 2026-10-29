<template>
  <view class="page">
    <!-- 头部资料 -->
    <view class="profile">
      <view class="profile__row">
        <UserAvatar :name="displayName" :src="profile?.avatar" :size="128" />
        <view class="profile__info">
          <text class="profile__name ellipsis">{{ displayName }}</text>
          <text class="profile__id">@{{ profile?.username }}</text>
        </view>
      </view>

      <text v-if="profile?.bio" class="profile__bio">{{ profile.bio }}</text>

      <view class="stats">
        <view class="stats__item" @tap="goFollow('followee')">
          <text class="stats__num">{{ followeeCount }}</text>
          <text class="stats__label">关注</text>
        </view>
        <view class="stats__item" @tap="goFollow('follower')">
          <text class="stats__num">{{ followerCount }}</text>
          <text class="stats__label">粉丝</text>
        </view>
      </view>

      <view v-if="!isSelf" class="actions">
        <view class="follow-btn" :class="{'follow-btn--on': isFollowing}" @tap="toggleFollow">
          {{ isFollowing ? '已关注' : '+ 关注' }}
        </view>
      </view>
    </view>

    <!-- 动态列表 -->
    <view class="section-title">
      <text>TA 的动态</text>
    </view>

    <view v-if="posts.length === 0 && !loading" class="empty">还没有发布内容</view>

    <PostCard v-for="item in posts" :key="item.post_id" :post="item" />

    <LoadMore v-if="posts.length > 0" :status="loadStatus" @refresh="loadPosts" />
  </view>
</template>

<script setup lang="ts">
/**
 * 用户主页（自己 / 他人同一套页面）
 *
 * 为什么要区分 isSelf：
 * 自己的页面不显示关注按钮（关注自己无意义，后端也会拒绝），
 * 但统计、动态列表完全一致，所以不做两个页面。
 */
import {computed, ref} from 'vue';
import {onLoad, onPullDownRefresh, onReachBottom} from '@dcloudio/uni-app';
import UserAvatar from '@/components/UserAvatar.vue';
import PostCard from '@/components/PostCard.vue';
import LoadMore from '@/components/LoadMore.vue';
import {fetchAccountPosts} from '@/api';
import {useAccountStore, useUserCacheStore} from '@/stores/account';
import {compareTimeDesc} from '@/utils/datetime';
import {LOGIN_PAGE, toast} from '@/api/request';
import type {IPost} from '@/types';

const accountStore = useAccountStore();
const userStore = useUserCacheStore();

const accountId = ref('');
const posts = ref<IPost[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(true);

const profile = computed(() => userStore.accountMap[accountId.value]);
const displayName = computed(() => profile.value?.nickname || profile.value?.username || '用户');
const isSelf = computed(() => !!accountId.value && accountId.value === accountStore.account.account_id);
const isFollowing = computed(() => !!profile.value?.follow?.is_following);
const followerCount = computed(() => profile.value?.follow?.follower_count ?? 0);
const followeeCount = computed(() => profile.value?.follow?.followee_count ?? 0);

const loadStatus = computed<'idle' | 'loading' | 'nomore'>(() => {
  if (loadingMore.value) return 'loading';
  return hasMore.value ? 'idle' : 'nomore';
});

/** 拉资料（含关注状态） */
const loadProfile = async () => {
  if (!accountId.value) return;
  try {
    await userStore.fetchUser(accountId.value);
  } catch {
    toast('用户信息加载失败');
  }
};

/** 拉动态（游标分页） */
const loadPosts = async (append = false) => {
  if (!accountId.value || (append && (loadingMore.value || !hasMore.value))) return;
  if (append) loadingMore.value = true;
  else loading.value = true;

  try {
    const last = append ? posts.value[posts.value.length - 1] : null;
    const page = await fetchAccountPosts(accountId.value, last?.post_id ?? null, 10);
    const items = page.items ?? [];
    const merged = append ? [...posts.value, ...items] : items;

    // 去重 + 按时间倒序：后端分页偶发返回重复项时不至于在列表里出现两条一样的
    const map = new Map<string, IPost>();
    merged.forEach((item) => map.set(item.post_id, item));
    posts.value = Array.from(map.values()).sort((a, b) => compareTimeDesc(a.created_at, b.created_at));

    hasMore.value = items.length >= 10;
  } catch (error: any) {
    toast(error?.detail || '加载失败');
  } finally {
    loading.value = false;
    loadingMore.value = false;
    uni.stopPullDownRefresh();
  }
};

/** 关注 / 取消 */
const toggleFollow = async () => {
  if (!accountStore.loggedIn) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  try {
    await userStore.toggleFollow(accountStore.account.account_id, accountId.value);
    toast(isFollowing.value ? '已关注' : '已取消关注');
  } catch (error: any) {
    toast(error?.detail || '操作失败');
  }
};

const goFollow = (tab: 'follower' | 'followee') => {
  if (!accountId.value) return;
  uni.navigateTo({url: `/pages/follow/follow?id=${accountId.value}&tab=${tab}`});
};

onLoad((options) => {
  accountId.value = String(options?.id || '');
  if (!accountId.value) return;
  void loadProfile();
  void loadPosts();
});

onPullDownRefresh(() => {
  void loadProfile();
  void loadPosts();
});

onReachBottom(() => {
  void loadPosts(true);
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $bg-page;
  padding-bottom: 24rpx;
}

.profile {
  padding: 36rpx 32rpx 8rpx;
  background-color: $bg-card;
}

.profile__row {
  display: flex;
  align-items: center;
}

.profile__info {
  flex: 1;
  min-width: 0;
  margin-left: 28rpx;
}

.profile__name {
  display: block;
  font-size: 38rpx;
  font-weight: 700;
}

.profile__id {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: $text-3;
}

.profile__bio {
  display: block;
  margin-top: 20rpx;
  font-size: 27rpx;
  line-height: 1.6;
  color: $text-2;
}

.stats {
  display: flex;
  margin-top: 28rpx;
}

.stats__item {
  display: flex;
  align-items: baseline;
  margin-right: 56rpx;
}

.stats__num {
  font-size: 34rpx;
  font-weight: 600;
}

.stats__label {
  margin-left: 8rpx;
  font-size: 24rpx;
  color: $text-3;
}

.actions {
  padding: 28rpx 0 24rpx;
}

.follow-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 76rpx;
  border-radius: 38rpx;
  background-color: $brand;
  color: #ffffff;
  font-size: 28rpx;
}

.follow-btn--on {
  background-color: #f2f3f5;
  color: $text-2;
}

.section-title {
  padding: 24rpx 32rpx 12rpx;
  font-size: 26rpx;
  color: $text-3;
}
</style>
