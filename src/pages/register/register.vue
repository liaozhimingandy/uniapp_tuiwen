<template>
  <view class="page">
    <view class="header">
      <text class="header__title">创建账号</text>
      <text class="header__desc">密码会在本地做一次 md5，不传明文</text>
    </view>

    <view class="form">
      <view class="field">
        <text class="field__label">邮箱</text>
        <input
          v-model="form.mail"
          class="field__input"
          type="text"
          placeholder="name@example.com"
          placeholder-class="field__placeholder"
          :maxlength="64"
        />
        <!-- 常用后缀快捷输入：手机上打字慢，点一下补全能省不少事 -->
        <view class="suffixes">
          <text v-for="item in MAIL_SUFFIX" :key="item" class="suffix" @tap="fillSuffix(item)">{{ item }}</text>
        </view>
      </view>

      <view class="field">
        <text class="field__label">昵称</text>
        <input
          v-model="form.nickname"
          class="field__input"
          placeholder="别人看到的名字"
          placeholder-class="field__placeholder"
          :maxlength="24"
        />
      </view>

      <view class="field">
        <text class="field__label">密码</text>
        <input
          v-model="form.password"
          class="field__input"
          password
          placeholder="6~16 位"
          placeholder-class="field__placeholder"
          :maxlength="16"
        />
      </view>

      <view class="field">
        <text class="field__label">确认密码</text>
        <input
          v-model="form.confirmPassword"
          class="field__input"
          password
          placeholder="再输入一次"
          placeholder-class="field__placeholder"
          :maxlength="16"
        />
      </view>

      <view class="field">
        <text class="field__label">生日</text>
        <picker mode="date" :value="form.birthday || '2000-01-01'" start="1900-01-01" :end="today" @change="onBirthdayChange">
          <view class="field__picker">{{ form.birthday || '请选择日期' }}</view>
        </picker>
      </view>

      <view class="field">
        <text class="field__label">性别</text>
        <view class="sex">
          <view
            v-for="item in SEX_OPTIONS"
            :key="item.value"
            class="sex__item"
            :class="{'sex__item--on': form.sex === item.value}"
            @tap="form.sex = item.value"
          >
            {{ item.label }}
          </view>
        </view>
      </view>

      <view class="btn-primary submit" :class="{'is-disabled': submitting}" @tap="submit">
        {{ submitting ? '注册中…' : '注册' }}
      </view>

      <view class="login-link">
        <text>已有账号？</text>
        <text class="login-link__url" @tap="goLogin">去登录</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 注册
 *
 * 与 Web 端字段一致：mail / password(md5) / nickname / birthday / sex / area_code
 * 密码长度 6~16，两次输入必须一致（前端先校验，减少一次网络往返）。
 */
import {reactive, ref} from 'vue';
import {md5} from 'js-md5';
import {register} from '@/api';
import {config} from '@/config';
import {SEX_OPTIONS} from '@/config/constants';
import {toast} from '@/api/request';

const MAIL_SUFFIX = config.MAIL_SUFFIX;
const today = new Date().toISOString().slice(0, 10);

const form = reactive({
  mail: '',
  nickname: '',
  password: '',
  confirmPassword: '',
  birthday: '',
  sex: 9,
});

const submitting = ref(false);

/** 点击后缀补全：已有 @ 时替换掉后半段，没有则直接拼 */
const fillSuffix = (suffix: string) => {
  const mail = form.mail.trim();
  if (!mail) {
    form.mail = '';
    return;
  }
  const at = mail.indexOf('@');
  form.mail = `${at >= 0 ? mail.slice(0, at) : mail}${suffix}`;
};

const onBirthdayChange = (event: any) => {
  form.birthday = String(event?.detail?.value || '');
};

/** 邮箱正则：不追求 RFC 完备，能挡住明显错误即可 */
const isMail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const submit = async () => {
  if (submitting.value) return;

  const mail = form.mail.trim();
  if (!isMail(mail)) {
    toast('请输入正确的邮箱');
    return;
  }
  if (!form.password || form.password.length < 6 || form.password.length > 16) {
    toast('密码长度需在 6~16 位之间');
    return;
  }
  if (form.password !== form.confirmPassword) {
    toast('两次输入的密码不一致');
    return;
  }
  if (!form.birthday) {
    toast('请选择生日');
    return;
  }

  submitting.value = true;
  try {
    await register({
      mail,
      // 与服务端约定：密码以 md5 形式传输
      password: md5(form.password),
      nickname: form.nickname.trim(),
      birthday: form.birthday,
      area_code: 'CHN',
      sex: form.sex,
    });
    toast('注册成功，请登录');
    setTimeout(() => {
      // 注册成功后回登录页：用 redirectTo 避免用户返回后重复提交表单
      uni.redirectTo({url: '/pages/login/login'});
    }, 600);
  } catch (error: any) {
    toast(error?.detail || '注册失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
};

const goLogin = () => {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.redirectTo({url: '/pages/login/login'});
};
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
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

.field__placeholder {
  color: #b8bcc4;
}

.field__picker {
  height: 88rpx;
  line-height: 88rpx;
  padding: 0 24rpx;
  background-color: #f7f8fa;
  border-radius: 12rpx;
  font-size: 30rpx;
  color: $text-1;
}

.suffixes {
  display: flex;
  flex-wrap: wrap;
  margin-top: 12rpx;
}

.suffix {
  margin: 0 12rpx 12rpx 0;
  padding: 6rpx 18rpx;
  border-radius: 22rpx;
  background-color: $brand-light;
  color: $brand;
  font-size: 22rpx;
}

.sex {
  display: flex;
}

.sex__item {
  margin-right: 20rpx;
  padding: 14rpx 40rpx;
  border-radius: 32rpx;
  background-color: #f7f8fa;
  font-size: 27rpx;
  color: $text-2;
}

.sex__item--on {
  background-color: $brand;
  color: #ffffff;
}

.submit {
  margin-top: 48rpx;
}

.login-link {
  margin-top: 28rpx;
  text-align: center;
  font-size: 25rpx;
  color: $text-3;
}

.login-link__url {
  color: $brand;
}
</style>
