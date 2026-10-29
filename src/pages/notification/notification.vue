<template>
  <view class="page">
    <view class="group">
      <view class="cell">
        <view class="cell__text">
          <text class="cell__title">新内容提醒</text>
          <text class="cell__desc">首页轮询到新帖时浮出提示</text>
        </view>
        <switch :checked="settings.newContentAlert" color="#027AFF" @change="(e: any) => onToggle('newContentAlert', e)" />
      </view>
      <view class="cell">
        <view class="cell__text">
          <text class="cell__title">互动消息提醒</text>
          <text class="cell__desc">评论、点赞、新粉丝（待推送后端）</text>
        </view>
        <switch :checked="settings.interactionAlert" color="#027AFF" @change="(e: any) => onToggle('interactionAlert', e)" />
      </view>
    </view>

    <view class="group">
      <view class="cell">
        <view class="cell__text">
          <text class="cell__title">系统公告</text>
          <text class="cell__desc">在发现页展示官方公告</text>
        </view>
        <switch :checked="settings.systemNotice" color="#027AFF" @change="(e: any) => onToggle('systemNotice', e)" />
      </view>
      <view class="cell">
        <view class="cell__text">
          <text class="cell__title">通知声音</text>
          <text class="cell__desc">提醒时播放提示音（本地偏好）</text>
        </view>
        <switch :checked="settings.sound" color="#027AFF" @change="(e: any) => onToggle('sound', e)" />
      </view>
    </view>

    <text class="tip">提示：当前为端内通知配置，应用内生效；系统级推送将在接入推送服务后联动上述开关。</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 通知设置
 *
 * 开关全部走本地存储（utils/notification），不依赖后端。
 * 其中 newContentAlert 与 systemNotice 已被首页轮询 / 发现页公告实际联动。
 */
import {reactive} from 'vue';
import {getNotificationSettings, setNotificationSettings} from '@/utils/notification';
import type {NotificationSettings} from '@/utils/notification';

const settings = reactive<NotificationSettings>(getNotificationSettings());

/** 切换开关：乐观更新 + 落盘（本地存储不会失败，无需回滚） */
const onToggle = (key: keyof NotificationSettings, event: {detail: {value: boolean}}) => {
  const value = !!event?.detail?.value;
  settings[key] = value;
  setNotificationSettings({...settings});
};
</script>

<style lang="scss" scoped>
.page {
  min-height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px));
  box-sizing: border-box;
  background-color: $bg-page;
  padding: 20rpx 0 calc(40rpx + env(safe-area-inset-bottom));
}

.group {
  margin-top: 20rpx;
  background-color: $bg-card;
}

.cell {
  display: flex;
  align-items: center;
  min-height: 112rpx;
  padding: 0 32rpx;
  border-bottom: 1rpx solid $border;

  &:last-child {
    border-bottom: none;
  }
}

.cell__text {
  flex: 1;
  min-width: 0;
  margin-right: 16rpx;
}

.cell__title {
  display: block;
  font-size: 30rpx;
  color: $text-1;
}

.cell__desc {
  display: block;
  margin-top: 6rpx;
  font-size: 23rpx;
  color: $text-3;
}

.tip {
  display: block;
  margin: 32rpx 40rpx 0;
  font-size: 23rpx;
  line-height: 1.6;
  color: $text-3;
}
</style>
