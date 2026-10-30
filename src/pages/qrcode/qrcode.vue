<template>
  <view class="page">
    <view class="card">
      <!-- 头部：头像 + 昵称 + 账号 -->
      <view class="card__head">
        <UserAvatar :name="displayName" :src="accountStore.account.avatar" :size="96" />
        <view class="card__who">
          <text class="card__name ellipsis">{{ displayName }}</text>
          <text class="card__id">账号：@{{ username }}</text>
        </view>
      </view>

      <!-- 二维码 -->
      <view class="card__qr">
        <QrCode ref="qrRef" :text="qrText" :size="qrSize" />
      </view>

      <text class="card__tip">扫一扫上面的二维码，添加我为好友</text>
    </view>

    <!-- 保存到相册 -->
    <view class="actions">
      <view class="actions__btn" hover-class="actions__btn--hover" @tap="saveQr">保存到相册</view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 我的二维码
 *
 * 参考微信「我 → 二维码名片」：卡片展示头像 / 昵称 / 账号 + 二维码，
 * 二维码编码个人主页深链（.../user/{account_id}），对方扫码后：
 *   - 在推文 App 内 → 直接跳到我的主页
 *   - 在外部浏览器 → 打开 H5 主页
 * 支持保存到相册（H5 走下载，小程序 / App 走系统相册并引导授权）。
 */
import {computed, ref} from 'vue';
import UserAvatar from '@/components/UserAvatar.vue';
import QrCode from '@/components/QrCode.vue';
import {useAccountStore} from '@/stores/account';
import {buildUserQrUrl} from '@/utils/share';
import {toast} from '@/api/request';

const accountStore = useAccountStore();

const displayName = computed(() => accountStore.displayName);
const username = computed(() => accountStore.account.username || '');
const qrSize = 240;
const qrText = computed(() => buildUserQrUrl(accountStore.account.account_id));

/** 拿到子组件暴露的 canvasId，用于导出图片 */
const qrRef = ref<{canvasId: string} | null>(null);

const saveQr = () => {
  const id = qrRef.value?.canvasId;
  if (!id) {
    toast('二维码尚未生成');
    return;
  }
  uni.canvasToTempFilePath({
    canvasId: id,
    success: (res) => {
      // #ifdef H5
      // H5 没有系统相册，退化为下载
      const a = document.createElement('a');
      a.href = res.tempFilePath;
      a.download = `tuiwen-${username.value || 'qr'}.png`;
      a.click();
      toast('已开始下载');
      // #endif
      // #ifndef H5
      uni.saveImageToPhotosAlbum({
        filePath: res.tempFilePath,
        success: () => toast('已保存到相册'),
        fail: (err) => {
          const msg: string = err?.errMsg || '';
          if (msg.includes('auth') || msg.includes('deny')) {
            uni.showModal({
              title: '需要相册权限',
              content: '保存二维码需要授权访问相册，请在设置中开启。',
              confirmText: '去设置',
              success: (m) => {
                if (m.confirm) uni.openSetting();
              },
            });
          } else {
            toast('保存失败');
          }
        },
      });
      // #endif
    },
    fail: () => toast('生成图片失败'),
  });
};
</script>

<style lang="scss" scoped>
.page {
  min-height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px));
  box-sizing: border-box;
  background-color: $bg-page;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 48rpx calc(48rpx + env(safe-area-inset-bottom));
}

.card {
  width: 100%;
  background-color: $bg-card;
  border-radius: 28rpx;
  padding: 48rpx 40rpx 56rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8rpx 30rpx rgba(0, 0, 0, 0.05);
}

.card__head {
  display: flex;
  align-items: center;
  width: 100%;
}

.card__who {
  flex: 1;
  min-width: 0;
  margin-left: 24rpx;
}

.card__name {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: $text-1;
}

.card__id {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: $text-3;
}

.card__qr {
  margin: 48rpx 0 32rpx;
  padding: 24rpx;
  background-color: #ffffff;
  border-radius: 20rpx;
  line-height: 0;
}

.card__tip {
  font-size: 26rpx;
  color: $text-3;
}

.actions {
  width: 100%;
  margin-top: 48rpx;
}

.actions__btn {
  height: 92rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #ffffff;
  background-color: $brand;
}

.actions__btn--hover {
  opacity: 0.85;
}
</style>
