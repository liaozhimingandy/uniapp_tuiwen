<template>
  <view class="page">
    <view class="editor">
      <textarea
        v-model="text"
        class="editor__input"
        placeholder="此刻的想法…"
        placeholder-class="editor__placeholder"
        :maxlength="POST_CONTENT_MAX"
        auto-height
        :show-confirm-bar="false"
        :adjust-position="true"
      />
      <text class="editor__counter">{{ text.length }}/{{ POST_CONTENT_MAX }}</text>
    </view>

    <!-- 已选图片 -->
    <view v-if="images.length" class="thumbs">
      <view v-for="(path, index) in images" :key="path" class="thumb">
        <image class="thumb__img" :src="imageUrl(path)" mode="aspectFill" @tap="preview(index)" />
        <view class="thumb__remove" @tap.stop="removeImage(index)">
          <text class="thumb__remove-icon">×</text>
        </view>
      </view>
    </view>

    <!-- 工具条 -->
    <view class="toolbar">
      <view class="toolbar__item" @tap="pickImages">
        <text class="toolbar__icon">＋</text>
        <text>图片 {{ images.length }}/{{ MAX_IMAGES }}</text>
      </view>
      <view class="toolbar__item" @tap="toggleRight">
        <text>{{ rightLabel }}</text>
      </view>
    </view>

    <view class="tips">
      <text>草稿会自动保存在本机，7 天内重新进入可继续编辑</text>
    </view>

    <view class="footer">
      <view class="btn-primary" :class="{'is-disabled': submitting}" @tap="submit">
        {{ submitting ? '发布中…' : '发布' }}
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 发帖页
 *
 * 与 Web 端 `NewPost.vue` 的请求体保持一致：
 * `{content: {text, images: string[]}, post_type: 1, from_device: 9, right_status}`
 *
 * 草稿：选完图/打完字就落盘，退出再进能接着写。
 * 发布成功必须**先 await 接口再清草稿**——反过来的话发布失败时内容就找不回来了。
 */
import {computed, onUnmounted, ref, watch} from 'vue';
import {onLoad} from '@dcloudio/uni-app';
import {imageUrl, publishPost, upload} from '@/api';
import {useAccountStore, usePostStore} from '@/stores/account';
import {getItem, removeItem, setItem} from '@/utils/storage';
import {POST_CONTENT_MAX, MAX_IMAGES, POST_RIGHT, POST_RIGHT_MAP} from '@/config/constants';
import {toast} from '@/api/request';
import type {IPost, IPostDraft} from '@/types';

const DRAFT_KEY = 'tw_draft';
const DRAFT_TTL = 7 * 24 * 3600 * 1000;

const accountStore = useAccountStore();
const postStore = usePostStore();

const text = ref('');
const images = ref<string[]>([]);
const submitting = ref(false);
const rightStatus = ref<number>(POST_RIGHT.PUBLIC);

const rightLabel = computed(() => `${POST_RIGHT_MAP[rightStatus.value]}`);

/** 草稿落盘（防抖：textarea 每次输入都写一次 storage 会卡输入） */
let draftTimer: ReturnType<typeof setTimeout> | null = null;
const saveDraft = () => {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if (!text.value.trim() && images.value.length === 0) {
      removeItem(DRAFT_KEY);
      return;
    }
    const draft: IPostDraft = {text: text.value, images: images.value, createTime: Date.now()};
    setItem(DRAFT_KEY, draft);
  }, 600);
};

watch([text, images], saveDraft, {deep: true});

onLoad(() => {
  const draft = getItem<IPostDraft | null>(DRAFT_KEY, null);
  if (!draft) return;
  // 过期草稿直接丢弃：隔了一周再弹出上次的内容反而像 bug
  if (Date.now() - (draft.createTime || 0) > DRAFT_TTL) {
    removeItem(DRAFT_KEY);
    return;
  }
  text.value = draft.text || '';
  images.value = draft.images || [];
  if (text.value || images.value.length) toast('已恢复上次未发布的草稿');
});

onUnmounted(() => {
  if (draftTimer) clearTimeout(draftTimer);
  saveDraft();
});

/** 选图并逐张上传 */
const pickImages = () => {
  const remain = MAX_IMAGES - images.value.length;
  if (remain <= 0) {
    toast(`最多 ${MAX_IMAGES} 张图片`);
    return;
  }
  uni.chooseImage({
    count: remain,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const paths = (res.tempFilePaths || []) as string[];
      if (!paths.length) return;
      uni.showLoading({title: '上传中', mask: true});
      try {
        // 串行上传：并发上传在弱网下更容易整批失败，且无法告知用户是哪张失败
        for (const path of paths) {
          const relative = await upload(path);
          images.value.push(relative);
        }
      } catch (error: any) {
        toast(error?.detail || '图片上传失败');
      } finally {
        uni.hideLoading();
      }
    },
  });
};

const removeImage = (index: number) => {
  images.value.splice(index, 1);
};

const preview = (index: number) => {
  const urls = images.value.map((path) => imageUrl(path));
  uni.previewImage({urls, current: urls[index]});
};

/** 切换可见范围 */
const toggleRight = () => {
  rightStatus.value = rightStatus.value === POST_RIGHT.PUBLIC ? POST_RIGHT.PRIVATE : POST_RIGHT.PUBLIC;
};

/** 发布 */
const submit = async () => {
  if (submitting.value) return;
  const content = text.value.trim();
  if (!content) {
    toast('说点什么吧');
    return;
  }
  if (!accountStore.account.account_id) {
    toast('登录状态异常，请重新登录');
    return;
  }

  submitting.value = true;
  try {
    const post = await publishPost({
      content: {text: content, images: images.value},
      post_type: 1,
      from_device: 9,
      right_status: rightStatus.value,
    });

    // 发布接口返回的帖子可能缺 content，补一份本地的，保证首页立即可见
    const localPost: IPost = {
      ...post,
      post_id: post?.post_id || `${Date.now()}`,
      account_id: post?.account_id || accountStore.account.account_id,
      content: post?.content || {text: content, images: images.value},
      post_type: 1,
      from_device: 9,
      right_status: rightStatus.value,
      created_at: post?.created_at || new Date().toISOString(),
    };
    postStore.addPost(localPost);

    // 接口成功后才清草稿
    text.value = '';
    images.value = [];
    removeItem(DRAFT_KEY);
    toast('发布成功');
    setTimeout(() => uni.navigateBack(), 400);
  } catch (error: any) {
    toast(error?.detail || '发布失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
};
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $bg-card;
  padding: 24rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}

.editor {
  position: relative;
}

.editor__input {
  width: 100%;
  min-height: 320rpx;
  font-size: 32rpx;
  line-height: 1.7;
  color: $text-1;
}

.editor__placeholder {
  color: #b8bcc4;
}

.editor__counter {
  display: block;
  text-align: right;
  font-size: 22rpx;
  color: $text-3;
}

.thumbs {
  display: flex;
  flex-wrap: wrap;
  margin-top: 16rpx;
}

.thumb {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  margin: 0 12rpx 12rpx 0;
  border-radius: 8rpx;
  overflow: hidden;
}

.thumb__img {
  width: 100%;
  height: 100%;
}

.thumb__remove {
  position: absolute;
  top: 0;
  right: 0;
  width: 44rpx;
  height: 44rpx;
  background-color: rgba(0, 0, 0, 0.55);
  border-bottom-left-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb__remove-icon {
  color: #ffffff;
  font-size: 32rpx;
  line-height: 1;
}

.toolbar {
  display: flex;
  align-items: center;
  margin-top: 16rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid $border;
}

.toolbar__item {
  display: flex;
  align-items: center;
  margin-right: 40rpx;
  font-size: 26rpx;
  color: $text-2;
}

.toolbar__icon {
  margin-right: 8rpx;
  font-size: 34rpx;
  color: $brand;
}

.tips {
  margin-top: 20rpx;
  font-size: 22rpx;
  color: $text-3;
}

.footer {
  margin-top: auto;
  padding-top: 40rpx;
}
</style>
