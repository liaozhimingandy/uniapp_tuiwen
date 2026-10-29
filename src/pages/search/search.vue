<template>
  <view class="page">
    <!-- 搜索框 -->
    <view class="searchbar">
      <view class="searchbar__box">
        <input
          v-model="keyword"
          class="searchbar__input"
          placeholder="搜索用户或内容"
          placeholder-class="searchbar__placeholder"
          confirm-type="search"
          :focus="autoFocus"
          @confirm="doSearch"
        />
        <text v-if="keyword" class="searchbar__clear" @tap="clearKeyword">×</text>
      </view>
      <text class="searchbar__btn" @tap="doSearch">搜索</text>
    </view>

    <!-- 历史记录 -->
    <view v-if="!searched && history.length" class="history">
      <view class="history__head">
        <text class="history__title">搜索历史</text>
        <text class="history__clear" @tap="clearHistory">清空</text>
      </view>
      <view class="history__tags">
        <text v-for="item in history" :key="item" class="tag" @tap="useHistory(item)">{{ item }}</text>
      </view>
    </view>

    <template v-if="searched">
      <!-- 分类 -->
      <view class="tabs">
        <view class="tabs__item" :class="{'tabs__item--on': tab === 'user'}" @tap="switchTab('user')">
          <text>用户</text>
          <text v-if="users.length" class="tabs__count">{{ users.length }}</text>
        </view>
        <view class="tabs__item" :class="{'tabs__item--on': tab === 'post'}" @tap="switchTab('post')">
          <text>内容</text>
          <text v-if="posts.length" class="tabs__count">{{ posts.length }}</text>
        </view>
      </view>

      <!-- 用户结果 -->
      <template v-if="tab === 'user'">
        <view v-if="loading" class="empty">搜索中…</view>
        <view v-else-if="users.length === 0" class="empty">没有找到相关用户</view>
        <view v-for="item in users" :key="item.account_id" class="user-row" @tap="goUser(item.account_id)">
          <UserAvatar :name="item.nickname || item.username" :src="item.avatar" :size="88" />
          <view class="user-row__info">
            <text class="user-row__name ellipsis">{{ item.nickname || item.username || '用户' }}</text>
            <text class="user-row__id ellipsis">@{{ item.username || item.account_id }}</text>
          </view>
        </view>
      </template>

      <!-- 内容结果 -->
      <template v-else>
        <view v-if="loading" class="empty">搜索中…</view>
        <view v-else-if="posts.length === 0" class="empty">没有找到相关内容</view>
        <PostCard v-for="item in posts" :key="item.post_id" :post="item" />
      </template>
    </template>
  </view>
</template>

<script setup lang="ts">
/**
 * 搜索
 *
 * 用户搜索走 `/accounts/search/{q}/`（offset/limit 分页，有 total）；
 * 内容搜索走 `/posts/search/{q}/`，后端未实现时返回 404 —— 这种情况按"暂无结果"
 * 处理并给出提示，而不是弹一个刺眼的 404 错误（用户会以为是自己网断了）。
 */
import {ref} from 'vue';
import {onLoad} from '@dcloudio/uni-app';
import UserAvatar from '@/components/UserAvatar.vue';
import PostCard from '@/components/PostCard.vue';
import {searchAccounts, searchPosts} from '@/api';
import {getItem, setItem} from '@/utils/storage';
import {toast} from '@/api/request';
import type {IAccount, IPost} from '@/types';

const HISTORY_KEY = 'tw_search_history';

const keyword = ref('');
const tab = ref<'user' | 'post'>('user');
const users = ref<IAccount[]>([]);
const posts = ref<IPost[]>([]);
const loading = ref(false);
const searched = ref(false);
const autoFocus = ref(false);

const history = ref<string[]>(getItem<string[]>(HISTORY_KEY, []));

/** 写入搜索历史（去重，最多 10 条） */
const pushHistory = (word: string) => {
  const next = [word, ...history.value.filter((item) => item !== word)].slice(0, 10);
  history.value = next;
  setItem(HISTORY_KEY, next);
};

const clearHistory = () => {
  history.value = [];
  setItem(HISTORY_KEY, []);
};

const useHistory = (word: string) => {
  keyword.value = word;
  void doSearch();
};

const clearKeyword = () => {
  keyword.value = '';
  searched.value = false;
  users.value = [];
  posts.value = [];
};

/** 执行搜索：两个接口并发，任一失败不影响另一个 */
const doSearch = async () => {
  const word = keyword.value.trim();
  if (!word) {
    toast('请输入关键词');
    return;
  }
  pushHistory(word);
  loading.value = true;
  searched.value = true;

  const [userResult, postResult] = await Promise.allSettled([searchAccounts(word, 0, 20), searchPosts(word)]);

  users.value = userResult.status === 'fulfilled' ? (userResult.value?.items ?? []) : [];
  posts.value = postResult.status === 'fulfilled' ? (postResult.value?.items ?? []) : [];

  // 两个都没结果且用户搜索失败：多半是网络/接口问题，给一次提示
  if (userResult.status === 'rejected' && postResult.status === 'rejected') {
    const reason: any = userResult.reason;
    toast(reason?.detail || '搜索失败，请稍后重试');
  }

  // 用户没结果但内容有结果时自动切到"内容"，少一次点击
  if (users.value.length === 0 && posts.value.length > 0) tab.value = 'post';

  loading.value = false;
};

const switchTab = (next: 'user' | 'post') => {
  tab.value = next;
};

const goUser = (accountId: string) => {
  uni.navigateTo({url: `/pages/user/user?id=${accountId}`});
};

onLoad((options) => {
  const preset = String(options?.q || '');
  if (preset) {
    keyword.value = preset;
    void doSearch();
    return;
  }
  autoFocus.value = true;
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $bg-page;
}

.searchbar {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  background-color: $bg-card;
}

.searchbar__box {
  flex: 1;
  display: flex;
  align-items: center;
  height: 72rpx;
  padding: 0 20rpx;
  background-color: #f2f3f5;
  border-radius: 36rpx;
}

.searchbar__input {
  flex: 1;
  font-size: 28rpx;
}

.searchbar__placeholder {
  color: #b8bcc4;
}

.searchbar__clear {
  padding: 0 8rpx;
  font-size: 32rpx;
  color: $text-3;
}

.searchbar__btn {
  margin-left: 20rpx;
  font-size: 28rpx;
  color: $brand;
}

.history {
  margin-top: 20rpx;
  padding: 24rpx;
  background-color: $bg-card;
}

.history__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history__title {
  font-size: 26rpx;
  color: $text-2;
}

.history__clear {
  font-size: 24rpx;
  color: $text-3;
}

.history__tags {
  display: flex;
  flex-wrap: wrap;
  margin-top: 16rpx;
}

.tag {
  margin: 0 16rpx 16rpx 0;
  padding: 10rpx 24rpx;
  background-color: #f2f3f5;
  border-radius: 28rpx;
  font-size: 25rpx;
  color: $text-2;
}

.tabs {
  display: flex;
  background-color: $bg-card;
  border-top: 1rpx solid $border;
}

.tabs__item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 84rpx;
  font-size: 28rpx;
  color: $text-2;
  border-bottom: 4rpx solid transparent;
}

.tabs__item--on {
  color: $brand;
  font-weight: 600;
  border-bottom-color: $brand;
}

.tabs__count {
  margin-left: 8rpx;
  font-size: 22rpx;
  color: $text-3;
}

.user-row {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx;
  background-color: $bg-card;
  border-bottom: 1rpx solid $border;
}

.user-row__info {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.user-row__name {
  display: block;
  font-size: 30rpx;
  font-weight: 500;
}

.user-row__id {
  display: block;
  margin-top: 4rpx;
  font-size: 23rpx;
  color: $text-3;
}
</style>
