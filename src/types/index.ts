/**
 * 业务实体类型
 *
 * 约定：字段名与后端返回**完全一致**（下划线风格），不做驼峰转换。
 * 后端契约以 openapi.json 为准，改名时这里同步。
 */

/** 帖子内容：正文 + 图片（图片后端既有逗号分隔串，也有数组两种形态） */
export interface IContent {
  text?: string;
  images?: string | string[];
  [key: string]: unknown;
}

/** 推文 */
export interface IPost {
  post_id: string;
  account_id: string;
  content: IContent;
  /** 内容类型：1 普通 */
  post_type: number;
  /** 来源设备 */
  from_device: number;
  /** 可见范围：0 公开 */
  right_status: number;
  is_top?: boolean | null;
  created_at: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** 账户资料 */
export interface IAccount {
  account_id: string;
  username?: string;
  nickname?: string;
  birthday?: string;
  area_code?: string;
  /** 0 未知 / 1 男 / 2 女 / 9 未说明 */
  sex?: number | null;
  avatar?: string;
  bio?: string;
  mail?: string;
  mobile?: string;
  is_active?: boolean;
  /** 关注统计与是否已关注（由 `/follows/{id}/count/` 单独返回，前端合并进资料） */
  follow?: IFollow;
  [key: string]: unknown;
}

/** 评论 */
export interface IComment {
  comment_id: string;
  is_root?: boolean;
  parent_id?: string | null;
  content: string;
  account_id: string;
  /** 评论者昵称（后端可能不回传，缺省按"匿名"显示） */
  nickname?: string | null;
  target_id: string;
  target_type: number;
  created_at?: string | null;
}

/** 点赞状态 */
export interface ILikeState {
  count: number;
  is_liked: boolean;
}

/** 收藏状态（与点赞同构，字段名为 is_favorited） */
export interface IFavoriteState {
  count: number;
  is_favorited: boolean;
}

/** 关注统计 */
export interface IFollow {
  follower_count: number;
  followee_count: number;
  is_following: boolean;
}

/** 天亮即焚的一条心事 */
export interface ISnap {
  id: number;
  alias_name: string;
  content?: {text?: string} | null;
  /** 情绪标签编号 */
  emotion?: number;
  topic?: string | null;
  like_count: number;
  is_top?: boolean;
  created_at: string;
}

/** 视频作者（推荐流只透出必要展示字段） */
export interface IVideoAuthor {
  account_id: string;
  nickname?: string | null;
  avatar_url?: string | null;
}

/**
 * 视频互动统计
 *
 * 后端当前未接入真实计数（VideoStats 注释即"占位默认值"），字段会返回 0；
 * 页面因此不展示点赞/评论数字，避免显示一排假的 0。
 */
export interface IVideoStats {
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
}

/** 推荐流单条视频 */
export interface IVideoItem {
  video_id: string;
  poster_url?: string | null;
  /** master playlist（m3u8），播放器据此自适应码率 */
  play_url: string;
  width?: number | null;
  height?: number | null;
  /** 时长（秒） */
  duration?: number | null;
  /** 0 未知 / 1 横屏 / 2 竖屏 */
  orientation?: number | null;
  title?: string | null;
  description?: string | null;
  author?: IVideoAuthor | null;
  stats?: IVideoStats;
  interaction?: {liked?: boolean; collected?: boolean; followed?: boolean};
}

/** 推荐流分页（游标分页，next_cursor 为空即到底） */
export interface IVideoFeedPage {
  feed_id: string;
  items: IVideoItem[];
  next_cursor?: string | null;
  has_more: boolean;
}

/** 通知 / 公告 */
export interface INotice {
  id: number;
  notice_type: number;
  title?: string | null;
  content: IContent;
  created_at: string;
}

/** 登录返回 */
export interface ILoginResult {
  access_token: string;
  refresh_token: string;
  account_id: string;
  expires_in?: number;
}

/** 列表分页（后端 posts/snaps 统一返回 items + total） */
export interface IPage<T> {
  items: T[];
  total?: number;
}

/** 发帖草稿 */
export interface IPostDraft {
  text: string;
  images: string[];
  /** 本地时间戳，用于过期校验 */
  createTime: number;
}
