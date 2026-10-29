/**
 * 统一请求层（uni.request 封装）
 *
 * 职责与 Web 端 axios 实例一一对应：
 * 1. 动态 baseURL（用户可在设置里改服务器地址，改完后续请求立即生效）
 * 2. 自动注入 `Authorization: Bearer <access_token>`
 * 3. 自动注入 `X-Timezone`（IANA 名）——「天亮即焚」的 23:00~06:00 窗口按用户本地时间算，
 *    不带头的话服务端会退回业务时区，出国用户会看到"页面显示开放、接口返回空"
 * 4. 401 静默刷新 token 并重放请求（含并发请求排队）
 * 5. 统一错误提示，单个请求可 `hideError` 关闭
 *
 * 为什么不用 axios：小程序 / App 端没有 XMLHttpRequest，axios 只能靠 adapter 兜，
 * 体积大还会在 App 端踩跨域与证书配置的坑。`uni.request` 是各端唯一官方通道。
 */
import {getApiBaseUrl} from '@/config';
import {getLocalTimeZone} from '@/utils/datetime';
import {clearToken, getAccountId, getToken, updateAccessToken} from '@/utils/token';

/** 请求方法 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** 业务错误：保留 HTTP 状态码与后端 detail，页面可自行判断 */
export interface ApiError extends Error {
  status?: number;
  detail?: string;
}

export interface RequestOptions {
  method?: HttpMethod;
  data?: Record<string, any> | string;
  /** 额外请求头 */
  header?: Record<string, string>;
  /** 是否携带 Authorization，默认 true */
  auth?: boolean;
  /** 失败时不弹全局提示（页面自己处理），默认 false */
  hideError?: boolean;
  /** 以 application/x-www-form-urlencoded 提交（登录接口需要） */
  form?: boolean;
  /** 超时毫秒，默认 15s */
  timeout?: number;
}

/** 登录页路径（多处复用，避免写错） */
export const LOGIN_PAGE = '/pages/login/login';

/** 默认超时 */
const DEFAULT_TIMEOUT = 15000;

// ------------------------- 401 刷新：并发排队 -------------------------
/** 是否正在刷新 token */
let isRefreshing = false;
/** 刷新期间挂起的请求：刷新成功用新 token 重放，失败统一 reject */
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (reason: unknown) => void;
}> = [];

/** 判断是否为刷新令牌请求（避免刷新失败再次触发刷新，形成递归） */
const isRefreshUrl = (url: string): boolean => url.includes('/oauth/refresh-token/');

/** 当前是否已经停在登录页（避免重复 reLaunch 导致页面栈抖动） */
function isOnLoginPage(): boolean {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  return !!current && `/${current.route}` === LOGIN_PAGE;
}

/**
 * 跳登录页
 *
 * 用 reLaunch 而不是 navigateTo：登录后不该还能"返回"到需要鉴权的页面，
 * 否则用户会看到一屏空数据 + 一连串 401。
 */
export function redirectToLogin(): void {
  if (isOnLoginPage()) return;
  uni.reLaunch({url: LOGIN_PAGE});
}

/** 统一提示（icon: none 才能显示长文案） */
export function toast(title: string): void {
  uni.showToast({title, icon: 'none', duration: 2000});
}

/** 根据状态码给出人话文案 */
function messageForStatus(status: number, detail?: string): string {
  switch (status) {
    case 400:
      return detail || '请求参数有误';
    case 403:
      return '登录过期，权限不足，请重新登录';
    case 404:
      return detail || '内容不存在';
    case 408:
      return '请求超时，请重试';
    case 500:
      return '服务器错误，请稍后重试';
    case 502:
    case 503:
      return '服务暂时不可用，请稍后重试';
    case 504:
      return '网络超时，请稍后重试';
    default:
      return detail || `请求失败[${status}]`;
  }
}

/** 组装请求头 */
function buildHeader(options: RequestOptions): Record<string, string> {
  const header: Record<string, string> = {
    Accept: 'application/json',
    'X-Timezone': getLocalTimeZone(),
    ...(options.header || {}),
  };
  header['Content-Type'] = options.form
    ? 'application/x-www-form-urlencoded'
    : 'application/json;charset=UTF-8';

  // auth 默认开启：未登录时 token 为空串，不注入头即可
  if (options.auth !== false) {
    const token = getToken();
    if (token.access_token) {
      header.Authorization = `Bearer ${token.access_token}`;
    }
  }
  return header;
}

/** 把 data 编码成表单串（登录接口用） */
function encodeForm(data?: Record<string, any> | string): string {
  if (!data) return '';
  if (typeof data === 'string') return data;
  return Object.keys(data)
    .filter((key) => data[key] !== undefined && data[key] !== null)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(data[key]))}`)
    .join('&');
}

/** 发起一次原始请求（不处理 401，供刷新逻辑复用） */
function send<T>(
  url: string,
  options: RequestOptions,
  accessToken?: string,
): Promise<{statusCode: number; data: T}> {
  const header = buildHeader(options);
  if (accessToken) header.Authorization = `Bearer ${accessToken}`;
  const data = options.form ? encodeForm(options.data) : options.data;

  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: (options.method || 'GET') as UniApp.RequestOptions['method'],
      data: data as UniApp.RequestOptions['data'],
      header,
      timeout: options.timeout || DEFAULT_TIMEOUT,
      success: (res) => resolve({statusCode: res.statusCode, data: res.data as T}),
      fail: (err) => {
        const error: ApiError = new Error(err?.errMsg || '网络连接失败');
        error.detail = '网络连接失败，请检查网络';
        reject(error);
      },
    });
  });
}

/**
 * 刷新 access_token
 *
 * 走裸请求（不经 send 的 401 分支），但必须带超时：
 * 请求挂住时 isRefreshing 会一直是 true，队列里的所有请求一起永久悬挂。
 */
async function refreshAccessToken(): Promise<string> {
  const token = getToken();
  const accountId = getAccountId();
  const base = getApiBaseUrl();
  const url = `${base}/oauth/refresh-token/${encodeURIComponent(accountId)}/refresh_token/`;

  const res = await send<{access_token: string}>(url, {method: 'GET', auth: false, header: {
    Authorization: `Bearer ${token.refresh_token}`,
  }});

  const accessToken = res.data?.access_token;
  if (!accessToken) throw new Error('刷新令牌失败');

  updateAccessToken(accessToken);
  return accessToken;
}

/**
 * 处理 401
 *
 * 返回新的 access_token，供调用方重放请求；
 * 无法刷新时抛错（调用方负责终止链路）。
 */
async function handleUnauthorized<T>(url: string, options: RequestOptions): Promise<string> {
  // 刷新接口本身 401：refresh_token 已失效，只能重新登录
  if (isRefreshUrl(url)) throw new Error('登录已过期');

  const token = getToken();
  if (!token.refresh_token) throw new Error('未登录');

  // 已在刷新中：排队等待结果
  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      pendingQueue.push({resolve, reject});
    });
  }

  isRefreshing = true;
  try {
    const fresh = await refreshAccessToken();
    const queue = pendingQueue;
    pendingQueue = [];
    queue.forEach((item) => item.resolve(fresh));
    return fresh;
  } catch (error) {
    const queue = pendingQueue;
    pendingQueue = [];
    queue.forEach((item) => item.reject(error));
    // 刷新失败 = 凭证彻底失效：清本地令牌 + 通知 store 同步 + 回登录页
    clearToken();
    // 通知 App.vue 清掉内存态，否则页面还显示着上一个账号的昵称/头像
    uni.$emit('auth:expired');
    redirectToLogin();
    throw error;
  } finally {
    isRefreshing = false;
  }
}

/**
 * 发起业务请求
 *
 * @param path 以 `/` 开头的接口路径，如 `/posts/`
 * @param options 请求配置
 * @returns 直接返回响应体（不是 uni 的 res 包装），调用方拿到的就是业务数据
 */
export async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = /^https?:\/\//i.test(path) ? path : `${getApiBaseUrl()}${path}`;

  try {
    const res = await send<T>(url, options);

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data;
    }

    if (res.statusCode === 401) {
      // 未登录场景（登录页输错密码）：不刷新、不跳转，直接把错误交给调用方
      if (options.auth === false || !getToken().refresh_token) {
        throw buildError(401, res.data);
      }
      const freshToken = await handleUnauthorized<T>(url, options);
      // 用新 token 重放原请求（只重放一次，避免刷新成功但接口仍 401 时死循环）
      const retry = await send<T>(url, options, freshToken);
      if (retry.statusCode >= 200 && retry.statusCode < 300) return retry.data;
      throw buildError(retry.statusCode, retry.data);
    }

    throw buildError(res.statusCode, res.data);
  } catch (error) {
    const apiError = normalizeError(error);
    // hideError 的请求由页面自行提示（如表单校验类接口）
    if (!options.hideError) {
      toast(messageForStatus(apiError.status ?? 0, apiError.detail));
    }
    throw apiError;
  }
}

/** 从响应体里提取 detail（后端 FastAPI 风格 `{detail: "..."}`） */
function buildError(status: number, body: any): ApiError {
  const detail =
    typeof body === 'string' ? body : body?.detail || body?.message || body?.error || undefined;
  const error: ApiError = new Error(detail || `HTTP ${status}`);
  error.status = status;
  error.detail = Array.isArray(detail) ? detail.map((item: any) => item?.msg || '').join('；') : detail;
  return error;
}

/** 统一成 ApiError 形状，网络失败也带 detail */
function normalizeError(error: unknown): ApiError {
  if (error instanceof Error) {
    const apiError = error as ApiError;
    if (!apiError.detail) apiError.detail = apiError.message;
    return apiError;
  }
  const fallback: ApiError = new Error('请求失败');
  fallback.detail = '请求失败';
  return fallback;
}

/** 便捷方法 */
export const http = {
  get: <T = any>(path: string, options: RequestOptions = {}) => request<T>(path, {...options, method: 'GET'}),
  post: <T = any>(path: string, data?: Record<string, any> | string, options: RequestOptions = {}) =>
    request<T>(path, {...options, method: 'POST', data}),
  put: <T = any>(path: string, data?: Record<string, any>, options: RequestOptions = {}) =>
    request<T>(path, {...options, method: 'PUT', data}),
  patch: <T = any>(path: string, data?: Record<string, any>, options: RequestOptions = {}) =>
    request<T>(path, {...options, method: 'PATCH', data}),
  del: <T = any>(path: string, options: RequestOptions = {}) => request<T>(path, {...options, method: 'DELETE'}),
};

/**
 * 上传单张图片
 *
 * 后端字段名是 `file`，返回 `{url: "/media/xxx.png"}`（相对路径，展示时要拼 CDN）。
 * 小程序端必须用 `uni.uploadFile`，不能用 request 传 FormData。
 */
export function uploadImage(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const token = getToken();
    uni.uploadFile({
      url: `${getApiBaseUrl()}/upload/image/`,
      filePath,
      name: 'file',
      header: {
        Authorization: token.access_token ? `Bearer ${token.access_token}` : '',
        'X-Timezone': getLocalTimeZone(),
      },
      success: (res) => {
        try {
          const body = JSON.parse(res.data || '{}');
          const url = body?.url || body?.data?.url;
          if (res.statusCode >= 200 && res.statusCode < 300 && url) {
            resolve(url);
            return;
          }
          reject(Object.assign(new Error(body?.detail || '上传失败'), {detail: body?.detail || '上传失败'}));
        } catch {
          reject(Object.assign(new Error('上传返回格式异常'), {detail: '上传返回格式异常'}));
        }
      },
      fail: () => reject(Object.assign(new Error('上传失败，请检查网络'), {detail: '上传失败，请检查网络'})),
    });
  });
}
