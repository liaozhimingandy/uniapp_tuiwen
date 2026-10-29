/**
 * 全局运行时配置
 *
 * 取值顺序：本地自定义 > 环境变量 > 内置兜底
 * 本地自定义是给调试留的口子：App 端装到手机上后没法改 .env，
 * 但可能需要临时连内网测试环境（在「我的 → 服务器地址」里改）。
 */
import {getItem} from '@/utils/storage';

/** 用户自定义接口地址的存储键 */
export const CUSTOM_API_KEY = 'tw_custom_api';

/** 接口地址最终兜底值 */
const DEFAULT_API_BASE_URL = 'https://api.tuiwen.alsoapp.com';

/** 静态资源最终兜底值 */
const DEFAULT_CDN_BASE_URL = 'https://api.tuiwen.alsoapp.com';

/**
 * 解析布尔型环境变量
 *
 * Vite 注入的 `import.meta.env.*` 全是**字符串**，`"False"` 也是 truthy，
 * 直接 `|| false` 会让生产包里一直带着调试逻辑。
 */
function parseEnvBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

/** 去除末尾斜杠，避免拼出 `//posts/` 这种双斜杠路径 */
const trimSlash = (url: string): string => url.replace(/\/+$/, '');

/** 环境变量里的接口地址 */
const ENV_API_BASE_URL = trimSlash(String(import.meta.env.VITE_APP_API_BASE_URL || DEFAULT_API_BASE_URL));

/** 用户自定义地址（为空则返回空串） */
export function getCustomApiBaseUrl(): string {
  const custom = getItem<string>(CUSTOM_API_KEY, '');
  return typeof custom === 'string' ? trimSlash(custom.trim()) : '';
}

/** 保存自定义地址（传空串即恢复默认），返回是否保存成功 */
export function setCustomApiBaseUrl(url: string): void {
  const value = trimSlash(url.trim());
  if (value) {
    uni.setStorageSync(CUSTOM_API_KEY, JSON.stringify(value));
  } else {
    uni.removeStorageSync(CUSTOM_API_KEY);
  }
}

export const config = {
  /** 应用名 */
  NAME: '推文',

  /** 品牌色 */
  THEME_COLOR: '#027AFF',

  /** 页面底色 */
  BG_COLOR: '#F2F3F5',

  /** 当前生效的接口地址（运行期请用 getApiBaseUrl()） */
  API_BASE_URL: getCustomApiBaseUrl() || ENV_API_BASE_URL,

  /** 环境变量里的接口地址（不含自定义） */
  ENV_API_BASE_URL,

  /** 静态资源 / CDN 地址 */
  CDN_BASE_URL: trimSlash(String(import.meta.env.VITE_CDN_BASE_URL || DEFAULT_CDN_BASE_URL)),

  /** 站点地址，用于生成分享链接 */
  APP_BASE_URL: trimSlash(String(import.meta.env.VITE_APP_BASE_URL_APP || 'https://tuiwen.alsoapp.com')),

  /** 调试开关 */
  isDebug: parseEnvBoolean(import.meta.env.VITE_APP_IS_DEBUG, false),

  /** 注册时可选的邮箱后缀 */
  MAIL_SUFFIX: String(import.meta.env.VITE_MAIL_SUFFIX || '@qq.com,@163.com,@gmail.com').split(','),

  /** 客户端版本号 */
  VERSION: String(import.meta.env.VITE_APP_VERSION || '0.0.0'),
};

/**
 * 取当前生效的接口地址
 *
 * 每次请求都重新读：用户改了服务器地址后，后续请求立即生效，不用重启应用。
 */
export function getApiBaseUrl(): string {
  return getCustomApiBaseUrl() || config.ENV_API_BASE_URL;
}

/** 静态资源基地址: 用户自定义服务器地址(剥掉 /api/v2 前缀) > env CDN 配置 */
function getStaticBaseUrl(): string {
  const custom = getCustomApiBaseUrl();
  if (custom) {
    // 自定义地址约定为完整 API 前缀(含 /api/v2, 请求层直接拼路径),
    // 但后端静态文件挂载在根路径 /static(不在 /api/v2 下), 拼媒体地址前要剥掉
    return custom.replace(/\/api\/v\d+\/?$/, '');
  }
  return config.CDN_BASE_URL;
}

/** 把后端返回的相对路径拼成完整静态资源地址 */
export function staticLink(path?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = getStaticBaseUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
