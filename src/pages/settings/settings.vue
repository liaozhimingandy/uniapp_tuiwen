<template>
  <view class="page">
    <view class="group">
      <view class="cell cell--avatar" @tap="changeAvatar">
        <text class="cell__title">头像</text>
        <view class="cell__right">
          <UserAvatar :name="displayName" :src="form.avatar" :size="96" />
          <text class="cell__arrow">›</text>
        </view>
      </view>

      <view class="cell">
        <text class="cell__title">昵称</text>
        <input v-model="form.nickname" class="cell__input" placeholder="请输入昵称" :maxlength="24" />
      </view>

      <view class="cell">
        <text class="cell__title">个性签名</text>
        <input v-model="form.bio" class="cell__input" placeholder="介绍一下自己" :maxlength="60" />
      </view>

      <picker mode="selector" :range="sexLabels" :value="sexIndex" @change="onSexChange">
        <view class="cell">
          <text class="cell__title">性别</text>
          <text class="cell__value">{{ sexLabel }}</text>
          <text class="cell__arrow">›</text>
        </view>
      </picker>

      <picker mode="date" :value="form.birthday || '2000-01-01'" start="1900-01-01" :end="today" @change="onBirthdayChange">
        <view class="cell">
          <text class="cell__title">生日</text>
          <text class="cell__value">{{ form.birthday || '未设置' }}</text>
          <text class="cell__arrow">›</text>
        </view>
      </picker>
    </view>

    <view class="group">
      <view class="cell">
        <text class="cell__title">邮箱</text>
        <text class="cell__value">{{ accountStore.account.mail || '—' }}</text>
      </view>
      <view class="cell">
        <text class="cell__title">账号 ID</text>
        <text class="cell__value">{{ accountStore.account.account_id || '—' }}</text>
      </view>
    </view>

    <view class="footer">
      <view class="btn-primary" :class="{'is-disabled': saving}" @tap="save">{{ saving ? '保存中…' : '保存' }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 编辑资料
 *
 * 性别 / 生日用系统 picker：
 * - picker mode="selector" 拿下标再映射，不能直接把下标当值提交（后端 sex 是 0/1/2/9）
 * - picker mode="date" 返回 YYYY-MM-DD，正好是后端 birthday 的格式
 */
import {computed, reactive, ref} from 'vue';
import {onLoad} from '@dcloudio/uni-app';
import UserAvatar from '@/components/UserAvatar.vue';
import {updateAccount, upload} from '@/api';
import {useAccountStore, useUserCacheStore} from '@/stores/account';
import {SEX_OPTIONS} from '@/config/constants';
import {toast} from '@/api/request';

const accountStore = useAccountStore();
const userStore = useUserCacheStore();

const saving = ref(false);

const form = reactive({
  nickname: '',
  bio: '',
  avatar: '',
  birthday: '',
  sex: 0,
});

const displayName = computed(() => form.nickname || accountStore.displayName);

/** 性别文案：0 / null 表示还没填过（不在选项集合里） */
const sexLabel = computed(() => SEX_OPTIONS.find((item) => item.value === form.sex)?.label || '未设置');

/** picker 需要的字符串数组与当前下标 */
const sexLabels = SEX_OPTIONS.map((item) => item.label);
const sexIndex = computed(() => {
  const index = SEX_OPTIONS.findIndex((item) => item.value === form.sex);
  return index < 0 ? 0 : index;
});

/** 生日上限：今天（后端不接受未来日期） */
const today = new Date().toISOString().slice(0, 10);

/** 用 store 里的资料回填（进页面时 store 一定已经有数据，见 me 页 onShow） */
const fill = () => {
  const account = accountStore.account;
  form.nickname = account.nickname || '';
  form.bio = account.bio || '';
  form.avatar = account.avatar || '';
  form.birthday = account.birthday || '';
  form.sex = typeof account.sex === 'number' ? account.sex : 0;
};

onLoad(() => {
  fill();
  // 兜底：直接进本页（未经 me 页）时 store 可能为空，补拉一次
  if (!accountStore.account.account_id) {
    void accountStore.loadSelf().then(fill);
  }
});

/** 改头像：选图 → 上传 → 拿到相对路径 */
const changeAvatar = () => {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const path = (res.tempFilePaths || [])[0];
      if (!path) return;
      uni.showLoading({title: '上传中', mask: true});
      try {
        form.avatar = await upload(path);
      } catch (error: any) {
        toast(error?.detail || '上传失败');
      } finally {
        uni.hideLoading();
      }
    },
  });
};

/** 性别选择回调：拿到的是下标，必须映射成后端的值（0/1/2/9） */
const onSexChange = (event: any) => {
  const index = Number(event?.detail?.value ?? 0);
  const option = SEX_OPTIONS[index];
  if (option) form.sex = option.value;
};

/** 生日选择回调：picker mode="date" 返回 YYYY-MM-DD */
const onBirthdayChange = (event: any) => {
  form.birthday = String(event?.detail?.value || '');
};

/** 保存 */
const save = async () => {
  if (saving.value) return;
  const accountId = accountStore.account.account_id;
  if (!accountId) {
    toast('登录状态异常');
    return;
  }
  if (!form.nickname.trim()) {
    toast('昵称不能为空');
    return;
  }

  saving.value = true;
  try {
    const updated = await updateAccount(accountId, {
      nickname: form.nickname.trim(),
      bio: form.bio.trim(),
      avatar: form.avatar,
      birthday: form.birthday,
      sex: form.sex,
      area_code: accountStore.account.area_code || 'CHN',
    });
    // 后端可能只返回部分字段：与本地合并，避免把没返回的字段清空
    accountStore.saveAccount({...accountStore.account, ...updated});
    userStore.setUser(accountId, accountStore.account);
    toast('保存成功');
    setTimeout(() => uni.navigateBack(), 400);
  } catch (error: any) {
    toast(error?.detail || '保存失败');
  } finally {
    saving.value = false;
  }
};
</script>

<style lang="scss" scoped>
.page {
  min-height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px));
  box-sizing: border-box;
  background-color: $bg-page;
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
}

.group {
  margin-top: 20rpx;
  background-color: $bg-card;
}

.cell {
  display: flex;
  align-items: center;
  min-height: 104rpx;
  padding: 0 32rpx;
  border-bottom: 1rpx solid $border;

  &:last-child {
    border-bottom: none;
  }
}

.cell--avatar {
  min-height: 140rpx;
}

.cell__title {
  width: 160rpx;
  font-size: 30rpx;
  color: $text-1;
}

.cell__right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.cell__input {
  flex: 1;
  text-align: right;
  font-size: 29rpx;
}

.cell__value {
  flex: 1;
  text-align: right;
  font-size: 28rpx;
  color: $text-2;
}

.cell__arrow {
  margin-left: 12rpx;
  font-size: 36rpx;
  color: #c8ccd4;
}

.footer {
  padding: 48rpx 32rpx 0;
}
</style>
