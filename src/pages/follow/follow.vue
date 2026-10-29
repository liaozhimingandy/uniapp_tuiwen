<template>
  <view class="page">
    <view class="tabs">
      <view class="tabs__item" :class="{'tabs__item--on': tab === 'followee'}" @tap="switchTab('followee')">
        关注
      </view>
      <view class="tabs__item" :class="{'tabs__item--on': tab === 'follower'}" @tap="switchTab('follower')">
        粉丝
      </view>
    </view>

    <view v-if="loading" class="empty">加载中…</view>
    <view v-else-if="list.length === 0" class="empty">{{ emptyText }}</view>

    <view v-for="item in list" :key="item.account_id" class="row" @tap="goUser(item.account_id)">
      <UserAvatar :name="item.nickname || item.username" :src="item.avatar" :size="88" />
      <view class="row__info">
        <text class="row__name ellipsis">{{ item.nickname || item.username || '用户' }}</text>
        <text v-if="item.bio" class="row__bio ellipsis">{{ item.bio }}</text>
      </view>
      <text class="row__arrow">›</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 关注 / 粉丝列表
 *
 * 后端这两个接口（`/follows/{id}/followees|followers/`）在部分环境尚未实现，
 * 会返回 404。这里明确区分"没有人"和"接口没开"：
 * 都用 404 兜底文案会让人误以为是自己的数据丢了。
 */
import {computed, ref} from 'vue';
import {onLoad} from '@dcloudio/uni-app';
import UserAvatar from '@/components/UserAvatar.vue';
import {fetchFollowees, fetchFollowers} from '@/api';
import type {IAccount} from '@/types';

const accountId = ref('');
const tab = ref<'follower' | 'followee'>('followee');
const list = ref<IAccount[]>([]);
const loading = ref(false);
/** 接口未实现（404）时给出更准确的提示 */
const unsupported = ref(false);

const emptyText = computed(() => {
  if (unsupported.value) return '该功能暂未开放';
  return tab.value === 'followee' ? '还没有关注任何人' : '还没有粉丝';
});

const load = async () => {
  if (!accountId.value) return;
  loading.value = true;
  unsupported.value = false;
  try {
    const page = tab.value === 'followee' ? await fetchFollowees(accountId.value) : await fetchFollowers(accountId.value);
    list.value = page?.items ?? [];
  } catch (error: any) {
    list.value = [];
    // 404 = 后端没实现该路由，不是"没有数据"
    if (error?.status === 404) unsupported.value = true;
  } finally {
    loading.value = false;
  }
};

const switchTab = (next: 'follower' | 'followee') => {
  if (tab.value === next) return;
  tab.value = next;
  list.value = [];
  void load();
};

const goUser = (id: string) => {
  uni.navigateTo({url: `/pages/user/user?id=${id}`});
};

onLoad((options) => {
  accountId.value = String(options?.id || '');
  const preset = String(options?.tab || '');
  if (preset === 'follower' || preset === 'followee') tab.value = preset;
  void load();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $bg-page;
}

.tabs {
  display: flex;
  background-color: $bg-card;
}

.tabs__item {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  font-size: 28rpx;
  color: $text-2;
  border-bottom: 4rpx solid transparent;
}

.tabs__item--on {
  color: $brand;
  font-weight: 600;
  border-bottom-color: $brand;
}

.row {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx;
  background-color: $bg-card;
  border-bottom: 1rpx solid $border;
}

.row__info {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.row__name {
  display: block;
  font-size: 30rpx;
  font-weight: 500;
}

.row__bio {
  display: block;
  margin-top: 4rpx;
  font-size: 24rpx;
  color: $text-3;
}

.row__arrow {
  font-size: 36rpx;
  color: #c8ccd4;
}
</style>
