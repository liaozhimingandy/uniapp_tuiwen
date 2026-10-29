<template>
  <view class="page">
    <!-- 头部资料（抖音风格） -->
    <view class="header">
      <view class="header__top">
        <UserAvatar :name="displayName" :src="profile?.avatar" :size="140" />
        <view class="header__info">
          <text class="header__name ellipsis">{{ displayName }}</text>
          <text class="header__id">抖音号：@{{ profile?.username }}</text>
          <text v-if="profile?.bio" class="header__bio ellipsis-2">{{ profile.bio }}</text>
        </view>
      </view>

      <!-- 统计 -->
      <view class="stats">
        <view class="stats__item" @tap="goFollow('followee')">
          <text class="stats__num">{{ formatCount(followeeCount) }}</text>
          <text class="stats__label">关注</text>
        </view>
        <view class="stats__item" @tap="goFollow('follower')">
          <text class="stats__num">{{ formatCount(followerCount) }}</text>
          <text class="stats__label">粉丝</text>
        </view>
        <view class="stats__item" @tap="goWorks">
          <text class="stats__num">{{ formatCount(worksCount) }}</text>
          <text class="stats__label">作品</text>
        </view>
      </view>

      <!-- 操作 -->
      <view class="actions">
        <template v-if="isSelf">
          <view class="btn btn--ghost" @tap="gotoSettings">编辑资料</view>
        </template>
        <template v-else>
          <view class="btn" :class="isFollowing ? 'btn--ghost' : 'btn--brand'" @tap="toggleFollow">
            {{ isFollowing ? '已关注' : '+ 关注' }}
          </view>
          <view class="btn btn--ghost" @tap="onMessage">私信</view>
        </template>
      </view>
    </view>

    <!-- 作品 / 喜欢 标签栏 -->
    <view class="tabs">
      <view class="tabs__item" :class="{'tabs__item--on': tab === 'works'}" @tap="tab = 'works'">
        <text>作品</text>
      </view>
      <view class="tabs__item" :class="{'tabs__item--on': tab === 'likes'}" @tap="tab = 'likes'">
        <text>喜欢</text>
      </view>
    </view>

    <!-- 作品网格 -->
    <view v-if="tab === 'works'" class="works">
      <view v-if="posts.length === 0 && !loading" class="works__empty">还没有发布作品</view>
      <view
        v-for="item in posts"
        :key="item.post_id"
        class="work"
        @tap="goDetail(item)"
      >
        <image v-if="coverOf(item)" :src="coverOf(item)" class="work__img" mode="aspectFill" />
        <view v-else class="work__text">
          <text class="work__text-inner">{{ textOf(item) }}</text>
        </view>
        <view v-if="imagesCountOf(item) > 1" class="work__badge">{{ imagesCountOf(item) }}图</view>
      </view>

      <LoadMore v-if="posts.length > 0" :status="loadStatus" @refresh="loadPosts" />
    </view>

    <!-- 喜欢（暂无后端支持，展示空态） -->
    <view v-else class="works">
      <view class="works__empty">该用户暂未公开喜欢的内容</view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 个人主页（抖音风格）
 *
 * 头部：大头像 + 昵称 + 抖音号(@username) + 简介 + 关注/粉丝/作品 统计 + 操作按钮；
 * 下方：作品 / 喜欢 标签栏，作品以三列网格展示（抖音默认布局）。
 *
 * 为什么区分 isSelf：自己的页面不显示关注按钮，但统计、作品列表完全一致，不做两个页面。
 */
import {computed, ref} from 'vue';
import {onLoad, onPullDownRefresh, onReachBottom} from '@dcloudio/uni-app';
import UserAvatar from '@/components/UserAvatar.vue';
import LoadMore from '@/components/LoadMore.vue';
import {fetchAccountPosts, imageUrl} from '@/api';
import {useAccountStore, useUserCacheStore} from '@/stores/account';
import {compareTimeDesc} from '@/utils/datetime';
import {contentImages, contentText, formatCount, stripHtml} from '@/utils/text';
import {LOGIN_PAGE, toast} from '@/api/request';
import type {IPost} from '@/types';

const accountStore = useAccountStore();
const userStore = useUserCacheStore();

const accountId = ref('');
const posts = ref<IPost[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(true);
/** 作品总数（后端分页返回 total，首屏前用已加载条数兜底） */
const total = ref(0);
const tab = ref<'works' | 'likes'>('works');

const profile = computed(() => userStore.accountMap[accountId.value]);
const displayName = computed(() => profile.value?.nickname || profile.value?.username || '用户');
const isSelf = computed(() => !!accountId.value && accountId.value === accountStore.account.account_id);
const isFollowing = computed(() => !!profile.value?.follow?.is_following);
const followerCount = computed(() => profile.value?.follow?.follower_count ?? 0);
const followeeCount = computed(() => profile.value?.follow?.followee_count ?? 0);
const worksCount = computed(() => total.value || posts.value.length);

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
    const page = await fetchAccountPosts(accountId.value, last?.post_id ?? null, 12);
    const items = page.items ?? [];
    const merged = append ? [...posts.value, ...items] : items;

    // 去重 + 按时间倒序：后端分页偶发返回重复项时不至于在列表里出现两条一样的
    const map = new Map<string, IPost>();
    merged.forEach((item) => map.set(item.post_id, item));
    posts.value = Array.from(map.values()).sort((a, b) => compareTimeDesc(a.created_at, b.created_at));

    // 后端 page.total 是真实总数（作品数）
    if (typeof page.total === 'number') total.value = page.total;
    hasMore.value = items.length >= 12;
  } catch (error: any) {
    toast(error?.detail || '加载失败');
  } finally {
    loading.value = false;
    loadingMore.value = false;
    uni.stopPullDownRefresh();
  }
};

/** 作品网格：取首图（拼 CDN） */
const coverOf = (item: IPost): string => {
  const images = contentImages(item.content);
  return images.length ? imageUrl(images[0]) : '';
};

/** 作品网格：无图时取正文首段 */
const textOf = (item: IPost): string => {
  const text = stripHtml(contentText(item.content));
  return text ? text.slice(0, 40) : '查看详情';
};

/** 作品网格：图片数量（多图角标） */
const imagesCountOf = (item: IPost): number => contentImages(item.content).length;

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

const onMessage = () => toast('私信功能暂未开放');

const goDetail = (item: IPost) => uni.navigateTo({url: `/pages/detail/detail?id=${item.post_id}`});
const goFollow = (tabName: 'follower' | 'followee') => {
  if (!accountId.value) return;
  uni.navigateTo({url: `/pages/follow/follow?id=${accountId.value}&tab=${tabName}`});
};
const goWorks = () => { tab.value = 'works'; };
const gotoSettings = () => uni.navigateTo({url: '/pages/settings/settings'});

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

.header {
  padding: 40rpx 32rpx 24rpx;
  background-color: $bg-card;
}

.header__top {
  display: flex;
  align-items: flex-start;
}

.header__info {
  flex: 1;
  min-width: 0;
  margin-left: 28rpx;
  padding-top: 8rpx;
}

.header__name {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: $text-1;
}

.header__id {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: $text-3;
}

.header__bio {
  display: block;
  margin-top: 14rpx;
  font-size: 26rpx;
  line-height: 1.5;
  color: $text-2;
}

.stats {
  display: flex;
  margin-top: 36rpx;
}

.stats__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-right: 56rpx;
}

.stats__num {
  font-size: 36rpx;
  font-weight: 600;
  color: $text-1;
}

.stats__label {
  margin-top: 4rpx;
  font-size: 23rpx;
  color: $text-3;
}

.actions {
  display: flex;
  margin-top: 32rpx;
}

.btn {
  flex: 1;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;
  font-size: 28rpx;
  font-weight: 600;
}

.btn--brand {
  background-color: $brand;
  color: #ffffff;
}

.btn--ghost {
  background-color: #f2f3f5;
  color: $text-1;
  margin-left: 20rpx;
}

.tabs {
  display: flex;
  margin-top: 20rpx;
  background-color: $bg-card;
  border-bottom: 1rpx solid $border;
}

.tabs__item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 92rpx;
  font-size: 29rpx;
  color: $text-2;
  position: relative;
}

.tabs__item--on {
  color: $text-1;
  font-weight: 600;
}

.tabs__item--on::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 48rpx;
  height: 6rpx;
  border-radius: 3rpx;
  background-color: $brand;
}

.works {
  display: flex;
  flex-wrap: wrap;
  padding: 3rpx;
  background-color: $bg-page;
}

.work {
  position: relative;
  width: calc((100% - 12rpx) / 3);
  aspect-ratio: 1 / 1;
  margin: 3rpx;
  border-radius: 8rpx;
  overflow: hidden;
  background-color: $bg-card;
}

.work__img {
  width: 100%;
  height: 100%;
}

.work__text {
  width: 100%;
  height: 100%;
  padding: 18rpx;
  background: linear-gradient(135deg, #e8edf5, #f6f7fb);
  box-sizing: border-box;
}

.work__text-inner {
  font-size: 24rpx;
  line-height: 1.5;
  color: $text-2;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  overflow: hidden;
}

.work__badge {
  position: absolute;
  right: 10rpx;
  bottom: 10rpx;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  font-size: 20rpx;
  color: #ffffff;
  background-color: rgba(0, 0, 0, 0.45);
}

.works__empty {
  width: 100%;
  padding: 120rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: $text-3;
}
</style>
