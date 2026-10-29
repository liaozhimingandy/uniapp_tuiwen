import {createSSRApp} from 'vue';
import {createPinia} from 'pinia';
import App from './App.vue';

/**
 * uni-app 入口
 *
 * 必须导出 `createApp` 工厂（各端由 uni 运行时调用），不能直接 `createApp(App).mount()`。
 */
export function createApp() {
  const app = createSSRApp(App);
  app.use(createPinia());
  return {app};
}
