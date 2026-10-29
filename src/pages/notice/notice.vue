<template>
  <view class="page">
    <!-- 分类 Tab：全部 / 赞 / 评论 / 关注 / 系统 -->
    <view class="tabs">
      <view
        v-for="t in TABS"
        :key="t.type"
        class="tabs__item"
        :class="{'tabs__item--on': tab === t.type}"
        @tap="switchTab(t.type)"
      >
        <text>{{ t.label }}</text>
      </view>
    </view>

    <!-- 全部已读 -->
    <view v-if="list.length > 0 && hasUnread" class="readall" @tap="readAll">
      <text>全部标为已读</text>
    </view>

    <view v-if="loading" class="empty">加载中…</view>
    <view v-else-if="list.length === 0" class="empty">暂无通知</view>

    <view
      v-for="n in list"
      :key="n.id"
      class="row"
      :class="{'row--unread': !n.is_read}"
      @tap="tapNotice(n)"
    >
      <UserAvatar :name="authorOf(n).nickname" :src="authorOf(n).avatar" :size="80" />
      <view class="row__body">
        <view class="row__head">
          <text class="row__name">{{ authorOf(n).nickname || '系统' }}</text>
          <text class="row__time">{{ formatSmartTime(n.created_at) }}</text>
        </view>
        <text class="row__text">{{ textOf(n) }}</text>
      </view>
      <view v-if="!n.is_read" class="row__dot" />
    </view>

    <view v-if="list.length > 0 && !hasMore" class="end">没有更多了</view>
  </view>
</template>

<script setup lang="ts">
/**
 * 通知中心
 *
 * 数据源: GET /notices/accounts/{me}/（仅本人可读，403 由后端保证）
 * 分类:   notice_type 0系统/1点赞/2评论/3关注；「赞/评论」各占一个 Tab。
 * 已读:   点一条标一条（PUT /notices/read/ {ids:[...]}），顶部支持全部已读。
 * 触发者头像/昵称: 后端 extra 冗余优先，否则走本地资料缓存补齐。
 */
import {computed, ref} from 'vue';
import {onLoad, onReachBottom, onShow} from '@dcloudio/uni-app';
import UserAvatar from '@/components/UserAvatar.vue';
import {fetchMyNotices, markNoticesRead} from '@/api';
import {useAccountStore, useUserCacheStore} from '@/stores/account';
import {formatSmartTime} from '@/utils/datetime';
import type {INotice} from '@/types';
import {toast} from '@/api/request';

/** Tab 定义：type 为 undefined 表示不过滤（全部） */
const TABS: {label: string; type?: number}[] = [
  {label: '全部', type: undefined},
  {label: '赞', type: 1},
  {label: '评论', type: 2},
  {label: '关注', type: 3},
  {label: '系统', type: 0},
];

const accountStore = useAccountStore();
const userCache = useUserCacheStore();

const tab = ref<number | undefined>(undefined);
const list = ref<INotice[]>([]);
const loading = ref(false);
const page = ref(1);
const hasMore = ref(true);

const hasUnread = computed(() => list.value.some((n) => !n.is_read));

const SIZE = 20;

const load = async (append = false) => {
  const me = accountStore.account?.account_id;
  if (!me) return;
  if (append && (loading.value || !hasMore.value)) return;

  loading.value = true;
  try {
    const res = await fetchMyNotices(me, page.value, SIZE, tab.value);
    const items = res.items ?? [];
    list.value = append ? [...list.value, ...items] : items;
    hasMore.value = items.length >= SIZE;

    // 预取触发者资料（缓存去重后只拉缺的）
    items.forEach((n) => {
      if (n.trigger_account_id) void userCache.fetchUser(n.trigger_account_id).catch(() => null);
    });
  } catch (error: any) {
    if (!append) list.value = [];
    toast(error?.detail || '加载失败');
  } finally {
    loading.value = false;
  }
};

const switchTab = (type?: number) => {
  if (tab.value === type) return;
  tab.value = type;
  page.value = 1;
  list.value = [];
  hasMore.value = true;
  void load();
};

/** 触发者展示信息：extra 冗余优先，回退资料缓存 */
const authorOf = (n: INotice): {nickname?: string; avatar?: string} => {
  if (n.trigger_account_id) {
    const cached = userCache.accountMap[n.trigger_account_id];
    if (cached) return {nickname: cached.nickname || cached.username, avatar: cached.avatar || undefined};
  }
  return {nickname: n.extra?.nickname, avatar: n.extra?.avatar};
};

const textOf = (n: INotice): string => {
  if (n.notice_type === 0) return n.title ? `${n.title} ${n.content?.text || ''}`.trim() : n.content?.text || '';
  return n.content?.text || '互动了你的内容';
};

/** 点一条通知：标已读 + 跳到关联内容 */
const tapNotice = async (n: INotice) => {
  if (!n.is_read) {
    n.is_read = true;
    try {
      await markNoticesRead([n.id]);
    } catch {
      // 静默：已读状态失败不影响跳转
    }
  }
  // 关联跳转：帖子 → 详情，用户 → 主页，系统通知不跳
  if (n.target_type === 1 && n.target_id) {
    uni.navigateTo({url: `/pages/detail/detail?id=${n.target_id}`});
  } else if (n.target_type === 3 && n.trigger_account_id) {
    uni.navigateTo({url: `/pages/user/user?id=${n.trigger_account_id}`});
  }
};

const readAll = async () => {
  try {
    await markNoticesRead();
    list.value = list.value.map((n) => ({...n, is_read: true}));
    toast('已全部标为已读');
  } catch {
    toast('操作失败');
  }
};

onLoad(() => {
  void load();
});

// 从详情/主页返回时刷新未读状态
onShow(() => {
  if (list.value.length > 0) void load();
});

onReachBottom(() => {
  if (hasMore.value) {
    page.value += 1;
    void load(true);
  }
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $bg-page;
  padding-bottom: 40rpx;
}

.tabs {
  display: flex;
  background-color: $bg-card;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tabs__item {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  text-align: center;
  font-size: 26rpx;
  color: $text-2;
  border-bottom: 4rpx solid transparent;
}

.tabs__item--on {
  color: $brand;
  font-weight: 600;
  border-bottom-color: $brand;
}

.readall {
  text-align: right;
  padding: 16rpx 32rpx;
  font-size: 24rpx;
  color: $brand;
}

.empty,
.end {
  text-align: center;
  padding: 80rpx 0;
  font-size: 26rpx;
  color: $text-3;
}

.row {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx;
  background-color: $bg-card;
  border-bottom: 1rpx solid $border;
}

.row--unread {
  background-color: $brand-light;
}

.row__body {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.row__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.row__name {
  font-size: 28rpx;
  font-weight: 500;
}

.row__time {
  font-size: 22rpx;
  color: $text-3;
}

.row__text {
  display: block;
  margin-top: 6rpx;
  font-size: 26rpx;
  color: $text-2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background-color: #ee0a24;
  margin-left: 16rpx;
  flex-shrink: 0;
}
</style>
