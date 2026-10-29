<template>
  <view class="page">
    <view class="brand">
      <image class="brand__logo" src="/static/logo.png" mode="aspectFit" />
      <text class="brand__name">推文</text>
      <text class="brand__slogan">记录此刻，天亮即焚</text>
    </view>

    <view class="form">
      <view class="field">
        <text class="field__label">账号</text>
        <input
          v-model="form.username"
          class="field__input"
          type="text"
          placeholder="邮箱或用户名"
          placeholder-class="field__placeholder"
          :maxlength="64"
          @confirm="submit"
        />
      </view>

      <view class="field">
        <text class="field__label">密码</text>
        <view class="field__row">
          <input
            v-model="form.password"
            class="field__input"
            :password="!showPassword"
            placeholder="请输入密码"
            placeholder-class="field__placeholder"
            :maxlength="32"
            @confirm="submit"
          />
          <text class="field__toggle" @tap="showPassword = !showPassword">
            {{ showPassword ? '隐藏' : '显示' }}
          </text>
        </view>
      </view>

      <view class="btn-primary login-btn" :class="{'is-disabled': submitting}" @tap="submit">
        {{ submitting ? '登录中…' : '登录' }}
      </view>

      <view class="links">
        <text class="links__item" @tap="goRegister">注册新账号</text>
        <text class="links__item" @tap="goReset">忘记密码</text>
      </view>
    </view>

    <view class="footer">
      <text class="footer__text">v{{ version }}</text>
      <text class="footer__text footer__text--link" @tap="editServer">服务器：{{ serverHost }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 登录页
 *
 * 后端契约（与 Web 端一致）：
 * - POST `/oauth/authorize/password/`，`application/x-www-form-urlencoded`
 * - 密码传 **md5**，不传明文
 * - 返回 `{access_token, refresh_token, account_id}`
 *
 * 没有做人机验证（Turnstile 是 Web 组件，小程序/App 端无法直接渲染）：
 * 若后端对登录强制要求验证码，需要在服务端为移动端开放独立通道，
 * 这一点写在 README 的「已知差异」里，不做静默降级。
 */
import {computed, reactive, ref} from 'vue';
import {md5} from 'js-md5';
import {login} from '@/api';
import {useAccountStore} from '@/stores/account';
import {config, getApiBaseUrl, setCustomApiBaseUrl} from '@/config';
import {toast} from '@/api/request';

const accountStore = useAccountStore();

const form = reactive({username: '', password: ''});
const showPassword = ref(false);
const submitting = ref(false);
const version = config.VERSION;

const serverHost = computed(() => getApiBaseUrl().replace(/^https?:\/\//i, ''));

/** 登录提交 */
const submit = async () => {
  if (submitting.value) return;

  const username = form.username.trim();
  const password = form.password;
  if (!username) {
    toast('请输入账号');
    return;
  }
  if (!password) {
    toast('请输入密码');
    return;
  }

  submitting.value = true;
  try {
    const result = await login(username, md5(password));
    accountStore.applyLogin(result);
    // 令牌写入后再拉资料：失败不影响登录，首页会用 account_id 兜底
    await accountStore.loadSelf(result.account_id);
    toast('登录成功');

    // 从别的页面跳过来就返回，直接启动进入登录页则回首页
    const pages = getCurrentPages();
    if (pages.length > 1) {
      uni.navigateBack();
    } else {
      uni.reLaunch({url: '/pages/index/index'});
    }
  } catch (error: any) {
    toast(error?.detail || '登录失败，请检查账号密码');
  } finally {
    submitting.value = false;
  }
};

const goRegister = () => uni.navigateTo({url: '/pages/register/register'});
const goReset = () => uni.navigateTo({url: '/pages/reset-password/reset-password'});

/**
 * 修改服务器地址
 *
 * App 装到手机上后改不了 .env，这里留个入口方便连内网测试环境。
 * 用 modal 的 editable 能力，避免为一个小功能单开一个页面。
 */
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
</script>

<style lang="scss" scoped>
.page {
  min-height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px));
  box-sizing: border-box;
  padding: 80rpx 48rpx calc(48rpx + env(safe-area-inset-bottom));
  background-color: $bg-card;
  display: flex;
  flex-direction: column;
}

.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx 0 64rpx;
}

.brand__logo {
  width: 132rpx;
  height: 132rpx;
  border-radius: 30rpx;
}

.brand__name {
  margin-top: 24rpx;
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
}

.brand__slogan {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: $text-3;
}

.form {
  flex: 1;
}

.field {
  margin-bottom: 32rpx;
}

.field__label {
  display: block;
  margin-bottom: 12rpx;
  font-size: 24rpx;
  color: $text-2;
}

.field__row {
  display: flex;
  align-items: center;
}

.field__input {
  flex: 1;
  height: 92rpx;
  padding: 0 24rpx;
  background-color: #f7f8fa;
  border-radius: 12rpx;
  /* iOS 输入框字体小于 16px 会触发聚焦放大，这里用 rpx 换算后仍偏小，故显式设置 px */
  font-size: 32rpx;
}

.field__placeholder {
  color: #b8bcc4;
}

.field__toggle {
  padding-left: 24rpx;
  font-size: 24rpx;
  color: $brand;
}

.login-btn {
  margin-top: 48rpx;
}

.links {
  display: flex;
  justify-content: space-between;
  margin-top: 32rpx;
}

.links__item {
  font-size: 26rpx;
  color: $brand;
}

.footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.footer__text {
  font-size: 22rpx;
  color: $text-3;
}

.footer__text--link {
  text-decoration: underline;
}
</style>
