<template>
  <view class="page">
    <view class="header">
      <text class="header__title">发现</text>
    </view>

    <!-- 搜索入口 -->
    <view class="searchbar" @tap="goSearch">
      <text class="searchbar__icon">🔍</text>
      <text class="searchbar__ph">搜索用户、内容</text>
    </view>

    <!-- 功能宫格：树洞作为二级入口收在这里 -->
    <view class="grid">
      <view class="cell" @tap="goSnap">
        <view class="cell__icon cell__icon--snap">🌙</view>
        <text class="cell__label">树洞</text>
        <text class="cell__sub">天亮即焚</text>
      </view>
      <view class="cell" @tap="goFollow">
        <view class="cell__icon cell__icon--follow">👥</view>
        <text class="cell__label">关注</text>
        <text class="cell__sub">我关注的人</text>
      </view>
      <view class="cell" @tap="goMine">
        <view class="cell__icon cell__icon--me">👤</view>
        <text class="cell__label">我的</text>
        <text class="cell__sub">主页与设置</text>
      </view>
    </view>

    <!-- 系统公告（受通知设置「系统公告」开关控制） -->
    <view v-if="showNotice" class="block">
      <view class="block__head">
        <text class="block__title">系统公告</text>
        <text v-if="noticeLoading" class="block__tip">加载中…</text>
      </view>

      <view v-if="!noticeLoading && notices.length === 0" class="block__empty">暂无公告</view>

      <view
        v-for="n in notices"
        :key="n.id"
        class="notice"
      >
        <view class="notice__row">
          <text class="notice__title">{{ n.title || '公告' }}</text>
          <text class="notice__time">{{ formatSmartTime(n.created_at) }}</text>
        </view>
        <text class="notice__content">{{ noticeText(n) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 发现（二级入口聚合页）
 *
 * 把"树洞 / 天亮即焚"从底部 Tab 收进这里，作为二级入口；
 * 同页还聚合了搜索、关注、我的、系统公告，避免散落。
 */
import {computed, ref} from 'vue';
import {onShow} from '@dcloudio/uni-app';
import {fetchNotices} from '@/api';
import {formatSmartTime} from '@/utils/datetime';
import {useAccountStore} from '@/stores/account';
import {getNotificationSettings} from '@/utils/notification';
import {LOGIN_PAGE, toast} from '@/api/request';
import type {IContent, INotice} from '@/types';

const accountStore = useAccountStore();

const notices = ref<INotice[]>([]);
const noticeLoading = ref(false);
/** 是否展示系统公告：受通知设置控制 */
const showNotice = computed(() => getNotificationSettings().systemNotice);

const goSearch = () => uni.navigateTo({url: '/pages/search/search'});
const goSnap = () => uni.navigateTo({url: '/pages/snap/snap'});
const goMine = () => uni.switchTab({url: '/pages/me/me'});

/** 关注列表需要登录态（要自己的 account_id），未登录跳登录页 */
const goFollow = () => {
  if (!accountStore.loggedIn) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  const id = accountStore.account.account_id;
  if (!id) {
    toast('请先登录');
    return;
  }
  uni.navigateTo({url: `/pages/follow/follow?id=${id}&tab=followee`});
};

/** 公告正文：后端 content 是 {text}，兼容直接给字符串的情况 */
const noticeText = (n: INotice): string => {
  const c = n.content as IContent | string | undefined;
  if (!c) return '';
  if (typeof c === 'string') return c;
  return c.text || '';
};

const loadNotices = async () => {
  noticeLoading.value = true;
  try {
    const page = await fetchNotices();
    notices.value = (page.items ?? []).slice(0, 8) as INotice[];
  } catch {
    // 公告失败不影响发现页主体
    notices.value = [];
  } finally {
    noticeLoading.value = false;
  }
};

onShow(() => {
  // 关闭「系统公告」开关则不拉取，省一次请求
  if (getNotificationSettings().systemNotice) {
    void loadNotices();
  }
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $bg-page;
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}

.header {
  padding: 28rpx 32rpx 8rpx;
}

.header__title {
  font-size: 44rpx;
  font-weight: 700;
  color: $text-1;
}

.searchbar {
  display: flex;
  align-items: center;
  margin: 16rpx 24rpx 8rpx;
  padding: 0 24rpx;
  height: 72rpx;
  border-radius: 36rpx;
  background-color: $bg-card;
}

.searchbar__icon {
  margin-right: 12rpx;
  font-size: 28rpx;
}

.searchbar__ph {
  font-size: 27rpx;
  color: $text-3;
}

.grid {
  display: flex;
  margin: 20rpx 24rpx;
  padding: 24rpx 0;
  border-radius: 20rpx;
  background-color: $bg-card;
}

.cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cell__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96rpx;
  height: 96rpx;
  border-radius: 28rpx;
  font-size: 44rpx;
}

.cell__icon--snap {
  background-color: rgba(2, 122, 255, 0.12);
}

.cell__icon--follow {
  background-color: rgba(124, 92, 255, 0.12);
}

.cell__icon--me {
  background-color: rgba(255, 138, 0, 0.12);
}

.cell__label {
  margin-top: 14rpx;
  font-size: 27rpx;
  font-weight: 500;
  color: $text-1;
}

.cell__sub {
  margin-top: 4rpx;
  font-size: 21rpx;
  color: $text-3;
}

.block {
  margin: 12rpx 24rpx;
  border-radius: 20rpx;
  background-color: $bg-card;
  overflow: hidden;
}

.block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx 12rpx;
}

.block__title {
  font-size: 30rpx;
  font-weight: 600;
  color: $text-1;
}

.block__tip {
  font-size: 24rpx;
  color: $text-3;
}

.block__empty {
  padding: 32rpx;
  text-align: center;
  font-size: 25rpx;
  color: $text-3;
}

.notice {
  padding: 24rpx 32rpx;
  border-top: 1rpx solid $border;
}

.notice__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.notice__title {
  font-size: 28rpx;
  font-weight: 500;
  color: $text-1;
}

.notice__time {
  font-size: 21rpx;
  color: $text-3;
  flex-shrink: 0;
  margin-left: 16rpx;
}

.notice__content {
  display: block;
  margin-top: 8rpx;
  font-size: 25rpx;
  line-height: 1.6;
  color: $text-2;
}
</style>
