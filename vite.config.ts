import {defineConfig} from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

/**
 * uni-app 构建配置
 *
 * 说明：
 * - `uni()` 插件负责按平台（h5 / mp-weixin / app）改写入口与样式单位，
 *   因此**不要**再自己加 @vitejs/plugin-vue，插件内部已包含。
 * - 构建产物目录由 uni 决定：dist/build/{h5,mp-weixin,app}、dist/dev/{...}
 * - 接口地址走 .env.* 的 VITE_APP_API_BASE_URL，打包时静态注入（见 src/config）。
 */
export default defineConfig({
  plugins: [uni()],
  server: {
    // 手机同 WiFi 调试时用局域网 IP 访问；host: true 才会监听 0.0.0.0
    host: true,
    port: 5174,
  },
  build: {
    // H5 产物较大时关闭 sourcemap，避免 dist 体积翻倍
    sourcemap: false,
  },
});
