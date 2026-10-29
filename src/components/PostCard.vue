<template>
  <view class="post">
    <!-- 作者区 -->
    <view class="post__head" @tap="goUser">
      <UserAvatar :name="authorName" :src="authorAvatar" :size="80" />
      <view class="post__meta">
        <text class="post__name ellipsis">{{ authorName }}</text>
        <text class="post__time">{{ timeText }}</text>
      </view>
    </view>

    <!-- 正文：点空白处进详情 -->
    <view class="post__body" @tap="goDetail">
      <text v-if="summary" class="post__text">{{ summary }}</text>
      <ImageGrid v-if="images.length" :images="images" />
    </view>

    <!-- 操作栏 -->
    <view class="post__actions">
      <view class="action" :class="{'action--on': liked}" @tap.stop="toggleLike">
        <text class="action__icon">{{ liked ? '♥' : '♡' }}</text>
        <text class="action__label">{{ liked ? '已赞' : '赞' }}</text>
        <text v-if="likeCount > 0" class="action__count">{{ formatCount(likeCount) }}</text>
      </view>
      <view class="action" @tap.stop="goDetail">
        <text class="action__label">评论</text>
      </view>
      <view class="action" :class="{'action--on': favorited}" @tap.stop="toggleFavorite">
        <text class="action__icon">{{ favorited ? '★' : '☆' }}</text>
        <text class="action__label">{{ favorited ? '已藏' : '藏' }}</text>
        <text v-if="favoriteCount > 0" class="action__count">{{ formatCount(favoriteCount) }}</text>
      </view>
      <view class="action" @tap.stop="copyLink">
        <text class="action__label">分享</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 信息流卡片
 *
 * 数据策略：
 * - 作者资料走 `useUserCacheStore`（同一位作者在多个卡片里只请求一次）
 * - 点赞状态**不预加载**：一屏 10 条就是 10 个额外请求，滑到哪点到哪再查即可，
 *   代价是未点过赞的卡片不显示数字，这比一进首页打 10 个接口划算。
 */
import {computed, onMounted, ref} from 'vue';
import {useUserCacheStore} from '@/stores/account';
import {likePost, unlikePost, fetchLikeState, sharePostLink, favoritePost, unfavoritePost, fetchFavoriteState} from '@/api';
import {formatSmartTime} from '@/utils/datetime';
import {contentImages, contentText, formatCount, stripHtml} from '@/utils/text';
import type {IPost} from '@/types';
import UserAvatar from '@/components/UserAvatar.vue';
import ImageGrid from '@/components/ImageGrid.vue';
import {isLoggedIn} from '@/utils/token';
import {LOGIN_PAGE, toast} from '@/api/request';

const props = defineProps<{post: IPost}>();

const userStore = useUserCacheStore();
const author = computed(() => userStore.accountMap[props.post.account_id]);
const authorName = computed(() => author.value?.nickname || author.value?.username || '匿名用户');
const authorAvatar = computed(() => author.value?.avatar || '');

const timeText = computed(() => formatSmartTime(props.post.created_at));

/** 列表只显示摘要：HTML 去标签，最多 5 行（CSS 侧 clamp） */
const summary = computed(() => stripHtml(contentText(props.post.content)));
const images = computed(() => contentImages(props.post.content));

const liked = ref(false);
const likeCount = ref(0);
/** 是否已同步过点赞状态（避免重复请求） */
let likeLoaded = false;

const favorited = ref(false);
const favoriteCount = ref(0);
/** 是否已同步过收藏状态（避免重复请求） */
let favoriteLoaded = false;

onMounted(() => {
  // 静默拉一次作者资料：失败就让卡片显示"匿名用户"，不打断列表
  void userStore.fetchUser(props.post.account_id).catch(() => undefined);
});

/** 进详情 */
const goDetail = () => {
  uni.navigateTo({url: `/pages/detail/detail?id=${props.post.post_id}`});
};

/** 进作者主页 */
const goUser = () => {
  if (!props.post.account_id) return;
  uni.navigateTo({url: `/pages/user/user?id=${props.post.account_id}`});
};

/** 点赞 / 取消：先乐观更新，失败回滚 */
const toggleLike = async () => {
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  const wasLiked = liked.value;
  const prevCount = likeCount.value;

  liked.value = !wasLiked;
  likeCount.value = Math.max(0, prevCount + (wasLiked ? -1 : 1));
  likeLoaded = true;

  try {
    if (wasLiked) {
      await unlikePost(props.post.post_id);
    } else {
      await likePost(props.post.post_id);
    }
  } catch {
    // 回滚，避免界面与后端不一致
    liked.value = wasLiked;
    likeCount.value = prevCount;
    toast('操作失败，请重试');
  }
};

/** 收藏 / 取消：先乐观更新，失败回滚（与点赞同一套交互） */
const toggleFavorite = async () => {
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  const wasFavorited = favorited.value;
  const prevCount = favoriteCount.value;

  favorited.value = !wasFavorited;
  favoriteCount.value = Math.max(0, prevCount + (wasFavorited ? -1 : 1));
  favoriteLoaded = true;

  try {
    if (wasFavorited) {
      await unfavoritePost(props.post.post_id);
    } else {
      await favoritePost(props.post.post_id);
    }
  } catch {
    favorited.value = wasFavorited;
    favoriteCount.value = prevCount;
    toast('操作失败，请重试');
  }
};

/** 复制分享链接（App/小程序均可复制，粘贴到任意聊天工具） */
const copyLink = () => {
  uni.setClipboardData({
    data: sharePostLink(props.post.post_id),
    success: () => toast('链接已复制'),
  });
};

/** 详情页加载完点赞/收藏状态后可用（供父组件手动同步，当前未使用但保留扩展点） */
const syncLikeState = async () => {
  if (!likeLoaded) {
    try {
      const state = await fetchLikeState(props.post.post_id);
      liked.value = !!state.is_liked;
      likeCount.value = state.count || 0;
      likeLoaded = true;
    } catch {
      // 静默
    }
  }
  if (!favoriteLoaded) {
    try {
      const state = await fetchFavoriteState(props.post.post_id);
      favorited.value = !!state.is_favorited;
      favoriteCount.value = state.count || 0;
      favoriteLoaded = true;
    } catch {
      // 静默
    }
  }
};

defineExpose({syncLikeState});
</script>

<style lang="scss" scoped>
.post {
  padding: 28rpx 24rpx;
  background-color: $bg-card;
  border-bottom: 1rpx solid $border;
}

.post__head {
  display: flex;
  align-items: center;
}

.post__meta {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.post__name {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: $text-1;
}

.post__time {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: $text-3;
}

.post__body {
  margin-top: 16rpx;
}

.post__text {
  font-size: 29rpx;
  color: $text-1;
  line-height: 1.62;
  word-break: break-word;
  /* 摘要最多 6 行，超出省略；进详情看全文 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 6;
  overflow: hidden;
}

.post__actions {
  display: flex;
  align-items: center;
  margin-top: 16rpx;
  margin-left: -8rpx;
}

.action {
  display: flex;
  align-items: center;
  padding: 8rpx 16rpx;
  color: $text-2;
  font-size: 25rpx;
}

.action--on {
  color: $danger;
}

.action__icon {
  margin-right: 6rpx;
  font-size: 30rpx;
  line-height: 1;
}

.action__count {
  margin-left: 4rpx;
  color: inherit;
}
</style>
