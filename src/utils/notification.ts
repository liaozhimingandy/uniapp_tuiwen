/**
 * 通知偏好（本地存储）
 *
 * 当前没有接入推送后端，这里的开关是「端内通知」的本地配置：
 * - newContentAlert：首页轮询到新内容时是否浮出提示条（见 pages/index）
 * - systemNotice：发现页是否展示系统公告（见 pages/discover）
 * - interactionAlert / sound：互动提醒与提示音的本地偏好，预留给后端推送就绪后再联动
 */
import {getItem, setItem} from '@/utils/storage';

export interface NotificationSettings {
  /** 首页有新内容时提示 */
  newContentAlert: boolean;
  /** 评论 / 点赞 / 新粉丝等互动提醒（本地偏好，暂无后端推送） */
  interactionAlert: boolean;
  /** 发现页展示系统公告 */
  systemNotice: boolean;
  /** 通知提示音（本地偏好） */
  sound: boolean;
}

const KEY = 'tw_notification_settings';

const DEFAULTS: NotificationSettings = {
  newContentAlert: true,
  interactionAlert: true,
  systemNotice: true,
  sound: true,
};

/** 读取偏好（与默认值合并，兼容旧版本缺字段） */
export function getNotificationSettings(): NotificationSettings {
  return {...DEFAULTS, ...getItem<Partial<NotificationSettings>>(KEY, {})};
}

/** 写入偏好 */
export function setNotificationSettings(settings: NotificationSettings): void {
  setItem(KEY, settings);
}
