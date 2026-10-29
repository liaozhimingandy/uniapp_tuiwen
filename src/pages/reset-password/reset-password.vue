<template>
  <view class="page">
    <view class="header">
      <text class="header__title">找回密码</text>
      <text class="header__desc">
        {{ step === 1 ? '输入注册邮箱，我们会发送验证码' : '填写验证码并设置新密码' }}
      </text>
    </view>

    <!-- 第一步：发验证码 -->
    <view v-if="step === 1" class="form">
      <view class="field">
        <text class="field__label">注册邮箱</text>
        <input
          v-model="mail"
          class="field__input"
          type="text"
          placeholder="name@example.com"
          placeholder-class="field__placeholder"
          :maxlength="64"
        />
      </view>

      <view class="btn-primary submit" :class="{'is-disabled': sending}" @tap="sendCode">
        {{ sending ? '发送中…' : '发送验证码' }}
      </view>
    </view>

    <!-- 第二步：验证码 + 新密码 -->
    <view v-else class="form">
      <view class="field">
        <text class="field__label">邮箱</text>
        <view class="field__readonly">{{ mail }}</view>
      </view>

      <view class="field">
        <text class="field__label">验证码</text>
        <view class="field__row">
          <input
            v-model="code"
            class="field__input field__input--flex"
            type="number"
            placeholder="6 位验证码"
            placeholder-class="field__placeholder"
            :maxlength="8"
          />
          <text class="field__resend" :class="{'field__resend--disabled': countdown > 0}" @tap="resend">
            {{ countdown > 0 ? `${countdown}s` : '重新发送' }}
          </text>
        </view>
      </view>

      <view class="field">
        <text class="field__label">新密码</text>
        <input
          v-model="password"
          class="field__input"
          password
          placeholder="6~16 位"
          placeholder-class="field__placeholder"
          :maxlength="16"
        />
      </view>

      <view class="field">
        <text class="field__label">确认新密码</text>
        <input
          v-model="confirmPassword"
          class="field__input"
          password
          placeholder="再输入一次"
          placeholder-class="field__placeholder"
          :maxlength="16"
        />
      </view>

      <view class="btn-primary submit" :class="{'is-disabled': resetting}" @tap="reset">
        {{ resetting ? '提交中…' : '重置密码' }}
      </view>
    </view>

    <view class="back">
      <text @tap="goLogin">返回登录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 找回密码（两步）
 *
 * 1. `POST /accounts/send/code/`，`scene=reset_pwd`（后端据此选邮件模板）
 * 2. `PUT /accounts/password/reset/`，`{username: 邮箱, code, password: md5}`
 *
 * 为什么拆两步而不是一个表单：验证码有时效，先确认邮件能收到再让用户填密码，
 * 避免"填完密码才发现邮箱打错了"。
 */
import {onUnmounted, ref} from 'vue';
import {md5} from 'js-md5';
import {resetPassword, sendCode as sendCodeApi} from '@/api';
import {toast} from '@/api/request';

const step = ref<1 | 2>(1);
const mail = ref('');
const code = ref('');
const password = ref('');
const confirmPassword = ref('');
const sending = ref(false);
const resetting = ref(false);
const countdown = ref(0);

let timer: ReturnType<typeof setInterval> | null = null;

/** 重发倒计时（60 秒），避免用户连点把邮件额度打光 */
const startCountdown = () => {
  countdown.value = 60;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }, 1000);
};

const isMail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** 发送验证码 */
const sendCodeRequest = async (): Promise<boolean> => {
  const address = mail.value.trim();
  if (!isMail(address)) {
    toast('请输入正确的邮箱');
    return false;
  }
  sending.value = true;
  try {
    const result = await sendCodeApi(address, 'reset_pwd');
    toast(result?.message || '验证码已发送');
    startCountdown();
    return true;
  } catch (error: any) {
    toast(error?.detail || '发送失败，请稍后重试');
    return false;
  } finally {
    sending.value = false;
  }
};

/** 第一步按钮：发送成功才进入第二步 */
const sendCode = () => {
  void sendCodeRequest().then((ok) => {
    if (ok) step.value = 2;
  });
};

const resend = () => {
  if (countdown.value > 0) return;
  void sendCodeRequest();
};

/** 提交重置 */
const reset = async () => {
  if (resetting.value) return;
  if (!code.value.trim()) {
    toast('请输入验证码');
    return;
  }
  if (!password.value || password.value.length < 6 || password.value.length > 16) {
    toast('密码长度需在 6~16 位之间');
    return;
  }
  if (password.value !== confirmPassword.value) {
    toast('两次输入的密码不一致');
    return;
  }

  resetting.value = true;
  try {
    const result = await resetPassword(mail.value.trim(), code.value.trim(), md5(password.value));
    toast(result?.message || '密码已重置，请重新登录');
    setTimeout(() => uni.redirectTo({url: '/pages/login/login'}), 700);
  } catch (error: any) {
    toast(error?.detail || '重置失败，请检查验证码');
  } finally {
    resetting.value = false;
  }
};

const goLogin = () => {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.redirectTo({url: '/pages/login/login'});
};

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style lang="scss" scoped>
.page {
  min-height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px));
  box-sizing: border-box;
  padding: 48rpx 48rpx calc(48rpx + env(safe-area-inset-bottom));
  background-color: $bg-card;
}

.header {
  padding-bottom: 40rpx;
}

.header__title {
  display: block;
  font-size: 44rpx;
  font-weight: 700;
}

.header__desc {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: $text-3;
}

.field {
  margin-bottom: 28rpx;
}

.field__label {
  display: block;
  margin-bottom: 12rpx;
  font-size: 24rpx;
  color: $text-2;
}

.field__input {
  height: 88rpx;
  padding: 0 24rpx;
  background-color: #f7f8fa;
  border-radius: 12rpx;
  font-size: 32rpx;
}

.field__input--flex {
  flex: 1;
}

.field__placeholder {
  color: #b8bcc4;
}

.field__readonly {
  height: 88rpx;
  line-height: 88rpx;
  padding: 0 24rpx;
  background-color: #f2f3f5;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: $text-2;
}

.field__row {
  display: flex;
  align-items: center;
}

.field__resend {
  margin-left: 20rpx;
  font-size: 25rpx;
  color: $brand;
}

.field__resend--disabled {
  color: $text-3;
}

.submit {
  margin-top: 40rpx;
}

.back {
  margin-top: 32rpx;
  text-align: center;
  font-size: 25rpx;
  color: $brand;
}
</style>
