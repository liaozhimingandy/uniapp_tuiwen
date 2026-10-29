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

    <!-- 热门内容（默认态：搜索历史下方） -->
    <view v-if="!searched && hotPosts.length" class="hot-block">
      <view class="hot-block__head">
        <text class="hot-block__title">热门内容</text>
        <text class="hot-block__sub">近 7 天</text>
      </view>
      <view
        v-for="(item, index) in hotPosts"
        :key="item.post_id"
        class="hot-row"
        @tap="goDetail(item.post_id)"
      >
        <text class="hot-row__rank" :class="{'hot-row__rank--top': index < 3}">{{ index + 1 }}</text>
        <view class="hot-row__main">
          <text class="hot-row__text">{{ hotSummary(item) }}</text>
          <view class="hot-row__meta">
            <text class="hot-row__author">{{ hotAuthor(item.account_id) }}</text>
            <text class="hot-row__likes">❤ {{ formatCount(item.like_count) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 历史记录 -->
    <view v-if="!searched && history.length" class="history">
      <view class="history__head">
        <text class="history__title">搜索历史</text>
        <text class="history__clear" @tap="clearHistory">清空</text>
      </view>
      <view class="history__tags">
        <view v-for="item in history" :key="item" class="tag">
          <text class="tag__text" @tap="useHistory(item)">{{ item }}</text>
          <text class="tag__del" @tap.stop="removeHistory(item)">×</text>
        </view>
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
          <text
            v-if="showFollowBtn(item)"
            class="user-row__btn"
            :class="{'user-row__btn--on': isFollowing(item)}"
            @tap.stop="toggleFollowUser(item)"
          >{{ isFollowing(item) ? '已关注' : '关注' }}</text>
        </view>
        <view v-if="userHasMore" class="loadmore">{{ loadingMore ? '加载中…' : '上拉加载更多' }}</view>
        <view v-else-if="users.length > 0" class="loadmore">没有更多用户了</view>
      </template>

      <!-- 内容结果 -->
      <template v-else>
        <view v-if="loading" class="empty">搜索中…</view>
        <view v-else-if="posts.length === 0" class="empty">没有找到相关内容</view>
        <PostCard v-for="item in posts" :key="item.post_id" :post="item" />
        <view v-if="postHasMore" class="loadmore">{{ loadingMore ? '加载中…' : '上拉加载更多' }}</view>
        <view v-else-if="posts.length > 0" class="loadmore">没有更多内容了</view>
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
import {onLoad, onReachBottom} from '@dcloudio/uni-app';
import UserAvatar from '@/components/UserAvatar.vue';
import PostCard from '@/components/PostCard.vue';
import {searchAccounts, searchPosts, fetchHotPosts, follow as followApi, unfollow as unfollowApi} from '@/api';
import {getItem, setItem} from '@/utils/storage';
import {contentText, formatCount, stripHtml} from '@/utils/text';
import {isLoggedIn} from '@/utils/token';
import {useAccountStore, useUserCacheStore} from '@/stores/account';
import {LOGIN_PAGE, toast} from '@/api/request';
import type {IAccount, IFollow, IPost} from '@/types';

const HISTORY_KEY = 'tw_search_history';
/** 每页条数（用户/内容搜索一致，返回不足一页即认为没有更多） */
const PAGE_SIZE = 20;

const accountStore = useAccountStore();
const userCacheStore = useUserCacheStore();

const keyword = ref('');
const tab = ref<'user' | 'post'>('user');
const users = ref<IAccount[]>([]);
const posts = ref<IPost[]>([]);
const hotPosts = ref<IPost[]>([]);
const loading = ref(false);
const searched = ref(false);
const autoFocus = ref(false);

/** 分页状态：offset 翻页（用户/内容各自独立） */
const userOffset = ref(0);
const postOffset = ref(0);
const userHasMore = ref(false);
const postHasMore = ref(false);
const loadingMore = ref(false);

const history = ref<string[]>(getItem<string[]>(HISTORY_KEY, []));

/** 热门条目摘要：HTML 去标签，纯图帖给占位文案 */
const hotSummary = (post: IPost): string => stripHtml(contentText(post.content)) || '分享了几张图片';

/** 热门条目作者名：走用户缓存（同一作者只请求一次） */
const hotAuthor = (accountId: string): string => {
  const author = userCacheStore.accountMap[accountId];
  if (!author) {
    void userCacheStore.fetchUser(accountId).catch(() => undefined);
    return '…';
  }
  return author.nickname || author.username || '匿名用户';
};

const goDetail = (postId: string) => uni.navigateTo({url: `/pages/detail/detail?id=${postId}`});

/** 拉热门内容（失败静默，区块隐藏即可） */
const loadHotPosts = async () => {
  try {
    const page = await fetchHotPosts(5);
    hotPosts.value = (page.items ?? []) as IPost[];
  } catch {
    hotPosts.value = [];
  }
};

/** 写入搜索历史（去重，最多 10 条） */
const pushHistory = (word: string) => {
  const next = [word, ...history.value.filter((item) => item !== word)].slice(0, 10);
  history.value = next;
  setItem(HISTORY_KEY, next);
};

/** 删除单条搜索历史 */
const removeHistory = (word: string) => {
  history.value = history.value.filter((item) => item !== word);
  setItem(HISTORY_KEY, history.value);
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
  userOffset.value = 0;
  postOffset.value = 0;
  userHasMore.value = false;
  postHasMore.value = false;
};

/** 执行搜索：两个接口并发拉第一页，任一失败不影响另一个 */
const doSearch = async () => {
  const word = keyword.value.trim();
  if (!word) {
    toast('请输入关键词');
    return;
  }
  pushHistory(word);
  loading.value = true;
  searched.value = true;
  userOffset.value = 0;
  postOffset.value = 0;

  const [userResult, postResult] = await Promise.allSettled([searchAccounts(word, 0, PAGE_SIZE), searchPosts(word, 0, PAGE_SIZE)]);

  const userItems = userResult.status === 'fulfilled' ? (userResult.value?.items ?? []) : [];
  const postItems = postResult.status === 'fulfilled' ? (postResult.value?.items ?? []) : [];
  users.value = userItems;
  posts.value = postItems;
  userHasMore.value = userItems.length >= PAGE_SIZE;
  postHasMore.value = postItems.length >= PAGE_SIZE;

  // 两个都没结果且用户搜索失败：多半是网络/接口问题，给一次提示
  if (userResult.status === 'rejected' && postResult.status === 'rejected') {
    const reason: any = userResult.reason;
    toast(reason?.detail || '搜索失败，请稍后重试');
  }

  // 用户没结果但内容有结果时自动切到"内容"，少一次点击
  if (users.value.length === 0 && posts.value.length > 0) tab.value = 'post';

  loading.value = false;
};

/** 触底加载当前 Tab 的下一页（追加） */
const loadMore = async () => {
  const word = keyword.value.trim();
  if (!word || loadingMore.value || loading.value) return;

  if (tab.value === 'user' && !userHasMore.value) return;
  if (tab.value === 'post' && !postHasMore.value) return;

  loadingMore.value = true;
  try {
    if (tab.value === 'user') {
      const page = await searchAccounts(word, userOffset.value + PAGE_SIZE, PAGE_SIZE);
      const items = page.items ?? [];
      users.value = [...users.value, ...items];
      userOffset.value += items.length;
      userHasMore.value = items.length >= PAGE_SIZE;
    } else {
      const page = await searchPosts(word, postOffset.value + PAGE_SIZE, PAGE_SIZE);
      const items = page.items ?? [];
      posts.value = [...posts.value, ...items];
      postOffset.value += items.length;
      postHasMore.value = items.length >= PAGE_SIZE;
    }
  } catch {
    toast('加载失败，请重试');
  } finally {
    loadingMore.value = false;
  }
};

onReachBottom(() => {
  void loadMore();
});

const switchTab = (next: 'user' | 'post') => {
  tab.value = next;
};

const goUser = (accountId: string) => {
  uni.navigateTo({url: `/pages/user/user?id=${accountId}`});
};

/** 是否显示关注按钮：登录用户搜别人时显示（自己/匿名不显示） */
const showFollowBtn = (u: IAccount): boolean => {
  const selfId = accountStore.account.account_id;
  return !!selfId && u.account_id !== selfId;
};

const isFollowing = (u: IAccount): boolean => !!u.follow?.is_following;

/** 关注/取关（乐观更新，失败回滚） */
const toggleFollowUser = async (u: IAccount) => {
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  const prev = u.follow as IFollow | undefined;
  const target = !prev?.is_following;
  // 乐观更新本地状态
  u.follow = {
    follower_count: Math.max(0, (prev?.follower_count ?? 0) + (target ? 1 : -1)),
    followee_count: prev?.followee_count ?? 0,
    is_following: target,
    like_count: prev?.like_count ?? 0,
  };
  try {
    if (target) {
      await followApi(u.account_id);
    } else {
      await unfollowApi(u.account_id);
    }
  } catch {
    // 回滚
    u.follow = prev;
  }
};

onLoad((options) => {
  const preset = String(options?.q || '');
  if (preset) {
    keyword.value = preset;
    void doSearch();
    return;
  }
  // 默认态拉一次热门内容
  void loadHotPosts();
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

/* ---------------- 热门内容 ---------------- */
.hot-block {
  margin-top: 20rpx;
  background-color: $bg-card;
  overflow: hidden;
}

.hot-block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 28rpx 24rpx 8rpx;
}

.hot-block__title {
  font-size: 30rpx;
  font-weight: 600;
  color: $text-1;
}

.hot-block__sub {
  font-size: 22rpx;
  color: $text-3;
}

.hot-row {
  display: flex;
  align-items: flex-start;
  padding: 22rpx 24rpx;
  border-top: 1rpx solid $border;
}

.hot-row:first-of-type {
  border-top: none;
}

.hot-row__rank {
  width: 44rpx;
  font-size: 30rpx;
  font-weight: 700;
  font-style: italic;
  color: $text-3;
  flex-shrink: 0;
}

.hot-row__rank--top {
  color: #ff7a45;
}

.hot-row__main {
  flex: 1;
  min-width: 0;
}

.hot-row__text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 27rpx;
  line-height: 1.5;
  color: $text-1;
  word-break: break-all;
}

.hot-row__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8rpx;
}

.hot-row__author {
  font-size: 22rpx;
  color: $text-3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hot-row__likes {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: 22rpx;
  color: #ff7a45;
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
  display: flex;
  align-items: center;
  margin: 0 16rpx 16rpx 0;
  padding: 10rpx 12rpx 10rpx 24rpx;
  background-color: #f2f3f5;
  border-radius: 28rpx;
}

.tag__text {
  font-size: 25rpx;
  color: $text-2;
}

.tag__del {
  margin-left: 10rpx;
  padding: 0 8rpx;
  font-size: 28rpx;
  line-height: 1;
  color: #b8bcc4;
}

.loadmore {
  padding: 32rpx 0 calc(32rpx + env(safe-area-inset-bottom));
  text-align: center;
  font-size: 24rpx;
  color: $text-3;
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

.user-row__btn {
  flex-shrink: 0;
  margin-left: 16rpx;
  padding: 10rpx 28rpx;
  border-radius: 32rpx;
  background-color: $brand;
  font-size: 24rpx;
  color: #ffffff;
}

.user-row__btn--on {
  background-color: #f2f3f5;
  color: $text-3;
}
</style>
