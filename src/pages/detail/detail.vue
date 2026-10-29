<template>
  <view class="page">
    <view v-if="loading" class="empty">加载中…</view>

    <template v-else-if="post">
      <!-- 正文 -->
      <view class="card detail">
        <view class="detail__head" @tap="goUser">
          <UserAvatar :name="authorName" :src="authorAvatar" :size="88" />
          <view class="detail__meta">
            <text class="detail__name ellipsis">{{ authorName }}</text>
            <text class="detail__time">{{ timeText }}</text>
          </view>
          <text v-if="isMine" class="detail__delete" @tap.stop="removePost">删除</text>
        </view>

        <!-- 富文本走 rich-text（不会执行脚本），纯文本走 text 保留换行 -->
        <rich-text v-if="isHtml" class="detail__rich" :nodes="bodyHtml" />
        <text v-else class="detail__text">{{ bodyText }}</text>

        <ImageGrid v-if="images.length" :images="images" />

        <view class="detail__stats">
          <text class="detail__stat">{{ likeCount }} 赞</text>
          <text class="detail__stat">{{ comments.length }} 评论</text>
        </view>
      </view>

      <!-- 评论 -->
      <view class="card comments">
        <text class="comments__title">评论</text>

        <view v-if="comments.length === 0" class="empty">还没有评论，来说两句</view>

        <view v-for="item in comments" :key="item.comment_id" class="comment">
          <UserAvatar :name="commentAuthor(item.account_id)" :size="64" />
          <view class="comment__body">
            <text class="comment__name">{{ commentAuthor(item.account_id) }}</text>
            <text class="comment__text">{{ item.content }}</text>
            <text class="comment__time">{{ formatSmartTime(item.created_at) }}</text>
          </view>
        </view>
      </view>
    </template>

    <view v-else class="empty">内容不存在或已删除</view>

    <!-- 底部操作栏 -->
    <view v-if="post" class="bar">
      <view class="bar__like" :class="{'bar__like--on': liked}" @tap="toggleLike">
        <text class="bar__icon">{{ liked ? '♥' : '♡' }}</text>
        <text class="bar__label">{{ liked ? '已赞' : '赞' }}</text>
      </view>
      <input
        v-model="draftComment"
        class="bar__input"
        placeholder="说点什么…"
        placeholder-class="bar__placeholder"
        confirm-type="send"
        :maxlength="500"
        :adjust-position="true"
        @confirm="submitComment"
      />
      <view class="bar__send" :class="{'bar__send--disabled': !draftComment.trim() || sending}" @tap="submitComment">
        发送
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 帖子详情 + 评论
 *
 * 数据来源：`/posts/{id}/`、`/comments/1/{id}/`、`/likes/{id}/count/`
 * 评论不做楼中楼（后端有 parent_id，但移动端首版只展示平铺列表，回复功能留待后续）。
 */
import {computed, ref} from 'vue';
import {onLoad, onPullDownRefresh} from '@dcloudio/uni-app';
import UserAvatar from '@/components/UserAvatar.vue';
import ImageGrid from '@/components/ImageGrid.vue';
import {createComment, deletePost, fetchComments, fetchLikeState, fetchPost, likePost, unlikePost} from '@/api';
import {useAccountStore, useUserCacheStore} from '@/stores/account';
import {formatSmartTime} from '@/utils/datetime';
import {absolutizeHtml, contentImages, contentText, looksLikeHtml} from '@/utils/text';
import {config} from '@/config';
import {isLoggedIn} from '@/utils/token';
import {LOGIN_PAGE, toast} from '@/api/request';
import type {IComment, IPost} from '@/types';

const accountStore = useAccountStore();
const userStore = useUserCacheStore();

const postId = ref('');
const post = ref<IPost | null>(null);
const comments = ref<IComment[]>([]);
const loading = ref(true);
const liked = ref(false);
const likeCount = ref(0);
const draftComment = ref('');
const sending = ref(false);

const author = computed(() => (post.value ? userStore.accountMap[post.value.account_id] : undefined));
const authorName = computed(() => author.value?.nickname || author.value?.username || '匿名用户');
const authorAvatar = computed(() => author.value?.avatar || '');

const bodyText = computed(() => contentText(post.value?.content));
const isHtml = computed(() => looksLikeHtml(bodyText.value));
/** rich-text 需要字符串形式的 HTML；相对图片地址在这里补成 CDN 绝对地址 */
const bodyHtml = computed(() => absolutizeHtml(bodyText.value, config.CDN_BASE_URL));
const images = computed(() => contentImages(post.value?.content));
const timeText = computed(() => formatSmartTime(post.value?.created_at));

/** 是否自己的帖子（决定是否显示删除） */
const isMine = computed(
  () => !!post.value && !!accountStore.account.account_id && post.value.account_id === accountStore.account.account_id,
);

/** 评论作者昵称（走缓存，未加载时先显示"用户"） */
const commentAuthor = (accountId: string): string => {
  const user = userStore.accountMap[accountId];
  return user?.nickname || user?.username || '用户';
};

/** 加载 */
const load = async () => {
  if (!postId.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    post.value = await fetchPost(postId.value);
    // 作者与关注信息：失败不阻断详情展示
    void userStore.fetchUser(post.value.account_id).catch(() => undefined);

    const [commentResult, likeState] = await Promise.all([
      fetchComments(postId.value).catch(() => [] as IComment[]),
      fetchLikeState(postId.value).catch(() => null),
    ]);

    // 后端评论接口既可能返回数组，也可能返回 {items: []}，两种都兼容
    comments.value = Array.isArray(commentResult) ? commentResult : (commentResult?.items ?? []);
    if (likeState) {
      liked.value = !!likeState.is_liked;
      likeCount.value = likeState.count || 0;
    }

    // 预取评论作者资料（去重后并发，避免每条评论各发一次）
    const ids = Array.from(new Set(comments.value.map((item) => item.account_id))).filter(Boolean);
    ids.forEach((id) => {
      void userStore.fetchUser(id).catch(() => undefined);
    });
  } catch (error: any) {
    toast(error?.detail || '加载失败');
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
};

/** 点赞 */
const toggleLike = async () => {
  if (!post.value) return;
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  const wasLiked = liked.value;
  const prev = likeCount.value;
  liked.value = !wasLiked;
  likeCount.value = Math.max(0, prev + (wasLiked ? -1 : 1));
  try {
    if (wasLiked) await unlikePost(post.value.post_id);
    else await likePost(post.value.post_id);
  } catch {
    liked.value = wasLiked;
    likeCount.value = prev;
    toast('操作失败，请重试');
  }
};

/** 发评论 */
const submitComment = async () => {
  if (!post.value || sending.value) return;
  const content = draftComment.value.trim();
  if (!content) return;
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }

  sending.value = true;
  try {
    const created = await createComment(post.value.post_id, content);
    // 后端可能不回 comment_id：本地补一个临时 id 保证列表渲染不重复
    comments.value.push({
      ...created,
      comment_id: created?.comment_id || `local-${Date.now()}`,
      content: created?.content || content,
      account_id: created?.account_id || accountStore.account.account_id,
      created_at: created?.created_at || new Date().toISOString(),
    });
    draftComment.value = '';
    toast('评论成功');
  } catch (error: any) {
    toast(error?.detail || '评论失败');
  } finally {
    sending.value = false;
  }
};

/** 删除自己的帖子 */
const removePost = () => {
  if (!post.value) return;
  uni.showModal({
    title: '删除这条动态？',
    content: '删除后不可恢复',
    confirmColor: '#E34D59',
    success: async (res) => {
      if (!res.confirm || !post.value) return;
      try {
        await deletePost(post.value.post_id);
        toast('已删除');
        setTimeout(() => uni.navigateBack(), 400);
      } catch (error: any) {
        toast(error?.detail || '删除失败');
      }
    },
  });
};

const goUser = () => {
  if (!post.value) return;
  uni.navigateTo({url: `/pages/user/user?id=${post.value.account_id}`});
};

onLoad((options) => {
  postId.value = String(options?.id || '');
  void load();
});

// 详情页支持下拉刷新：评论是别人随时会加的，下拉重载比退回列表再进更快
onPullDownRefresh(() => {
  void load();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $bg-page;
  /* 给底部输入栏留位，否则最后一条评论会被挡住 */
  padding-bottom: calc(120rpx + env(safe-area-inset-bottom));
}

.card {
  margin: 16rpx 0;
  padding: 28rpx 24rpx;
}

.detail__head {
  display: flex;
  align-items: center;
}

.detail__meta {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.detail__name {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
}

.detail__time {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: $text-3;
}

.detail__delete {
  padding: 8rpx 12rpx;
  font-size: 24rpx;
  color: $danger;
}

.detail__text {
  display: block;
  margin-top: 20rpx;
  font-size: 31rpx;
  line-height: 1.72;
  word-break: break-word;
}

.detail__rich {
  display: block;
  margin-top: 20rpx;
  font-size: 31rpx;
  line-height: 1.72;
}

.detail__stats {
  display: flex;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid $border;
}

.detail__stat {
  margin-right: 32rpx;
  font-size: 24rpx;
  color: $text-3;
}

.comments__title {
  display: block;
  margin-bottom: 16rpx;
  font-size: 28rpx;
  font-weight: 600;
}

.comment {
  display: flex;
  padding: 20rpx 0;
  border-top: 1rpx solid $border;
}

.comment__body {
  flex: 1;
  min-width: 0;
  margin-left: 16rpx;
}

.comment__name {
  display: block;
  font-size: 25rpx;
  color: $text-2;
}

.comment__text {
  display: block;
  margin-top: 6rpx;
  font-size: 28rpx;
  line-height: 1.6;
  word-break: break-word;
}

.comment__time {
  display: block;
  margin-top: 8rpx;
  font-size: 21rpx;
  color: $text-3;
}

.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background-color: $bg-card;
  border-top: 1rpx solid $border;
}

.bar__like {
  display: flex;
  align-items: center;
  margin-right: 20rpx;
  color: $text-2;
}

.bar__like--on {
  color: $danger;
}

.bar__icon {
  font-size: 34rpx;
}

.bar__label {
  margin-left: 6rpx;
  font-size: 24rpx;
}

.bar__input {
  flex: 1;
  height: 72rpx;
  padding: 0 24rpx;
  background-color: #f2f3f5;
  border-radius: 36rpx;
  font-size: 28rpx;
}

.bar__placeholder {
  color: #b8bcc4;
}

.bar__send {
  margin-left: 16rpx;
  padding: 0 24rpx;
  height: 68rpx;
  line-height: 68rpx;
  border-radius: 34rpx;
  background-color: $brand;
  color: #ffffff;
  font-size: 26rpx;
}

.bar__send--disabled {
  opacity: 0.45;
}
</style>
