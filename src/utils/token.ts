/**
 * 令牌存储（独立的轻量模块）
 *
 * 为什么不直接放在 pinia store 里：
 * 请求层（src/api/request.ts）需要读写 token，而 store 又依赖请求层，
 * 互相 import 会形成循环依赖——表现为"某端启动时报 undefined"，
 * 且只在特定打包顺序下复现。这里让 token 只依赖 storage，切断环。
 *
 * store 负责「业务可读的响应式状态」，token 模块负责「持久化的真值」，
 * 两者在登录/刷新/登出时同步一次即可。
 */
import {getItem, removeItem, setItem} from '@/utils/storage';

export interface IToken {
  access_token: string;
  refresh_token: string;
}

const TOKEN_KEY = 'tw_token';
const ACCOUNT_ID_KEY = 'tw_account_id';

/** 内存缓存：避免每个请求都读一次 storage（小程序 storage 是同步 IO） */
let cache: IToken | null = null;
let accountIdCache: string | null = null;

/** 取令牌（永不为 null，未登录时字段为空串） */
export function getToken(): IToken {
  if (!cache) {
    cache = getItem<IToken>(TOKEN_KEY, {access_token: '', refresh_token: ''});
  }
  return cache;
}

/** 覆盖写入令牌 */
export function setToken(token: IToken): void {
  cache = {access_token: token.access_token || '', refresh_token: token.refresh_token || ''};
  setItem(TOKEN_KEY, cache);
}

/** 只更新 access_token（刷新令牌后调用） */
export function updateAccessToken(accessToken: string): void {
  setToken({...getToken(), access_token: accessToken});
}

/** 取当前登录账号 ID（刷新令牌的接口路径需要它） */
export function getAccountId(): string {
  if (accountIdCache === null) {
    accountIdCache = getItem<string>(ACCOUNT_ID_KEY, '');
  }
  return accountIdCache;
}

/** 写入当前登录账号 ID */
export function setAccountId(accountId: string): void {
  accountIdCache = accountId || '';
  if (accountIdCache) {
    setItem(ACCOUNT_ID_KEY, accountIdCache);
  } else {
    removeItem(ACCOUNT_ID_KEY);
  }
}

/** 是否已登录 */
export function isLoggedIn(): boolean {
  const token = getToken();
  return !!token.access_token || !!token.refresh_token;
}

/** 清空令牌与账号 ID */
export function clearToken(): void {
  cache = {access_token: '', refresh_token: ''};
  accountIdCache = '';
  removeItem(TOKEN_KEY);
  removeItem(ACCOUNT_ID_KEY);
}
