/**
 * 本地存储封装
 *
 * 为什么不直接用 `uni.getStorageSync`：
 * 1. 小程序对 `setStorageSync` 的 value 只接受可序列化数据，传 undefined / 函数会抛错；
 * 2. 存储可能被用户清理、被旧版本写坏（JSON 解析失败），读的时候必须兜住，
 *    否则启动阶段抛异常会直接白屏；
 * 3. Web 端用 localStorage，原生端用 plus.storage，这里统一成一套 API，
 *    业务代码不需要判断 `#ifdef`。
 */

/**
 * 读取并反序列化
 *
 * @param key 存储键
 * @param fallback 不存在或损坏时返回的默认值
 */
export function getItem<T>(key: string, fallback: T): T {
  try {
    const raw = uni.getStorageSync(key);
    if (raw === '' || raw === null || raw === undefined) return fallback;
    // uni 在部分平台会自动反序列化对象，这里两种形态都接受
    if (typeof raw === 'object') return raw as T;
    return JSON.parse(raw as string) as T;
  } catch {
    return fallback;
  }
}

/** 写入（序列化失败时静默放弃，不阻断主流程） */
export function setItem(key: string, value: unknown): void {
  try {
    uni.setStorageSync(key, JSON.stringify(value));
  } catch {
    // 存储已满或值不可序列化：忽略，纯内存态仍然可用
  }
}

/** 删除 */
export function removeItem(key: string): void {
  try {
    uni.removeStorageSync(key);
  } catch {
    // 忽略
  }
}
