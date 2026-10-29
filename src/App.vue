<script setup lang="ts">
/**
 * 应用根组件
 *
 * 只做三件全局的事：
 * 1. 启动时把持久化的资料读回 store（token 由 utils/token 自行懒加载）
 * 2. 监听请求层抛出的「登录失效」事件，清掉内存态（否则页面还显示着上一个账号）
 * 3. 注入全局样式（页面底色、安全区、通用卡片/按钮）
 */
import {onLaunch, onShow} from '@dcloudio/uni-app';
import {useAccountStore} from '@/stores/account';

onLaunch(() => {
  const accountStore = useAccountStore();

  // 有令牌但没资料（如重装后恢复）时补拉一次，失败静默
  if (accountStore.token.access_token && !accountStore.account.account_id) {
    void accountStore.loadSelf();
  }

  // 请求层刷新令牌失败时会发这个事件：它只清了 storage，内存里的 store 还在
  uni.$on('auth:expired', () => {
    accountStore.logout();
    uni.showToast({title: '登录已过期，请重新登录', icon: 'none'});
  });
});

onShow(() => {
  // 从后台切回前台时校正一次登录态：token 可能在别的端被注销
  const accountStore = useAccountStore();
  if (!accountStore.token.access_token && accountStore.account.account_id) {
    accountStore.logout();
  }
});
</script>

<style lang="scss">
/* 全局基础样式：小程序端没有 CSS reset，默认 margin 会让卡片贴边 */
page {
  background-color: $bg-page;
  color: $text-1;
  font-size: 28rpx;
  line-height: 1.6;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}

view,
text,
scroll-view,
image,
input,
textarea,
button {
  box-sizing: border-box;
}

/* 通用卡片 */
.card {
  background-color: $bg-card;
  border-radius: $radius;
}

/* 主按钮（uni 的 button 默认带边框和固定宽度，这里统一成块级） */
.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  border-radius: 44rpx;
  background-color: $brand;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 500;
  border: none;

  &::after {
    border: none;
  }

  &.is-disabled {
    opacity: 0.5;
  }
}

.btn-ghost {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 72rpx;
  padding: 0 32rpx;
  border-radius: 36rpx;
  border: 1rpx solid $border;
  color: $text-2;
  font-size: 26rpx;
  background-color: #ffffff;

  &::after {
    border: none;
  }
}

/* 单行/两行省略 */
.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.clamp-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* 列表空态 */
.empty {
  padding: 120rpx 0;
  text-align: center;
  color: $text-3;
  font-size: 26rpx;
}
</style>
