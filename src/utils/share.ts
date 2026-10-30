import {config} from '@/config';

/** 扫码结果分类 */
export interface QrTarget {
  type: 'user' | 'url' | 'text';
  /** type=user 时的账号 ID */
  id?: string;
  /** type=url 时的链接 */
  url?: string;
  /** 原始内容 */
  text: string;
}

/**
 * 生成「个人主页」深链
 *
 * H5 端直接用当前 origin 最稳（部署域名可能和配置不一致）；
 * 小程序 / App 端没有浏览器 location，回退到配置的站点域名。
 */
export function buildUserQrUrl(accountId: string): string {
  let origin = config.APP_BASE_URL;
  // #ifdef H5
  if (window.location?.origin) origin = window.location.origin;
  // #endif
  return `${origin}/user/${accountId}`;
}

/**
 * 解析扫码结果
 *
 * 1. 推文个人主页深链（.../user/{id}）→ 跳端内主页
 * 2. 普通 http(s) 链接 → 复制并提示
 * 3. 其它文本 → 复制并提示
 */
export function parseQrTarget(raw: string): QrTarget {
  const text = (raw || '').trim();
  const m = text.match(/\/user\/([A-Za-z0-9\-_]+)/);
  if (m) return {type: 'user', id: m[1], text};
  if (/^https?:\/\//i.test(text)) return {type: 'url', url: text, text};
  return {type: 'text', text};
}
