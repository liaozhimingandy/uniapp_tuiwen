<template>
  <view class="page">
    <!-- 未登录 -->
    <view v-if="!accountStore.loggedIn" class="guest">
      <UserAvatar name="?" :size="140" />
      <text class="guest__title">还没有登录</text>
      <view class="btn-primary guest__btn" @tap="goLogin">登录 / 注册</view>
    </view>

    <template v-else>
      <!-- 个人卡片 -->
      <view class="profile">
        <view class="profile__row" @tap="goMine">
          <UserAvatar :name="displayName" :src="accountStore.account.avatar" :size="128" />
          <view class="profile__info">
            <text class="profile__name ellipsis">{{ displayName }}</text>
            <text class="profile__id">@{{ accountStore.account.username || accountStore.account.account_id }}</text>
            <text v-if="accountStore.account.bio" class="profile__bio ellipsis">{{ accountStore.account.bio }}</text>
          </view>
          <text class="profile__arrow">›</text>
        </view>

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
      </view>

      <!-- 菜单 -->
      <view class="group">
        <view class="cell" @tap="goto('/pages/publish/publish')">
          <text class="cell__title">发一条动态</text>
          <text class="cell__arrow">›</text>
        </view>
        <view class="cell" @tap="goto('/pages/settings/settings')">
          <text class="cell__title">编辑资料</text>
          <text class="cell__arrow">›</text>
        </view>
        <view class="cell" @tap="goMine">
          <text class="cell__title">我的主页</text>
          <text class="cell__arrow">›</text>
        </view>
      </view>

      <view class="group">
        <view class="cell" @tap="editServer">
          <text class="cell__title">服务器地址</text>
          <text class="cell__value ellipsis">{{ serverHost }}</text>
          <text class="cell__arrow">›</text>
        </view>
        <view class="cell" @tap="showAbout">
          <text class="cell__title">关于</text>
          <text class="cell__value">v{{ version }}</text>
          <text class="cell__arrow">›</text>
        </view>
      </view>

      <view class="group">
        <view class="cell cell--danger" @tap="confirmLogout">
          <text class="cell__title">退出登录</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
/**
 * 我的
 *
 * 关注/粉丝数来自 `/follows/{account_id}/count/`：
 * 该接口对**未登录**也会返回计数，只是 is_following 恒为 false，因此可以公开拉取。
 */
import {computed, ref} from 'vue';
import {onShow} from '@dcloudio/uni-app';
import UserAvatar from '@/components/UserAvatar.vue';
import {useAccountStore, usePostStore, useUserCacheStore} from '@/stores/account';
import {fetchFollow} from '@/api';
import {config, getApiBaseUrl, setCustomApiBaseUrl} from '@/config';
import {toast, LOGIN_PAGE} from '@/api/request';
import type {IFollow} from '@/types';

const accountStore = useAccountStore();
const postStore = usePostStore();
const userStore = useUserCacheStore();

const follow = ref<IFollow | null>(null);
const version = config.VERSION;

const displayName = computed(() => accountStore.displayName);
const followeeCount = computed(() => follow.value?.followee_count ?? 0);
const followerCount = computed(() => follow.value?.follower_count ?? 0);
const serverHost = computed(() => getApiBaseUrl().replace(/^https?:\/\//i, ''));

/** 拉自己的关注统计 */
const loadStats = async () => {
  const id = accountStore.account.account_id;
  if (!id) return;
  try {
    follow.value = await fetchFollow(id);
    // 顺手写进缓存，关注/粉丝列表页能直接复用
    userStore.setUser(id, {account_id: id, follow: follow.value});
  } catch {
    // 静默：统计失败不该打断"我的"页面
  }
};

const goLogin = () => uni.navigateTo({url: LOGIN_PAGE});
const goto = (url: string) => uni.navigateTo({url});

/** 自己的主页：用 user 页面，保证与看别人主页的交互一致 */
const goMine = () => {
  const id = accountStore.account.account_id;
  if (!id) return;
  uni.navigateTo({url: `/pages/user/user?id=${id}`});
};

/** 关注 / 粉丝列表 */
const goFollow = (tab: 'follower' | 'followee') => {
  const id = accountStore.account.account_id;
  if (!id) return;
  uni.navigateTo({url: `/pages/follow/follow?id=${id}&tab=${tab}`});
};

/** 修改服务器地址（App 端无法改 .env，留个口子） */
const editServer = () => {
  uni.showModal({
    title: '服务器地址',
    editable: true,
    placeholderText: 'https://api.tuiwen.alsoapp.com',
    content: getApiBaseUrl(),
    success: (res) => {
      if (!res.confirm) return;
      const value = (res.content || '').trim();
      if (value && !/^https?:\/\//i.test(value)) {
        toast('地址需以 http:// 或 https:// 开头');
        return;
      }
      setCustomApiBaseUrl(value);
      toast(value ? '已切换服务器' : '已恢复默认服务器');
    },
  });
};

const showAbout = () => {
  uni.showModal({
    title: '推文',
    content: `版本 ${version}\n记录此刻，天亮即焚。\n\nuni-app 跨平台客户端`,
    showCancel: false,
  });
};

/** 退出登录：二次确认，避免误触把登录态清了 */
const confirmLogout = () => {
  uni.showModal({
    title: '退出登录',
    content: '退出后需要重新登录才能发帖和评论',
    confirmColor: '#E34D59',
    success: (res) => {
      if (!res.confirm) return;
      accountStore.logout();
      postStore.reset();
      follow.value = null;
      toast('已退出登录');
    },
  });
};

onShow(() => {
  if (!accountStore.loggedIn) return;
  // 资料可能在本端别处被改过（如编辑资料页），每次进来重拉一次
  void accountStore.loadSelf();
  void loadStats();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $bg-page;
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}

.guest {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 48rpx;
}

.guest__title {
  margin-top: 32rpx;
  font-size: 32rpx;
  color: $text-2;
}

.guest__btn {
  width: 400rpx;
  margin-top: 48rpx;
}

.profile {
  background-color: $bg-card;
  padding: 40rpx 32rpx 8rpx;
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
  margin-top: 8rpx;
  font-size: 25rpx;
  color: $text-2;
}

.profile__arrow {
  font-size: 40rpx;
  color: #c8ccd4;
}

.stats {
  display: flex;
  margin-top: 32rpx;
  padding-bottom: 28rpx;
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

.group {
  margin-top: 20rpx;
  background-color: $bg-card;
}

.cell {
  display: flex;
  align-items: center;
  min-height: 100rpx;
  padding: 0 32rpx;
  border-bottom: 1rpx solid $border;

  &:last-child {
    border-bottom: none;
  }
}

.cell__title {
  flex: 1;
  font-size: 30rpx;
  color: $text-1;
}

.cell__value {
  max-width: 360rpx;
  margin-right: 8rpx;
  font-size: 25rpx;
  color: $text-3;
}

.cell__arrow {
  font-size: 36rpx;
  color: #c8ccd4;
}

.cell--danger .cell__title {
  color: $danger;
  text-align: center;
}
</style>
