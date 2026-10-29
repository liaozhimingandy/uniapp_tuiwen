<template>
  <view class="page">
    <!-- 未登录 -->
    <view v-if="!accountStore.loggedIn" class="guest">
      <UserAvatar name="?" :size="140" />
      <text class="guest__title">还没有登录</text>
      <view class="btn-primary guest__btn" @tap="goLogin">登录 / 注册</view>
    </view>

    <template v-else>
      <!-- 个人卡片（点击进入我的主页） -->
      <view class="profile" @tap="goMine">
        <UserAvatar :name="displayName" :src="accountStore.account.avatar" :size="128" />
        <view class="profile__info">
          <text class="profile__name ellipsis">{{ displayName }}</text>
          <text class="profile__id">@{{ username }}</text>
          <text v-if="accountStore.account.bio" class="profile__bio ellipsis">{{ accountStore.account.bio }}</text>
        </view>
        <text class="profile__arrow">›</text>
      </view>

      <!-- 关注 / 粉丝 -->
      <view class="stats">
        <view class="stats__item" @tap="goFollow('followee')">
          <text class="stats__num">{{ followeeCount }}</text>
          <text class="stats__label">关注</text>
        </view>
        <view class="stats__item" @tap="goFollow('follower')">
          <text class="stats__num">{{ followerCount }}</text>
          <text class="stats__label">粉丝</text>
        </view>
      </view>

      <!-- 内容 -->
      <view class="group">
        <view class="cell" @tap="goPublish">
          <view class="cell__icon cell__icon--green">发</view>
          <text class="cell__title">发一条动态</text>
          <text class="cell__arrow">›</text>
        </view>
        <view class="cell" @tap="goMine">
          <view class="cell__icon cell__icon--blue">帖</view>
          <text class="cell__title">我的帖文</text>
          <text class="cell__arrow">›</text>
        </view>
        <view class="cell" @tap="openEditUsername">
          <view class="cell__icon cell__icon--orange">名</view>
          <text class="cell__title">修改用户名</text>
          <text class="cell__value ellipsis">@{{ username }}</text>
          <text class="cell__arrow">›</text>
        </view>
        <view class="cell" @tap="gotoSettings">
          <view class="cell__icon cell__icon--teal">资</view>
          <text class="cell__title">编辑资料</text>
          <text class="cell__arrow">›</text>
        </view>
      </view>

      <!-- 通知 -->
      <view class="group">
        <view class="cell" @tap="gotoNotification">
          <view class="cell__icon cell__icon--purple">铃</view>
          <text class="cell__title">通知设置</text>
          <text class="cell__arrow">›</text>
        </view>
      </view>

      <!-- 账号 -->
      <view class="group">
        <view class="cell" @tap="gotoResetPwd">
          <view class="cell__icon cell__icon--red">安</view>
          <text class="cell__title">账号与安全</text>
          <text class="cell__arrow">›</text>
        </view>
        <view class="cell" @tap="showAbout">
          <view class="cell__icon cell__icon--gray">关</view>
          <text class="cell__title">关于推文</text>
          <text class="cell__value">v{{ version }}</text>
          <text class="cell__arrow">›</text>
        </view>
      </view>

      <!-- 退出 -->
      <view class="group">
        <view class="cell cell--danger" @tap="confirmLogout">
          <text class="cell__title">退出登录</text>
        </view>
      </view>
    </template>

    <!-- 修改用户名弹窗 -->
    <view v-if="editing" class="modal-mask" @tap="closeEditUsername">
      <view class="modal" @tap.stop>
        <text class="modal__title">修改用户名</text>
        <text class="modal__desc">用户名是你在推文的唯一标识，修改后其他人可通过新用户名找到你。</text>
        <input
          v-model="usernameDraft"
          class="modal__input"
          :maxlength="32"
          placeholder="请输入新用户名"
          placeholder-class="modal__placeholder"
          @input="usernameError = ''"
        />
        <text v-if="usernameError" class="modal__error">{{ usernameError }}</text>
        <view class="modal__actions">
          <view class="modal__btn" @tap="closeEditUsername">取消</view>
          <view class="modal__btn modal__btn--primary" :class="{'is-disabled': savingUsername}" @tap="saveUsername">
            {{ savingUsername ? '保存中…' : '保存' }}
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 我的
 *
 * 参考微信「我」菜单：头部资料卡 + 分组图标菜单。
 * - 服务器地址、账号 ID 不再展示（需求要求隐藏）
 * - 展示用户名，并支持在端内直接修改（后端 PATCH /accounts/credential/）
 *
 * 关注/粉丝数来自 `/follows/{account_id}/count/`：
 * 该接口对未登录也会返回计数，因此可以公开拉取。
 */
import {computed, ref} from 'vue';
import {onShow} from '@dcloudio/uni-app';
import UserAvatar from '@/components/UserAvatar.vue';
import {useAccountStore, usePostStore, useUserCacheStore} from '@/stores/account';
import {checkUsernameExists, changeUsername, fetchFollow} from '@/api';
import {config} from '@/config';
import {toast, LOGIN_PAGE} from '@/api/request';
import type {IFollow} from '@/types';

const accountStore = useAccountStore();
const postStore = usePostStore();
const userStore = useUserCacheStore();

const follow = ref<IFollow | null>(null);
const version = config.VERSION;

const displayName = computed(() => accountStore.displayName);
const username = computed(() => accountStore.account.username || '');
const followeeCount = computed(() => follow.value?.followee_count ?? 0);
const followerCount = computed(() => follow.value?.follower_count ?? 0);

/** 拉自己的关注统计 */
const loadStats = async () => {
  const id = accountStore.account.account_id;
  if (!id) return;
  try {
    follow.value = await fetchFollow(id);
    // 顺手写进缓存，关注/粉丝列表页能直接复用
    userStore.setUser(id, {account_id: id, follow: follow.value});
  } catch {
    // 静默：统计失败不该打断"我的"页面
  }
};

const goLogin = () => uni.navigateTo({url: LOGIN_PAGE});

/** 自己的主页：用 user 页面，保证与看别人主页的交互一致 */
const goMine = () => {
  const id = accountStore.account.account_id;
  if (!id) return;
  uni.navigateTo({url: `/pages/user/user?id=${id}`});
};

/** 发动态：跳发布页 */
const goPublish = () => uni.navigateTo({url: '/pages/publish/publish'});

/** 编辑资料页 */
const gotoSettings = () => uni.navigateTo({url: '/pages/settings/settings'});

/** 账号与安全：改密码 */
const gotoResetPwd = () => uni.navigateTo({url: '/pages/reset-password/reset-password'});

/** 通知设置 */
const gotoNotification = () => uni.navigateTo({url: '/pages/notification/notification'});

/** 关注 / 粉丝列表 */
const goFollow = (tab: 'follower' | 'followee') => {
  const id = accountStore.account.account_id;
  if (!id) return;
  uni.navigateTo({url: `/pages/follow/follow?id=${id}&tab=${tab}`});
};

const showAbout = () => {
  uni.showModal({
    title: '推文',
    content: `版本 ${version}\n记录此刻，天亮即焚。\n\nuni-app 跨平台客户端`,
    showCancel: false,
  });
};

/** 退出登录：二次确认，避免误触把登录态清了 */
const confirmLogout = () => {
  uni.showModal({
    title: '退出登录',
    content: '退出后需要重新登录才能发帖和评论',
    confirmColor: '#E34D59',
    success: (res) => {
      if (!res.confirm) return;
      accountStore.logout();
      postStore.reset();
      follow.value = null;
      toast('已退出登录');
    },
  });
};

// ------------------------------ 修改用户名 ------------------------------
const editing = ref(false);
const usernameDraft = ref('');
const usernameError = ref('');
const savingUsername = ref(false);

/** 后端黑名单：保留前缀 + 零宽字符（保持前后端一致） */
const RESERVED_RE = /^(admin|root|bot|official|vip)[_\-0-9]/i;
const ZERO_WIDTH_RE = /[\u2000-\u200F\u2028-\u202F]/;

/** 客户端预校验，提前拦掉明显非法的输入，减少无谓请求 */
const validateNewUsername = (raw: string): string => {
  const value = raw.trim();
  if (!value) return '用户名不能为空';
  if (value.length > 32) return '用户名不能超过 32 个字符';
  if (RESERVED_RE.test(value)) return '该用户名禁止使用';
  if (ZERO_WIDTH_RE.test(value)) return '用户名包含非法字符';
  return '';
};

const openEditUsername = () => {
  usernameDraft.value = username.value;
  usernameError.value = '';
  editing.value = true;
};

const closeEditUsername = () => {
  editing.value = false;
};

const saveUsername = async () => {
  if (savingUsername.value) return;
  const draft = usernameDraft.value.trim();
  const err = validateNewUsername(draft);
  if (err) {
    usernameError.value = err;
    return;
  }
  // 没变化直接关弹窗
  if (draft.toLowerCase() === username.value.toLowerCase()) {
    closeEditUsername();
    return;
  }
  savingUsername.value = true;
  try {
    // 后端统一小写存储：先以小写查重，避免大小写差异造成的误判
    const check = await checkUsernameExists(draft.toLowerCase());
    if (check.exists) {
      usernameError.value = '该用户名已被占用';
      return;
    }
    const updated = await changeUsername(draft.toLowerCase());
    accountStore.saveAccount({...accountStore.account, username: updated.username || draft.toLowerCase()});
    userStore.setUser(accountStore.account.account_id, accountStore.account);
    toast('用户名修改成功');
    closeEditUsername();
  } catch (error: any) {
    usernameError.value = error?.detail || '修改失败，请稍后重试';
  } finally {
    savingUsername.value = false;
  }
};

onShow(() => {
  if (!accountStore.loggedIn) return;
  // 资料可能在本端别处被改过（如编辑资料页），每次进来重拉一次
  void accountStore.loadSelf();
  void loadStats();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $bg-page;
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}

.guest {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 48rpx;
}

.guest__title {
  margin-top: 32rpx;
  font-size: 32rpx;
  color: $text-2;
}

.guest__btn {
  width: 400rpx;
  margin-top: 48rpx;
}

.profile {
  display: flex;
  align-items: center;
  background-color: $bg-card;
  padding: 40rpx 32rpx 8rpx;
}

.profile__info {
  flex: 1;
  min-width: 0;
  margin-left: 28rpx;
}

.profile__name {
  display: block;
  font-size: 38rpx;
  font-weight: 700;
}

.profile__id {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: $text-3;
}

.profile__bio {
  display: block;
  margin-top: 8rpx;
  font-size: 25rpx;
  color: $text-2;
}

.profile__arrow {
  font-size: 40rpx;
  color: #c8ccd4;
}

.stats {
  display: flex;
  padding: 28rpx 32rpx;
  background-color: $bg-card;
}

.stats__item {
  display: flex;
  align-items: baseline;
  margin-right: 56rpx;
}

.stats__num {
  font-size: 34rpx;
  font-weight: 600;
}

.stats__label {
  margin-left: 8rpx;
  font-size: 24rpx;
  color: $text-3;
}

.group {
  margin-top: 20rpx;
  background-color: $bg-card;
}

.cell {
  display: flex;
  align-items: center;
  min-height: 100rpx;
  padding: 0 32rpx;
  border-bottom: 1rpx solid $border;

  &:last-child {
    border-bottom: none;
  }
}

.cell__icon {
  width: 56rpx;
  height: 56rpx;
  border-radius: 14rpx;
  margin-right: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
  color: #ffffff;
}

.cell__icon--green { background-color: #07c160; }
.cell__icon--blue { background-color: #1989fa; }
.cell__icon--orange { background-color: #ff976a; }
.cell__icon--teal { background-color: #00b8d9; }
.cell__icon--red { background-color: #ee0a24; }
.cell__icon--gray { background-color: #969799; }
.cell__icon--purple { background-color: #7232c4; }

.cell__title {
  flex: 1;
  font-size: 30rpx;
  color: $text-1;
}

.cell__value {
  max-width: 300rpx;
  margin-right: 8rpx;
  font-size: 25rpx;
  color: $text-3;
}

.cell__arrow {
  font-size: 36rpx;
  color: #c8ccd4;
}

.cell--danger .cell__title {
  color: $danger;
  text-align: center;
}

// ------------------------------ 修改用户名弹窗 ------------------------------
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.modal {
  width: 600rpx;
  background-color: #ffffff;
  border-radius: 24rpx;
  padding: 40rpx 36rpx 32rpx;
}

.modal__title {
  display: block;
  font-size: 34rpx;
  font-weight: 600;
  color: $text-1;
}

.modal__desc {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: $text-3;
}

.modal__input {
  margin-top: 28rpx;
  height: 84rpx;
  padding: 0 24rpx;
  background-color: $bg-page;
  border-radius: 12rpx;
  font-size: 30rpx;
  color: $text-1;
}

.modal__placeholder {
  color: $text-3;
}

.modal__error {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: $danger;
}

.modal__actions {
  display: flex;
  margin-top: 36rpx;
}

.modal__btn {
  flex: 1;
  height: 84rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;
  font-size: 30rpx;
  background-color: #f2f3f5;
  color: $text-1;
}

.modal__btn--primary {
  margin-left: 20rpx;
  background-color: $brand;
  color: #ffffff;
}

.modal__btn--primary.is-disabled {
  opacity: 0.6;
}
</style>
