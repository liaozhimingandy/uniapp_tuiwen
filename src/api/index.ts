/**
 * 接口地址与业务请求封装
 *
 * 所有路径集中在此，避免散落在页面里（后端改路由时只改一处）。
 * 路径口径与 Web 端 `src/services/api.ts` 保持一致，两端同源。
 */
import {http, uploadImage} from '@/api/request';
import {config, staticLink, getApiBaseUrl} from '@/config';
import {getToken} from '@/utils/token';
import {getLocalTimeZone} from '@/utils/datetime';
import type {
  IAccount,
  IComment,
  IFavoriteState,
  IFollow,
  ILikeState,
  INotice,
  ILoginResult,
  IPage,
  IPost,
  ISnap,
  IVideoFeedPage,
  IMyVideo,
} from '@/types';

/** 评论 / 点赞的 target_type：1 = 帖子，2 = 视频（对应后端 Comment.TargetTypeEnum） */
export const COMMENT_TARGET_POST = 1;
export const COMMENT_TARGET_VIDEO = 2;

export const apiUrls = {
  // 账号
  getAccount: (accountId: string) => `/accounts/${accountId}/`,
  checkUsername: (username: string) => `/accounts/check-username/${username}/`,
  updateUsername: () => '/accounts/credential/',
  register: () => '/accounts/register/',
  updatePassword: () => '/accounts/password/change/',
  resetPassword: () => '/accounts/password/reset/',
  updateAccount: (accountId: string) => `/accounts/${accountId}/`,
  sendCode: () => '/accounts/send/code/',
  login: () => '/oauth/authorize/password/',
  refreshToken: (accountId: string) => `/oauth/refresh-token/${accountId}/refresh_token/`,
  searchAccount: (keyword: string) => `/accounts/search/${encodeURIComponent(keyword)}/`,

  // 帖子
  posts: () => '/posts/',
  post: (postId: string) => `/posts/${postId}/`,
  accountPosts: (accountId: string) => `/posts/accounts/${accountId}/`,
  latestPosts: () => '/posts/latest/',
  sharePost: (postId: string) => `/posts/s/${postId}/`,
  searchPost: (keyword: string) => `/posts/search/${encodeURIComponent(keyword)}/`,
  hotPosts: () => '/posts/hot/',

  // 评论
  comments: (postId: string) => `/comments/${COMMENT_TARGET_POST}/${postId}/`,
  commentsFor: (targetType: number, targetId: string) => `/comments/${targetType}/${targetId}/`,
  createComment: () => '/comments/',
  deleteComment: (commentId: string) => `/comments/${commentId}/`,

  // 点赞
  likes: () => '/likes/',
  deleteLike: (postId: string) => `/likes/${postId}/`,
  likeCount: (postId: string) => `/likes/${postId}/count/`,
  likedPosts: (accountId: string) => `/likes/account/${accountId}/`,

  // 收藏
  favorites: () => '/favorites/',
  deleteFavorite: (postId: string) => `/favorites/${postId}/`,
  favoriteCount: (postId: string) => `/favorites/${postId}/count/`,
  favoritedPosts: (accountId: string) => `/favorites/account/${accountId}/`,

  // 关注流（关注对象的帖子）
  followPosts: () => '/posts/follow/',

  // 关注
  follows: () => '/follows/',
  deleteFollow: (followeeId: string) => `/follows/${followeeId}/`,
  followCount: (accountId: string) => `/follows/${accountId}/count/`,
  followees: (accountId: string) => `/follows/${accountId}/followees/`,
  followers: (accountId: string) => `/follows/${accountId}/followers/`,

  // 天亮即焚
  snaps: () => '/snaps/',
  latestSnaps: () => '/snaps/latest/',
  likeSnap: (id: number) => `/snaps/${id}/like/`,

  // 视频
  videoFeed: () => '/videos/feed/',
  followVideoFeed: () => '/videos/follow/',
  mineVideos: () => '/videos/mine/',
  uploadVideo: () => '/videos/upload/',

  // 其它
  notices: () => '/notices/system/',
  myNotices: (accountId: string) => `/notices/accounts/${accountId}/`,
  unreadCount: (accountId: string) => `/notices/accounts/${accountId}/unread-count/`,
  markNoticesRead: () => '/notices/read/',
  feedback: () => '/feedbacks/',
  health: () => '/health-check/',
};

/** 分享出去的帖子链接（站点地址 + Web 端路由） */
export const sharePostLink = (postId: string): string => `${config.APP_BASE_URL}/s/${postId}/`;

/** 分享出去的用户主页链接 */
export const shareAccountLink = (accountId: string): string => `${config.APP_BASE_URL}/u/${accountId}/`;

/** 图片相对路径 → 完整地址 */
export const imageUrl = staticLink;

// ------------------------------ 鉴权 ------------------------------

/**
 * 登录
 *
 * 后端要求 `application/x-www-form-urlencoded`，且密码是 md5 后的值（与 Web 端一致）。
 */
export const login = (username: string, passwordMd5: string): Promise<ILoginResult> =>
  http.post<ILoginResult>(apiUrls.login(), {username, password: passwordMd5}, {form: true, auth: false, hideError: true});

/** 注册（密码同样传 md5） */
export const register = (payload: Record<string, unknown>): Promise<IAccount> =>
  http.post<IAccount>(apiUrls.register(), payload, {auth: false, hideError: true});

/** 发送邮箱验证码 */
export const sendCode = (mail: string, scene: string): Promise<{message: string}> =>
  http.post<{message: string}>(apiUrls.sendCode(), {channel: 'mail', account: mail, scene}, {auth: false, hideError: true});

/** 重置密码（username 即注册邮箱） */
export const resetPassword = (mail: string, code: string, passwordMd5: string): Promise<{message: string}> =>
  http.put<{message: string}>(apiUrls.resetPassword(), {username: mail, code, password: passwordMd5}, {
    auth: false,
    hideError: true,
  });

// ------------------------------ 账号 ------------------------------

/** 拉取用户资料 */
export const fetchAccount = (accountId: string): Promise<IAccount> => http.get(apiUrls.getAccount(accountId));

/** 拉取关注统计 + 是否已关注 */
export const fetchFollow = (accountId: string): Promise<IFollow> => http.get(apiUrls.followCount(accountId));

/** 更新自己的资料 */
export const updateAccount = (accountId: string, payload: Partial<IAccount>): Promise<IAccount> =>
  http.put<IAccount>(apiUrls.updateAccount(accountId), payload as Record<string, unknown>, {hideError: true});

/** 检测用户名是否已被占用（改用户名前置校验） */
export const checkUsernameExists = (username: string): Promise<{exists: boolean}> =>
  http.get<{exists: boolean}>(apiUrls.checkUsername(username), {hideError: true});

/** 修改用户名（PATCH /accounts/credential/，type=username；后端统一小写存储） */
export const changeUsername = (username: string): Promise<IAccount> =>
  http.patch<IAccount>(apiUrls.updateUsername(), {type: 'username', new_value: username} as Record<string, unknown>);

/** 关注 */
export const follow = (followeeId: string): Promise<unknown> =>
  http.post(apiUrls.follows(), {followee_id: followeeId});

/** 取消关注（关注者由服务端从令牌取，路径里只带被关注者） */
export const unfollow = (followeeId: string): Promise<unknown> => http.del(apiUrls.deleteFollow(followeeId));

/** 搜索用户 */
export const searchAccounts = (keyword: string, offset = 0, limit = 20): Promise<IPage<IAccount>> =>
  http.get(apiUrls.searchAccount(keyword), {data: {offset, limit}});

/** 关注列表（正在关注谁，offset 分页） */
export const fetchFollowees = (accountId: string, page = 1, size = 20): Promise<IPage<IAccount>> =>
  http.get(apiUrls.followees(accountId), {data: {page, size}});

/** 粉丝列表（谁关注了他，offset 分页） */
export const fetchFollowers = (accountId: string, page = 1, size = 20): Promise<IPage<IAccount>> =>
  http.get(apiUrls.followers(accountId), {data: {page, size}});

// ------------------------------ 帖子 ------------------------------

/**
 * 首页信息流（游标分页）
 * @param cursor 上一页最后一条的 post_id，首页传 null
 */
export const fetchPosts = (cursor: string | null = null, limit = 10): Promise<IPage<IPost>> =>
  http.get(apiUrls.posts(), {data: {limit, ...(cursor ? {cursor} : {})}});

/** 最新 10 条（轮询 / 下拉刷新用） */
export const fetchLatestPosts = (): Promise<IPage<IPost>> => http.get(apiUrls.latestPosts());

/** 某用户的帖子 */
export const fetchAccountPosts = (accountId: string, cursor: string | null = null, limit = 10): Promise<IPage<IPost>> =>
  http.get(apiUrls.accountPosts(accountId), {data: {limit, ...(cursor ? {cursor} : {})}});

/** 单条帖子（分享链接进入） */
export const fetchPost = (postId: string): Promise<IPost> => http.get(apiUrls.post(postId));

/** 通过分享 id 取帖子 */
export const fetchSharedPost = (postId: string): Promise<IPost> => http.get(apiUrls.sharePost(postId));

/** 发帖 */
export const publishPost = (payload: Record<string, unknown>): Promise<IPost> =>
  http.post<IPost>(apiUrls.posts(), payload, {hideError: true});

/** 删除自己的帖子 */
export const deletePost = (postId: string): Promise<unknown> => http.del(apiUrls.post(postId));

/**
 * 搜索帖子（content 文本模糊匹配，未命中返回空列表）
 * @param offset 分页偏移量（触底加载下一页时递增）
 */
export const searchPosts = (keyword: string, offset = 0, limit = 20): Promise<IPage<IPost>> =>
  http.get(apiUrls.searchPost(keyword), {data: {offset, limit}, hideError: true});

/**
 * 热门帖子（免登录）
 *
 * 最近 7 天的公开帖按点赞数倒序，只返回有过点赞的内容；
 * 发现页/搜索页的「热门内容」数据源。
 *
 * @param offset 分页偏移量（发现页「换一批」时递增）
 */
export const fetchHotPosts = (limit = 5, offset = 0): Promise<IPage<IPost>> =>
  http.get(apiUrls.hotPosts(), {data: {limit, days: 7, offset}, hideError: true});

// ------------------------------ 评论 / 点赞 ------------------------------

/** 帖子评论列表 */
export const fetchComments = (postId: string): Promise<IComment[] | IPage<IComment>> =>
  http.get(apiUrls.comments(postId));

/** 视频评论列表（target_type=2, cursor 为上一页最旧一条的 comment_id, 游标分页） */
export const fetchVideoComments = (videoId: string, cursor: string | null = null, limit = 20): Promise<IComment[] | IPage<IComment>> =>
  http.get(apiUrls.commentsFor(COMMENT_TARGET_VIDEO, videoId), {data: {limit, ...(cursor ? {cursor} : {})}, hideError: true});

/** 发评论（评论人由服务端从令牌取） */
export const createComment = (postId: string, content: string): Promise<IComment> =>
  http.post<IComment>(apiUrls.createComment(), {
    content,
    target_id: postId,
    target_type: COMMENT_TARGET_POST,
  }, {hideError: true});

/** 发视频评论 */
export const createVideoComment = (videoId: string, content: string): Promise<IComment> =>
  http.post<IComment>(apiUrls.createComment(), {
    content,
    target_id: videoId,
    target_type: COMMENT_TARGET_VIDEO,
  }, {hideError: true});

/** 删除评论（视频/帖子共用） */
export const deleteVideoComment = (commentId: string): Promise<unknown> =>
  http.del(apiUrls.deleteComment(commentId));

/** 点赞状态 */
export const fetchLikeState = (postId: string): Promise<ILikeState> => http.get(apiUrls.likeCount(postId));

/** 点赞（点赞人由服务端从令牌取） */
export const likePost = (postId: string): Promise<unknown> =>
  http.post(apiUrls.likes(), {target_id: postId, target_type: COMMENT_TARGET_POST});

/** 取消点赞 */
export const unlikePost = (postId: string): Promise<unknown> => http.del(apiUrls.deleteLike(postId));

/** 某用户点赞过的帖子（抖音主页「喜欢」标签） */
export const fetchLikedPosts = (accountId: string, cursor: string | null = null, limit = 12): Promise<IPage<IPost>> =>
  http.get(apiUrls.likedPosts(accountId), {data: {limit, ...(cursor ? {cursor} : {})}});

// ------------------------------ 收藏 / 关注流 ------------------------------

/** 收藏状态（count + is_favorited） */
export const fetchFavoriteState = (postId: string): Promise<IFavoriteState> => http.get(apiUrls.favoriteCount(postId));

/** 收藏（收藏人由服务端从令牌取） */
export const favoritePost = (postId: string): Promise<unknown> =>
  http.post(apiUrls.favorites(), {target_id: postId, target_type: COMMENT_TARGET_POST});

/** 取消收藏 */
export const unfavoritePost = (postId: string): Promise<unknown> => http.del(apiUrls.deleteFavorite(postId));

/** 某用户收藏过的帖子（收藏夹，非本人只返回公开部分） */
export const fetchFavoritedPosts = (accountId: string, cursor: string | null = null, limit = 12): Promise<IPage<IPost>> =>
  http.get(apiUrls.favoritedPosts(accountId), {data: {limit, ...(cursor ? {cursor} : {})}});

/** 关注流：关注对象的公开帖 + 自己的帖子（需登录） */
export const fetchFollowPosts = (cursor: string | null = null, limit = 10): Promise<IPage<IPost>> =>
  http.get(apiUrls.followPosts(), {data: {limit, ...(cursor ? {cursor} : {})}});

// ------------------------------ 视频互动 ------------------------------

/** 视频点赞（target_type=2，点赞人由服务端从令牌取） */
export const likeVideo = (videoId: string): Promise<unknown> =>
  http.post(apiUrls.likes(), {target_id: videoId, target_type: COMMENT_TARGET_VIDEO});

/** 取消视频点赞 */
export const unlikeVideo = (videoId: string): Promise<unknown> =>
  http.del(`${apiUrls.deleteLike(videoId)}?target_type=${COMMENT_TARGET_VIDEO}`);

/** 视频点赞状态（count + is_liked） */
export const fetchVideoLikeState = (videoId: string): Promise<ILikeState> =>
  http.get(apiUrls.likeCount(videoId), {data: {target_type: COMMENT_TARGET_VIDEO}});

/** 收藏视频（target_type=2） */
export const favoriteVideo = (videoId: string): Promise<unknown> =>
  http.post(apiUrls.favorites(), {target_id: videoId, target_type: COMMENT_TARGET_VIDEO});

/** 取消收藏视频 */
export const unfavoriteVideo = (videoId: string): Promise<unknown> =>
  http.del(`${apiUrls.deleteFavorite(videoId)}?target_type=${COMMENT_TARGET_VIDEO}`);

/** 视频收藏状态（count + is_favorited） */
export const fetchVideoFavoriteState = (videoId: string): Promise<IFavoriteState> =>
  http.get(apiUrls.favoriteCount(videoId), {data: {target_type: COMMENT_TARGET_VIDEO}});

/** 视频关注流（关注对象 + 自己的视频，需登录） */
export const fetchFollowVideoFeed = (
  cursor: string | null = null,
  feedId: string | null = null,
  limit = 6,
): Promise<IVideoFeedPage> =>
  http.get<IVideoFeedPage>(apiUrls.followVideoFeed(), {
    data: {
      limit,
      ...(cursor ? {cursor} : {}),
      ...(feedId ? {feed_id: feedId} : {}),
    },
    hideError: true,
  });

// ------------------------------ 天亮即焚 ------------------------------

/** 最新心事（轮询用，服务端按本地窗口过滤） */
export const fetchLatestSnaps = (): Promise<IPage<ISnap>> => http.get(apiUrls.latestSnaps());

/** 分页拉取（后端用 offset 而不是游标） */
export const fetchSnaps = (offset = 0, limit = 10): Promise<IPage<ISnap>> =>
  http.get(apiUrls.snaps(), {data: {limit, offset}});

/** 发布心事 */
export const publishSnap = (payload: Record<string, unknown>): Promise<ISnap> =>
  http.post<ISnap>(apiUrls.snaps(), payload, {hideError: true});

/** 给心事点赞 */
export const likeSnap = (id: number): Promise<{like_count?: number}> => http.post(apiUrls.likeSnap(id));

// ------------------------------ 视频 ------------------------------

/**
 * 视频推荐流（游标分页，免登录）
 *
 * 后端 `/videos/feed/` 挂在公开路由组，未登录也能拉；
 * 带着令牌请求时 interaction 会反映当前用户的互动状态（后端当前仍是占位值）。
 *
 * @param cursor  上一页返回的 next_cursor，首页传 null
 * @param feedId  本次浏览的会话 ID（首页传 null，后续页沿用第一页返回的 feed_id）
 * @param limit   每页条数，后端限制 1~20
 */
export const fetchVideoFeed = (
  cursor: string | null = null,
  feedId: string | null = null,
  limit = 6,
): Promise<IVideoFeedPage> =>
  http.get<IVideoFeedPage>(apiUrls.videoFeed(), {
    data: {
      limit,
      ...(cursor ? {cursor} : {}),
      ...(feedId ? {feed_id: feedId} : {}),
    },
    // 视频页自己展示"加载失败/重试"，不需要全局 toast
    hideError: true,
  });

/** 我的视频列表（含转码状态，按时间倒序，offset 翻页） */
export const fetchMyVideos = (offset = 0, limit = 12): Promise<IMyVideo[]> =>
  http.get(apiUrls.mineVideos(), {data: {offset, limit}, hideError: true});

/**
 * 上传视频（multipart/form-data, uni.uploadFile）
 *
 * 后端 POST /videos/upload/ 可选认证 —— 未登录上传的视频 account_id 为 NULL,
 * 建议调用方先确认登录态。onProgress 回调 0~100。
 */
export const uploadVideoFile = (filePath: string, title: string, onProgress?: (percent: number) => void): Promise<IMyVideo> =>
  new Promise((resolve, reject) => {
    const token = getToken();
    const task = uni.uploadFile({
      url: `${getApiBaseUrl()}/videos/upload/`,
      filePath,
      name: 'file',
      formData: title ? {title} : {},
      header: {
        Authorization: token.access_token ? `Bearer ${token.access_token}` : '',
        'X-Timezone': getLocalTimeZone(),
      },
      timeout: 600000,
      success: (res) => {
        try {
          const body = JSON.parse(res.data || '{}');
          if (res.statusCode === 201 || (res.statusCode >= 200 && res.statusCode < 300)) {
            resolve(body as IMyVideo);
            return;
          }
          reject(Object.assign(new Error(body?.detail || '上传失败'), {detail: body?.detail || '上传失败'}));
        } catch {
          reject(Object.assign(new Error('上传返回格式异常'), {detail: '上传返回格式异常'}));
        }
      },
      fail: () => reject(Object.assign(new Error('上传失败，请检查网络'), {detail: '上传失败，请检查网络'})),
    });
    task.onProgressUpdate((res) => onProgress?.(res.progress));
  });

// ------------------------------ 其它 ------------------------------

/** 系统公告 */
export const fetchNotices = (): Promise<IPage<unknown>> => http.get(apiUrls.notices());

/** 我的通知（notice_type: 0系统/1点赞/2评论/3关注/4提及，不传返回全部） */
export const fetchMyNotices = (accountId: string, page = 1, size = 20, noticeType?: number): Promise<IPage<INotice>> =>
  http.get(apiUrls.myNotices(accountId), {data: {page, size, ...(noticeType === undefined ? {} : {notice_type: noticeType})}});

/** 未读通知数 */
export const fetchUnreadCount = (accountId: string): Promise<{count: number}> =>
  http.get(apiUrls.unreadCount(accountId), {hideError: true});

/** 批量标记已读（ids 为空表示全部） */
export const markNoticesRead = (ids?: number[]): Promise<{marked: number}> =>
  http.put(apiUrls.markNoticesRead(), {ids: ids ?? null} as Record<string, unknown>);

/** 上传图片，返回相对路径（展示时用 imageUrl 拼 CDN） */
export const upload = uploadImage;

/** 保存草稿用的过期时间（7 天） */
export const DRAFT_TTL = 7 * 24 * 3600 * 1000;
