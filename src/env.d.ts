/// <reference types="vite/client" />
/// <reference types="@dcloudio/types" />

/**
 * 环境变量类型声明
 *
 * uni-app 的 Vite 构建只把 `VITE_` 前缀的变量注入到客户端，
 * 且注入值**全部是字符串**（"False" 也是 truthy），下游要显式解析布尔值。
 */
interface ImportMetaEnv {
  readonly VITE_APP_API_BASE_URL: string;
  readonly VITE_APP_BASE_URL_APP: string;
  readonly VITE_APP_IS_DEBUG: string;
  readonly VITE_APP_TURNSTILE_SITE_KEY: string;
  readonly VITE_CDN_BASE_URL: string;
  readonly VITE_MAIL_SUFFIX: string;
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type {DefineComponent} from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
