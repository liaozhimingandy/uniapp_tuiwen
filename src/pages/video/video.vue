<template>
  <view class="feed">
    <!-- 顶部 推荐 / 关注 双 Tab -->
    <view class="vtabs">
      <text class="vtabs__item" :class="{'vtabs__item--on': tab === 'rec'}" @tap="switchTab('rec')">推荐</text>
      <text class="vtabs__item" :class="{'vtabs__item--on': tab === 'follow'}" @tap="switchTab('follow')">关注</text>
    </view>

    <!-- 加载 / 错误态 -->
    <view v-if="items.length === 0 && loading" class="state">
      <view class="spinner" />
      <text class="state__text">加载中…</text>
    </view>
    <view v-else-if="items.length === 0 && loadError" class="state" @tap="reload">
      <text class="state__emoji">⚠️</text>
      <text class="state__text">视频加载失败，点击重试</text>
    </view>
    <!-- 关注流未登录 -->
    <view v-else-if="tab === 'follow' && !loggedIn" class="state" @tap="goLogin">
      <text class="state__emoji">🔒</text>
      <text class="state__text">登录后查看关注的人的视频</text>
      <view class="state__btn">去登录</view>
    </view>
    <!-- 关注流空态 -->
    <view v-else-if="items.length === 0" class="state">
      <text class="state__text">{{ tab === 'follow' ? '关注的人还没有发视频' : '暂无视频' }}</text>
    </view>

    <swiper
      v-else
      class="swiper"
      :vertical="true"
      :current="current"
      :duration="250"
      @change="onChange"
    >
      <swiper-item v-for="(item, idx) in items" :key="item.video_id">
        <view class="slide" @tap="onSlideTap">
          <!-- 海报垫底，避免视频未起播时黑屏 -->
          <image
            v-if="item.poster_url"
            class="poster"
            :class="{'player--rotated': isRotated(item)}"
            :src="staticLink(item.poster_url)"
            mode="aspectFill"
          />
          <!-- #ifdef H5 -->
          <!-- 原生 video(运行时渲染): 不给 src, 统一由 setupHls 接管
               (Safari 原生 HLS / 其余浏览器 hls.js) -->
          <component
            :is="NativeVideo"
            :id="'hv' + idx"
            class="player"
            :class="{'player--rotated': isRotated(item)}"
            :muted="!soundOn"
            :loop="true"
            playsinline
            webkit-playsinline
            x5-playsinline
            @play="onPlay"
            @pause="onPause"
            @timeupdate="onTimeUpdate"
          />
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <video
            :id="'uv' + idx"
            class="player"
            :class="{'player--rotated': isRotated(item)}"
            :src="staticLink(item.play_url)"
            :autoplay="idx === current"
            :loop="true"
            :muted="!soundOn"
            :show-center-play-btn="false"
            :enable-progress-gesture="false"
            object-fit="cover"
            @play="onPlay"
            @pause="onPause"
            @timeupdate="onTimeUpdate"
          />
          <!-- #endif -->

          <!-- 暂停时的中央播放图标 -->
          <view v-if="current === idx && !playing" class="playmask">
            <text class="playmask__icon">▶</text>
          </view>

          <!-- 双击点赞爱心动效 -->
          <view v-if="heartShow && current === idx" class="heart-burst">
            <text class="heart-burst__icon">❤️</text>
          </view>

          <!-- 右侧互动栏 -->
          <view class="side">
            <!-- 头像 + 关注（已关注显示 ✓ 回显） -->
            <view class="side__avatar" @tap.stop="toggleFollow(item)">
              <image
                v-if="item.author?.avatar_url"
                class="side__img"
                :src="staticLink(item.author.avatar_url)"
                mode="aspectFill"
              />
              <view v-else class="side__img side__img--ph">@</view>
              <view v-if="!isFollowed(item)" class="side__plus">+</view>
              <view v-else class="side__plus side__plus--on">✓</view>
            </view>
            <text class="side__name">{{ item.author?.nickname || '匿名' }}</text>

            <!-- 点赞（/likes/ target_type=2，乐观更新失败回滚） -->
            <view class="side__btn" @tap.stop="toggleLike(item)">
              <text class="side__icon" :class="{'side__icon--on': item.interaction?.liked}">{{ item.interaction?.liked ? '❤️' : '🤍' }}</text>
              <text class="side__num">{{ formatCount(item.stats?.like_count) }}</text>
            </view>

            <!-- 评论（打开底部评论面板） -->
            <view class="side__btn" @tap.stop="openComments(item)">
              <text class="side__icon">💬</text>
              <text class="side__num">{{ formatCount(item.stats?.comment_count) }}</text>
            </view>

            <!-- 收藏（/favorites/ target_type=2）★☆ 是文本字符靠 color 上色 -->
            <view class="side__btn" @tap.stop="toggleCollect(item)">
              <text class="side__icon" :class="{'side__icon--on': item.interaction?.collected}">{{ item.interaction?.collected ? '★' : '☆' }}</text>
              <text class="side__num">{{ formatCount(item.stats?.favorite_count) }}</text>
            </view>

            <!-- 旋转（横屏/未知方向的视频可手动转 90° 铺满竖屏） -->
            <view v-if="item.orientation !== 2" class="side__btn" @tap.stop="toggleRotate(item)">
              <text class="side__icon" :class="{'side__icon--on': isRotated(item)}">⟳</text>
              <text class="side__num">{{ isRotated(item) ? '还原' : '旋转' }}</text>
            </view>

            <!-- 分享 -->
            <view class="side__btn" @tap.stop="share(item)">
              <text class="side__icon">↗</text>
              <text class="side__num">分享</text>
            </view>
          </view>

          <!-- 底部文案 -->
          <view class="meta" @tap.stop>
            <text v-if="item.title" class="meta__title">{{ item.title }}</text>
            <text v-if="item.description" class="meta__desc">{{ item.description }}</text>
            <text class="meta__author">@{{ item.author?.nickname || '匿名' }}</text>
          </view>

          <!-- 底部播放进度条(仅当前屏渲染): 时间 + 可拖拽 seek -->
          <view
            v-if="idx === current && duration > 0"
            class="progress"
            @tap.stop
            @touchstart.stop="onSeekStart"
            @touchmove.stop.prevent="onSeekMove"
            @touchend.stop="onSeekEnd"
          >
            <view class="progress__time">
              <text>{{ fmtTime(displayTime) }}</text>
              <text>{{ fmtTime(duration) }}</text>
            </view>
            <view class="progress__track">
              <view class="progress__bar" :style="{width: (displayProgress * 100) + '%'}" />
              <view class="progress__dot" :style="{left: (displayProgress * 100) + '%'}" />
            </view>
          </view>
        </view>
      </swiper-item>
    </swiper>

    <!-- 声音开关（H5 自动播放策略要求先静音；小程序端靠 muted 属性绑定） -->
    <view class="sound" @tap="toggleSound">
      <text>{{ soundOn ? '🔊' : '🔇' }}</text>
    </view>

    <!-- 评论面板（底部抽屉） -->
    <view v-if="commentOpen" class="sheet-mask" @tap="closeComments">
      <view class="sheet" @tap.stop>
        <view class="sheet__bar" />
        <view class="sheet__head">
          <text class="sheet__title">评论 {{ formatCount(activeItem?.stats?.comment_count) }}</text>
          <text class="sheet__close" @tap="closeComments">✕</text>
        </view>

        <scroll-view class="sheet__list" scroll-y @scrolltolower="loadMoreComments">
          <view v-if="commentLoading && comments.length === 0" class="sheet__hint">加载中…</view>
          <view v-else-if="comments.length === 0" class="sheet__hint">还没有评论，来抢沙发</view>
          <view v-for="c in comments" :key="c.comment_id" class="cmt">
            <text class="cmt__author">{{ c.nickname || '匿名' }}：</text>
            <text class="cmt__content">{{ c.content }}</text>
            <text v-if="c.account_id === myAccountId" class="cmt__del" @tap="removeComment(c)">删除</text>
          </view>
        </scroll-view>

        <view class="sheet__input">
          <input
            v-model="commentText"
            class="sheet__field"
            placeholder="说点什么…"
            :adjust-position="true"
            @confirm="submitComment"
          />
          <view class="sheet__send" @tap="submitComment">发送</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 视频（推荐流）
 *
 * 全屏上下滑 swiper，每个 slide 一条视频：
 * - 微信 / App：用 uni `<video>`，m3u8 由原生播放器解码，无需额外处理
 * - H5：用原生 `<video>`，m3u8 走 hls.js 兜底（Chrome 不原生支持 HLS）
 *
 * 免登录：后端 `/videos/feed/` 在公开路由组，未登录也能拉取；
 * 关注 / 评论 / 分享 在没登录时跳登录页或引导登录。
 *
 * 互动：
 * - 关注：复用 /follows/，以后端返回的 interaction.followed 做已关注态回显
 * - 评论：复用 /comments/，target_type=2(VIDEO)，底部抽屉展示与发布
 * - 点赞：后端暂无视频点赞端点，这里做本地乐观切换（含计数 ±1），待后端补接口
 * - 分享：复制链接到剪贴板（如宿主支持则唤起系统分享）
 *
 * 分页：游标分页，`next_cursor` 为空即到底；滚动到倒数第 2 条时预取下一页。
 */
import {computed, reactive, ref} from 'vue';
import {onLoad, onUnload} from '@dcloudio/uni-app';
// #ifdef H5
import {h, defineComponent} from 'vue';
import Hls from 'hls.js';

/**
 * H5 原生 video：uni-app 会把模板里的 <video> 编译成 <uni-video> 复杂组件
 * (自带容器/控制条/内部状态机)，hls.js 直接接管其内部元素不可靠。
 * 用运行时 h() 渲染不经编译器转换，拿到的是纯 HTMLVideoElement。
 */
const NativeVideo = defineComponent((_props, {attrs}) => () => h('video', attrs));
// #endif
import {fetchVideoFeed, fetchFollowVideoFeed, likeVideo, unlikeVideo, favoriteVideo, unfavoriteVideo,
        follow, unfollow, fetchVideoComments, createVideoComment, deleteVideoComment} from '@/api';
import {staticLink, config} from '@/config';
import {isLoggedIn, getAccountId} from '@/utils/token';
import {LOGIN_PAGE, toast} from '@/api/request';
import type {IVideoItem, IComment} from '@/types';

/** 两个 feed 各自独立的游标与列表，切 Tab 不丢已加载内容 */
type FeedTab = 'rec' | 'follow';
interface FeedState {
  items: IVideoItem[];
  cursor: string | null;
  feedId: string | null;
  hasMore: boolean;
  loaded: boolean;
  error: boolean;
}
const newFeedState = (): FeedState => ({items: [], cursor: null, feedId: null, hasMore: true, loaded: false, error: false});
// 必须用 reactive: 普通对象上 st.items = [...] 赋值不触发 computed 重算,
// 会出现"接口有数据、页面一直显示暂无视频"的假死
const feeds = reactive<Record<FeedTab, FeedState>>({rec: newFeedState(), follow: newFeedState()});

const tab = ref<FeedTab>('rec');
const current = ref(0);
const loading = ref(false);
const playing = ref(false);
const soundOn = ref(false);
const loggedIn = ref(isLoggedIn());

const state = computed(() => feeds[tab.value]);
const items = computed(() => state.value.items);
const hasMore = computed(() => state.value.hasMore);
const loadError = computed(() => state.value.error);

// #ifdef H5
/** 已挂载 hls 实例，避免重复创建 */
const hlsMap = new Map<number, Hls>();
const hlsReady = new Set<number>();
/** 播放失败提示只弹一次，避免滑动刷屏 */
let hlsErrToasted = false;
// #endif

const currentItem = computed(() => items.value[current.value]);

/** 评论面板状态 */
const commentOpen = ref(false);
const comments = ref<IComment[]>([]);
const commentText = ref('');
const commentLoading = ref(false);
const commentHasMore = ref(false);
const myAccountId = computed(() => getAccountId());
const activeItem = ref<IVideoItem | null>(null);

const getPlayer = (idx: number): any => {
  // #ifdef H5
  // uni-app 会把模板里的 <video> 编译成 <uni-video> 自定义组件,
  // 真正的 HTMLVideoElement 在其内部 —— 拿宿主元素调 play/canPlayType
  // 全部静默失败(视频永远播不出来), 必须向下找一层。
  const host = document.getElementById('hv' + idx) as any;
  if (!host) return null;
  return host.tagName === 'VIDEO' ? host : host.querySelector('video');
  // #endif
  // #ifndef H5
  return uni.createVideoContext('uv' + idx);
  // #endif
};

const playIdx = (idx: number) => {
  items.value.forEach((_, i) => {
    if (i !== idx) getPlayer(i)?.pause?.();
  });
  const player = getPlayer(idx);
  if (!player) return;
  // #ifdef H5
  setupHls(idx, player as HTMLVideoElement);
  (player as HTMLVideoElement).muted = !soundOn.value;
  // #endif
  player.play?.();
};

// #ifdef H5
const setupHls = (idx: number, el: HTMLVideoElement) => {
  const item = items.value[idx];
  if (!item?.play_url?.endsWith('.m3u8')) return;
  if (hlsReady.has(idx)) return;
  hlsReady.add(idx);
  const src = staticLink(item.play_url);
  try {
    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      if (!el.src) el.src = src;
      return;
    }
    if (Hls.isSupported()) {
      const hls = new Hls();
      // 播放失败不再静默: 致命错误(清单404/网络/CORS)给出提示, 便于定位
      hls.on(Hls.Events.ERROR, (_evt: string, data: any) => {
        if (!data?.fatal) return;
        console.warn('[video] HLS 加载失败:', data.type, data.details);
        if (!hlsErrToasted) {
          hlsErrToasted = true;
          toast('视频加载失败，请检查网络');
        }
      });
      hls.loadSource(src);
      hls.attachMedia(el);
      hlsMap.set(idx, hls);
    }
  } catch {
    // 兜底失败就交给原生，不动声色
  }
};
// #endif

const onPlay = () => {
  playing.value = true;
};
const onPause = () => {
  playing.value = false;
};

// ----------------------------- 播放进度条（时间 + 拖拽 seek） -----------------------------

/** 当前屏播放器的播放位置与总时长(秒), timeupdate 驱动 */
const currentTime = ref(0);
const duration = ref(0);

/** 拖拽中: 位置由手势接管, 不再跟随 timeupdate */
const dragging = ref(false);
const dragRatio = ref(0);

/** mm:ss, 超过 1 小时进位到 mm 累加 */
const fmtTime = (sec: number): string => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const displayProgress = computed(() => {
  if (dragging.value) return dragRatio.value;
  return duration.value > 0 ? Math.min(currentTime.value / duration.value, 1) : 0;
});

const displayTime = computed(() => (dragging.value ? dragRatio.value * duration.value : currentTime.value));

const onTimeUpdate = (e: any) => {
  // #ifdef H5
  const el = e?.target as HTMLVideoElement | undefined;
  // 只跟随当前屏的播放器, 预取/邻屏的时间更新不刷进度
  if (!el || el !== getPlayer(current.value)) return;
  if (el.duration && isFinite(el.duration)) duration.value = el.duration;
  if (!dragging.value) currentTime.value = el.currentTime || 0;
  // #endif
  // #ifndef H5
  const d = Number(e?.detail?.duration);
  if (d > 0) duration.value = d;
  if (!dragging.value) currentTime.value = Number(e?.detail?.currentTime) || 0;
  // #endif
};

/** 拖拽位置换算: 轨道横贯全屏宽, 直接用触点 X / 屏宽 得比例 */
const updateDrag = (e: any) => {
  const x = Number(e?.touches?.[0]?.clientX);
  if (!isFinite(x)) return;
  let w = 1;
  // #ifdef H5
  w = window.innerWidth || 1;
  // #endif
  // #ifndef H5
  const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync();
  w = info.windowWidth || 1;
  // #endif
  dragRatio.value = Math.min(Math.max(x / w, 0), 1);
};

const onSeekStart = (e: any) => {
  if (!(duration.value > 0)) return;
  dragging.value = true;
  updateDrag(e);
};

const onSeekMove = (e: any) => {
  if (dragging.value) updateDrag(e);
};

const onSeekEnd = () => {
  if (!dragging.value) return;
  const ratio = dragRatio.value;
  dragging.value = false;
  const target = ratio * duration.value;
  currentTime.value = target; // 先回显, 等 timeupdate 接管
  const player = getPlayer(current.value);
  if (!player) return;
  // #ifdef H5
  (player as HTMLVideoElement).currentTime = target;
  // #endif
  // #ifndef H5
  player.seek(target);
  // #endif
};

// ----------------------------- 横屏视频旋转 -----------------------------

/** 手动旋转了 90° 的视频集合(按 video_id 记录, 跨 slide 互不影响) */
const rotatedIds = ref(new Set<string>());

const isRotated = (item: IVideoItem): boolean => rotatedIds.value.has(item.video_id);

const toggleRotate = (item: IVideoItem) => {
  const next = new Set(rotatedIds.value);
  if (next.has(item.video_id)) {
    next.delete(item.video_id);
  } else {
    next.add(item.video_id);
  }
  rotatedIds.value = next;
};

const togglePlay = () => {
  const player = getPlayer(current.value);
  if (!player) return;
  // #ifdef H5
  const el = player as HTMLVideoElement;
  if (el.paused) {
    playIdx(current.value);
  } else {
    el.pause();
  }
  // #endif
  // #ifndef H5
  if (playing.value) player.pause();
  else player.play();
  // #endif
};

const toggleSound = () => {
  soundOn.value = !soundOn.value;
  // #ifdef H5
  const el = getPlayer(current.value) as HTMLVideoElement | null;
  if (el) el.muted = !soundOn.value;
  // #endif
  // #ifndef H5
  // 小程序端 muted 是 video 组件的响应式属性(:muted), 无需手动操作
  toast(soundOn.value ? '声音已开启' : '已静音');
  // #endif
};

const onChange = (e: {detail: {current: number}}) => {
  current.value = e.detail.current;
  currentTime.value = 0; // 切屏重置进度条
  duration.value = 0;
  playIdx(current.value);
  if (hasMore.value && !loading.value && current.value >= items.value.length - 2) {
    void loadMore();
  }
  // 切换视频时若评论面板开着，关掉以免串内容
  if (commentOpen.value) closeComments();
};

/** 切 Tab：暂停旧流播放，回到顶部；关注流未登录直接展示登录引导 */
const switchTab = (next: FeedTab) => {
  if (tab.value === next) return;
  tab.value = next;
  loggedIn.value = isLoggedIn();
  current.value = 0;
  playing.value = false;
  items.value.forEach((_, i) => getPlayer(i)?.pause?.());
  const st = feeds[next];
  if (next === 'follow' && !loggedIn.value) return; // 游客态不请求
  if (!st.loaded) void loadMore();
  else setTimeout(() => playIdx(0), 60); // 等 swiper 重渲染完再起播
};

const loadMore = async () => {
  const st = feeds[tab.value];
  const tabKey = tab.value; // 记录发起请求时的 tab, 响应回来后校验防止串播
  if (loading.value || !st.hasMore) return;
  if (tab.value === 'follow' && !isLoggedIn()) return;
  loading.value = true;
  try {
    const page = tab.value === 'rec'
      ? await fetchVideoFeed(st.cursor, st.feedId, 6)
      : await fetchFollowVideoFeed(st.cursor, st.feedId, 6);
    const fresh = (page.items ?? []).filter(
      (it) => !st.items.some((old) => old.video_id === it.video_id),
    );
    st.items = [...st.items, ...fresh];
    st.feedId = page.feed_id || st.feedId;
    st.cursor = page.next_cursor || null;
    st.hasMore = Boolean(page.next_cursor) && fresh.length > 0;
    const firstLoad = !st.loaded;
    st.loaded = true;
    // 首屏数据到位后自动起播(小程序端靠 autoplay, H5 静音起播满足自动播放策略)
    if (firstLoad && fresh.length > 0 && tab.value === tabKey) {
      setTimeout(() => playIdx(0), 80);
    }
  } catch {
    st.error = st.items.length === 0;
  } finally {
    loading.value = false;
  }
};

const reload = () => {
  const st = feeds[tab.value];
  st.error = false;
  st.items = [];
  st.cursor = null;
  st.feedId = null;
  st.hasMore = true;
  st.loaded = false;
  current.value = 0;
  void loadMore();
};

const goLogin = () => uni.navigateTo({url: LOGIN_PAGE});

// ----------------------------- 互动：关注 -----------------------------

/** 是否已关注（后端 interaction.followed 回显，未登录恒为 false） */
const isFollowed = (item: IVideoItem): boolean => Boolean(item.interaction?.followed);

const toggleFollow = (item: IVideoItem) => {
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  const accountId = item.author?.account_id;
  if (!accountId) return;
  const followed = isFollowed(item);
  // 乐观更新：先切 UI，失败再回滚
  if (item.interaction) item.interaction.followed = !followed;
  const req = followed ? unfollow(accountId) : follow(accountId);
  req
    .then(() => toast(followed ? '已取消关注' : '已关注'))
    .catch((err: any) => {
      if (item.interaction) item.interaction.followed = followed; // 回滚
      toast(err?.detail || '操作失败');
    });
};

// ----------------------------- 互动：点赞 / 收藏（真实 API，乐观更新） -----------------------------

/** 统一的乐观互动：先切 UI，请求失败回滚 */
const optimistic = (item: IVideoItem, field: 'liked' | 'collected', run: () => Promise<unknown>) => {
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  if (!item.interaction) item.interaction = {};
  if (!item.stats) item.stats = {view_count: 0, like_count: 0, comment_count: 0, share_count: 0};

  const on = !item.interaction[field];
  item.interaction[field] = on;
  const bump = (delta: number) => {
    if (field === 'liked') {
      item.stats!.like_count = Math.max(0, (item.stats!.like_count || 0) + delta);
    } else {
      item.stats!.favorite_count = Math.max(0, (item.stats!.favorite_count || 0) + delta);
    }
  };
  bump(on ? 1 : -1);

  run().catch((err: any) => {
    item.interaction![field] = !on; // 回滚
    bump(on ? -1 : 1);
    toast(err?.detail || '操作失败');
  });
};

/** 点赞按钮：开/关切换 */
const toggleLike = (item: IVideoItem) => {
  optimistic(item, 'liked', () => (item.interaction?.liked ? likeVideo(item.video_id) : unlikeVideo(item.video_id)));
};

/** 收藏按钮：开/关切换 */
const toggleCollect = (item: IVideoItem) => {
  optimistic(item, 'collected', () => (item.interaction?.collected ? favoriteVideo(item.video_id) : unfavoriteVideo(item.video_id)));
};

// ----------------------------- 双击点赞（爱心动效） -----------------------------

const heartShow = ref(false);
let heartTimer: ReturnType<typeof setTimeout> | null = null;
let lastTapAt = 0;
let tapPending: ReturnType<typeof setTimeout> | null = null;

/** 爱心动效：600ms 后淡出 */
const burstHeart = () => {
  heartShow.value = true;
  if (heartTimer) clearTimeout(heartTimer);
  heartTimer = setTimeout(() => {
    heartShow.value = false;
  }, 600);
};

/**
 * 单击暂停/播放，双击点赞（抖音交互）：
 * 单击延迟 300ms 执行，等可能的第二击；第二击进来就取消单击、改点赞。
 */
const onSlideTap = () => {
  const now = Date.now();
  if (now - lastTapAt < 300) {
    lastTapAt = 0;
    if (tapPending) {
      clearTimeout(tapPending);
      tapPending = null;
    }
    const item = items.value[current.value];
    // 双击只赞不取消（抖音语义）；爱心动效每次都播
    if (item && !item.interaction?.liked) toggleLike(item);
    burstHeart();
  } else {
    lastTapAt = now;
    tapPending = setTimeout(() => {
      tapPending = null;
      togglePlay();
    }, 300);
  }
};

// ----------------------------- 互动：评论 -----------------------------

const openComments = (item: IVideoItem) => {
  activeItem.value = item;
  commentOpen.value = true;
  comments.value = [];
  commentHasMore.value = false;
  void loadComments();
};

const closeComments = () => {
  commentOpen.value = false;
  commentText.value = '';
};

const loadComments = async () => {
  if (!activeItem.value) return;
  commentLoading.value = true;
  try {
    const data = await fetchVideoComments(activeItem.value.video_id);
    const list = Array.isArray(data) ? data : (data.items ?? []);
    comments.value = list as IComment[];
    // 后端评论接口当前只回 items，没有游标；这里仅展示第一页
    commentHasMore.value = false;
  } catch (err: any) {
    toast(err?.detail || '评论加载失败');
  } finally {
    commentLoading.value = false;
  }
};

const loadMoreComments = () => {
  // 后端视频评论暂无游标分页，第一页足够展示；留空以扩展
};

const submitComment = async () => {
  const text = commentText.value.trim();
  if (!text) return;
  if (!isLoggedIn()) {
    uni.navigateTo({url: LOGIN_PAGE});
    return;
  }
  if (!activeItem.value) return;
  try {
    const created = await createVideoComment(activeItem.value.video_id, text);
    comments.value = [created, ...comments.value];
    if (activeItem.value.stats) activeItem.value.stats.comment_count = (activeItem.value.stats.comment_count || 0) + 1;
    commentText.value = '';
    toast('评论成功');
  } catch (err: any) {
    toast(err?.detail || '评论失败');
  }
};

const removeComment = async (c: IComment) => {
  try {
    await deleteVideoComment(String(c.comment_id));
    comments.value = comments.value.filter((x) => x.comment_id !== c.comment_id);
    if (activeItem.value?.stats) {
      activeItem.value.stats.comment_count = Math.max(0, (activeItem.value.stats.comment_count || 0) - 1);
    }
  } catch (err: any) {
    toast(err?.detail || '删除失败');
  }
};

// ----------------------------- 互动：分享 -----------------------------

const share = (item: IVideoItem) => {
  const link = `${config.APP_BASE_URL}/v/${item.video_id}/`;
  // #ifdef H5
  if (navigator?.clipboard) {
    navigator.clipboard.writeText(link).then(
      () => toast('链接已复制'),
      () => toast('复制失败'),
    );
    return;
  }
  // #endif
  uni.setClipboardData({
    data: link,
    success: () => toast('链接已复制'),
    fail: () => toast('复制失败'),
  });
};

/** 计数格式化：过万显示 1.2w */
const formatCount = (n?: number | null): string => {
  const v = Number(n) || 0;
  if (v < 10000) return String(v);
  return `${(v / 10000).toFixed(1)}w`;
};

onLoad(() => {
  loggedIn.value = isLoggedIn();
  void loadMore();
});

onUnload(() => {
  if (heartTimer) clearTimeout(heartTimer);
  if (tapPending) clearTimeout(tapPending);
  // #ifdef H5
  hlsMap.forEach((hls) => hls.destroy());
  hlsMap.clear();
  // #endif
});
</script>

<style lang="scss" scoped>
.feed {
  height: 100vh;
  background-color: #000000;
}

/* 顶部 推荐/关注 Tab */
.vtabs {
  position: fixed;
  top: calc(24rpx + env(safe-area-inset-top));
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  justify-content: center;
  gap: 48rpx;
  pointer-events: none;
}

.vtabs__item {
  pointer-events: auto;
  font-size: 30rpx;
  color: rgba(255, 255, 255, 0.65);
  text-shadow: 0 1rpx 4rpx rgba(0, 0, 0, 0.5);
}

.vtabs__item--on {
  color: #ffffff;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 10rpx;
}

/* 双击点赞爱心动效 */
.heart-burst {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  animation: heart-pop 0.6s ease-out forwards;
}

.heart-burst__icon {
  font-size: 140rpx;
  filter: drop-shadow(0 4rpx 16rpx rgba(0, 0, 0, 0.4));
}

@keyframes heart-pop {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }
  30% {
    opacity: 1;
    transform: scale(1.15);
  }
  70% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.1) translateY(-40rpx);
  }
}

/* 登录引导按钮 */
.state__btn {
  margin-top: 28rpx;
  padding: 14rpx 56rpx;
  border-radius: 40rpx;
  background-color: #fe2c55;
  color: #ffffff;
  font-size: 28rpx;
}

.swiper {
  height: 100vh;
}

.slide {
  position: relative;
  width: 100%;
  height: 100vh;
  background-color: #000000;
  overflow: hidden;
}

.poster,
.player {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.player {
  object-fit: cover;
}

/* 横屏视频手动旋转 90°: 宽高对调后居中铺满竖屏 */
.poster--rotated,
.player--rotated {
  width: 100vh;
  height: 100vw;
  top: 50%;
  left: 50%;
  right: auto;
  bottom: auto;
  transform: translate(-50%, -50%) rotate(90deg);
}

/* 底部播放进度条: 时间行 + 轨道 + 拖拽圆点 */
.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10rpx 0 12rpx;
  z-index: 6;
}

.progress__time {
  display: flex;
  justify-content: space-between;
  padding: 0 24rpx 8rpx;
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1rpx 4rpx rgba(0, 0, 0, 0.5);
}

.progress__track {
  position: relative;
  height: 6rpx;
  margin: 0 24rpx;
  background-color: rgba(255, 255, 255, 0.25);
  border-radius: 3rpx;
}

.progress__bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background-color: #fe2c55;
  border-radius: 3rpx;
}

.progress__dot {
  position: absolute;
  top: 50%;
  width: 24rpx;
  height: 24rpx;
  margin: -12rpx 0 0 -12rpx;
  border-radius: 50%;
  background-color: #ffffff;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.45);
}

/* H5 端 <video> 被编译成 uni-video 组件, 尺寸样式落在宿主上,
   内部真实的 video 元素需要撑满宿主 */
.player:deep(video) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.playmask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.playmask__icon {
  font-size: 96rpx;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.5);
}

.side {
  position: absolute;
  right: 20rpx;
  bottom: 220rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.side__avatar {
  position: relative;
  width: 84rpx;
  height: 84rpx;
}

.side__img {
  width: 84rpx;
  height: 84rpx;
  border-radius: 42rpx;
  border: 2rpx solid #ffffff;
  background-color: #333333;
}

.side__img--ph {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 36rpx;
}

.side__plus {
  position: absolute;
  left: 50%;
  bottom: -14rpx;
  transform: translateX(-50%);
  width: 32rpx;
  height: 32rpx;
  border-radius: 16rpx;
  background-color: #fe2c55;
  color: #ffffff;
  font-size: 26rpx;
  line-height: 32rpx;
  text-align: center;
}

.side__plus--on {
  background-color: #888888;
}

.side__name {
  margin-top: 12rpx;
  max-width: 160rpx;
  font-size: 24rpx;
  color: #ffffff;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side__btn {
  margin-top: 36rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.side__icon {
  /* ★☆⟳↗ 是文本字符, 白色才在黑背景上可见; emoji 不受 color 影响 */
  color: #ffffff;
  font-size: 52rpx;
  line-height: 1;
  filter: drop-shadow(0 2rpx 6rpx rgba(0, 0, 0, 0.4));
}

.side__icon--on {
  transform: scale(1.05);
}

.side__num {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #ffffff;
  text-shadow: 0 1rpx 4rpx rgba(0, 0, 0, 0.5);
}

.meta {
  position: absolute;
  left: 28rpx;
  right: 130rpx;
  bottom: 110rpx;
  display: flex;
  flex-direction: column;
}

.meta__title {
  font-size: 32rpx;
  font-weight: 600;
  color: #ffffff;
  line-height: 1.4;
}

.meta__desc {
  margin-top: 12rpx;
  font-size: 27rpx;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.5;
  max-height: 120rpx;
  overflow: hidden;
}

.meta__author {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.7);
}

.state {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.state__emoji {
  font-size: 80rpx;
}

.state__text {
  margin-top: 20rpx;
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.7);
}

.spinner {
  width: 64rpx;
  height: 64rpx;
  border: 6rpx solid rgba(255, 255, 255, 0.25);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sound {
  position: fixed;
  top: calc(20rpx + env(safe-area-inset-top));
  right: 24rpx;
  z-index: 20;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 32rpx;
  background-color: rgba(0, 0, 0, 0.4);
  font-size: 32rpx;
}

/* 评论抽屉 */
.sheet-mask {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 99;
}

.sheet {
  width: 100%;
  height: 70vh;
  background-color: #ffffff;
  border-radius: 24rpx 24rpx 0 0;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet__bar {
  width: 64rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background-color: #dddddd;
  margin: 16rpx auto 0;
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 28rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.sheet__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333333;
}

.sheet__close {
  font-size: 32rpx;
  color: #999999;
  padding: 0 8rpx;
}

.sheet__list {
  flex: 1;
  padding: 12rpx 28rpx;
}

.sheet__hint {
  margin-top: 60rpx;
  text-align: center;
  font-size: 26rpx;
  color: #999999;
}

.cmt {
  padding: 18rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
  font-size: 28rpx;
  line-height: 1.5;
}

.cmt__author {
  color: #576b95;
}

.cmt__content {
  color: #333333;
}

.cmt__del {
  margin-left: 16rpx;
  font-size: 24rpx;
  color: #fe2c55;
}

.sheet__input {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  border-top: 1rpx solid #f0f0f0;
}

.sheet__field {
  flex: 1;
  height: 72rpx;
  padding: 0 24rpx;
  border-radius: 36rpx;
  background-color: #f5f5f5;
  font-size: 28rpx;
}

.sheet__send {
  margin-left: 20rpx;
  padding: 0 32rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 36rpx;
  background-color: #fe2c55;
  color: #ffffff;
  font-size: 28rpx;
}
</style>
