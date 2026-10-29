/**
 * 账号状态库
 *
 * 职责划分：
 * - `utils/token.ts` 是令牌的持久化真值（请求层直接读它，绕开 pinia，避免循环依赖）
 * - 本 store 是「组件可读的响应式视图」+ 用户资料缓存
 * 登录 / 登出 / 401 强制下线时两边同步一次。
 */
import {defineStore} from 'pinia';
import {computed, ref} from 'vue';
import * as api from '@/api';
import type {IAccount, IFollow, ILoginResult, IPost} from '@/types';
import {clearToken, getToken, setAccountId, setToken} from '@/utils/token';
import {getItem, removeItem, setItem} from '@/utils/storage';
import {compareTimeDesc} from '@/utils/datetime';

/** 资料持久化键 */
const ACCOUNT_KEY = 'tw_account';

/** 首页信息流状态库 */
export const usePostStore = defineStore('posts', () => {
  const posts = ref<IPost[]>([]);

  /** 批量追加：按 post_id 去重后按时间倒序（同一条保留最新一次出现的数据） */
  const addPosts = (items: IPost[]) => {
    const map = new Map<string, IPost>();
    [...posts.value, ...items].forEach((item) => map.set(item.post_id, item));
    posts.value = Array.from(map.values()).sort((a, b) => compareTimeDesc(a.created_at, b.created_at));
  };

  /** 单条追加（发布成功后立即上屏） */
  const addPost = (item: IPost) => addPosts([item]);

  /** 删除 */
  const removePost = (postId: string) => {
    posts.value = posts.value.filter((item) => item.post_id !== postId);
  };

  /** 清空（下拉刷新 / 退出登录） */
  const reset = () => {
    posts.value = [];
  };

  return {posts, addPosts, addPost, removePost, reset};
});

export const useAccountStore = defineStore('account', () => {
  /** 当前登录用户资料 */
  const account = ref<IAccount>(getItem<IAccount>(ACCOUNT_KEY, {account_id: ''}));

  /** 令牌视图（真值在 utils/token） */
  const token = ref(getToken());

  /** 是否已登录：只要还有任一 token 就算（access 过期时靠 refresh 续） */
  const loggedIn = computed(() => !!token.value.access_token || !!token.value.refresh_token);

  /** 昵称兜底：没有昵称就用用户名，再没有就用"未命名" */
  const displayName = computed(() => account.value.nickname || account.value.username || '未命名');

  /** 写入资料（同时落盘） */
  const saveAccount = (data: IAccount) => {
    account.value = data;
    setItem(ACCOUNT_KEY, data);
  };

  /** 登录成功后同步令牌与账号 ID */
  const applyLogin = (result: ILoginResult) => {
    setToken({access_token: result.access_token, refresh_token: result.refresh_token});
    setAccountId(result.account_id);
    token.value = getToken();
  };

  /** 退出登录：清令牌、清资料、清缓存，回到未登录态 */
  const logout = () => {
    clearToken();
    removeItem(ACCOUNT_KEY);
    token.value = {access_token: '', refresh_token: ''};
    account.value = {account_id: ''};
  };

  /** 拉自己的资料；失败不抛（登录后预拉取失败不该影响主流程） */
  const loadSelf = async (accountId?: string): Promise<IAccount | null> => {
    const id = accountId || account.value.account_id;
    if (!id) return null;
    try {
      const data = await api.fetchAccount(id);
      saveAccount(data);
      return data;
    } catch {
      return null;
    }
  };

  return {account, token, loggedIn, displayName, saveAccount, applyLogin, logout, loadSelf};
});

/**
 * 用户资料缓存 + 关注操作
 *
 * 信息流里同一位作者会出现很多次，逐条请求资料既慢又会把后端打满。
 * 这里做两级去重：`accountMap` 命中即返回，`pendingMap` 让并发的同一请求只发一次。
 */
export const useUserCacheStore = defineStore('userCache', () => {
  const accountMap = ref<Record<string, IAccount>>({});
  /** 进行中的请求（刻意不放响应式：它不参与渲染，只是去重表） */
  const pendingMap = new Map<string, Promise<IAccount>>();

  const fetchUser = async (accountId: string): Promise<IAccount> => {
    if (!accountId) throw new Error('缺少 account_id');
    const cached = accountMap.value[accountId];
    // 缓存里可能只有资料没有 follow（列表场景），有 follow 才算完整
    if (cached && cached.follow) return cached;

    const pending = pendingMap.get(accountId);
    if (pending) return pending;

    const promise = (async () => {
      const [profile, follow] = await Promise.all([
        api.fetchAccount(accountId),
        api.fetchFollow(accountId).catch(() => null),
      ]);
      const merged: IAccount = {...profile, follow: follow || undefined};
      accountMap.value[accountId] = merged;
      return merged;
    })();

    pendingMap.set(accountId, promise);
    promise
      .finally(() => pendingMap.delete(accountId))
      // 单独挂一条 catch：调用方没写 catch 时不会抛 unhandled rejection
      .catch(() => undefined);

    return promise;
  };

  /** 同步写入（资料更新后覆盖缓存） */
  const setUser = (accountId: string, data: IAccount) => {
    if (!accountId) return;
    accountMap.value[accountId] = {...accountMap.value[accountId], ...data};
  };

  /**
   * 关注 / 取消关注
   *
   * 先请求成功再改本地状态（不做乐观更新）：关注按钮点错代价比点赞高，
   * 而且后端会把双方计数一起变，本地猜容易和后端对不上。
   */
  const toggleFollow = async (selfId: string, targetId: string) => {
    const target = accountMap.value[targetId];
    const follow = target?.follow as IFollow | undefined;
    if (!follow) throw new Error('用户信息未加载');

    if (follow.is_following) {
      await api.unfollow(targetId);
      follow.is_following = false;
      follow.follower_count = Math.max(0, (follow.follower_count || 0) - 1);
      const self = accountMap.value[selfId];
      if (self?.follow) self.follow.followee_count = Math.max(0, (self.follow.followee_count || 0) - 1);
    } else {
      await api.follow(targetId);
      follow.is_following = true;
      follow.follower_count = (follow.follower_count || 0) + 1;
      const self = accountMap.value[selfId];
      if (self?.follow) self.follow.followee_count = (self.follow.followee_count || 0) + 1;
    }
  };

  return {accountMap, fetchUser, setUser, toggleFollow};
});
