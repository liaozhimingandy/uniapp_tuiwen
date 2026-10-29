# 推文 · 跨平台客户端（uni-app）

推文 App 的跨平台客户端，一套代码同时产出 **H5 / 微信小程序 / App（Android + iOS）**。

原 Web 端（`vue_tuiwen`）已回滚到引入移动端适配之前的版本，继续只做桌面 Web；
移动端与跨端需求全部收敛到本仓库，两边共享同一套后端接口与时间/时区口径。

---

## 为什么单独开一个工程

Web 端尝试过用「路由 meta + 固定顶栏/底栏」的方式在一套 SPA 里同时兼顾桌面与手机，
方向本身可行，但代价是：

- 每个页面都要加 `isMobile` 分支，模板结构被移动端诉求牵着走；
- 打包产物同时包含桌面与移动逻辑，首屏体积和心智负担都在涨；
- 要做小程序 / App 时完全复用不了 —— `<div>`、`window`、`localStorage`、`axios` 一个都不能用。

uni-app 的思路相反：**用跨端组件与 API 写一套页面**，由编译器输出各端产物。
代价是不能直接用 DOM/浏览器 API，换来的是三端同源代码。因此两个工程并存，
而不是互相改造。

---

## 技术栈与版本约束

| 项 | 版本 | 说明 |
| --- | --- | --- |
| uni-app | `3.0.0-5030320261023001` | **所有 `@dcloudio/*` 必须完全一致** |
| Vue | `3.4.21` | uni-app 的编译器锁定这个版本，不要单独升级 |
| Vite | `5.2.8` | `@dcloudio/vite-plugin-uni` 把 peer 依赖写死成这个版本 |
| TypeScript | `~5.4.5` | |
| Pinia | `2.1.7` | 2.2+ 要求 Vue ≥ 3.5，会与 uni-app 冲突 |

> ⚠️ **`@dcloudio/*` 各包的版本必须一字不差。**
> DCloud 的发布是分批的：`@dcloudio/uni-app` 的 `vue3` 标签可能已经指向新版本，
> 而 `@dcloudio/uni-app-vite` 还停在上一版，装到一半就报
> `No matching version found for @dcloudio/uni-app-vite@x.y.z`。
> 升级时的正确做法是先确认这 9 个包都发布了同一版本，再整体替换。

---

## 目录结构

```
src/
├── api/
│   ├── request.ts        请求层：baseURL 动态化、Bearer、X-Timezone、401 刷新排队
│   └── index.ts          接口地址表 + 业务封装（与 Web 端 api.ts 对齐）
├── components/
│   ├── PostCard.vue      信息流卡片（作者、正文摘要、九宫格、点赞/分享）
│   ├── ImageGrid.vue     一图大图 / 多图三列
│   ├── UserAvatar.vue    无头像时按昵称哈希生成彩色底 + 首字
│   └── LoadMore.vue      列表底部状态条
├── config/
│   ├── index.ts          运行时配置（接口地址可被用户覆盖，方便连内网）
│   └── constants.ts      情绪标签、可见范围、开放时段等契约常量
├── pages/
│   ├── index/index.vue           首页信息流（游标分页 + 新内容提示条）
│   ├── snap/snap.vue             天亮即焚（23:00~06:00 开放 + 倒计时 + 轮询）
│   ├── me/me.vue                 我的
│   ├── detail/detail.vue         帖子详情 + 评论
│   ├── publish/publish.vue       发帖（多图上传 + 草稿）
│   ├── user/user.vue             用户主页（自己/他人同一套页面）
│   ├── settings/settings.vue     编辑资料
│   ├── follow/follow.vue         关注 / 粉丝列表
│   ├── search/search.vue         搜索用户与内容
│   ├── login/login.vue           登录
│   ├── register/register.vue     注册
│   └── reset-password/…          找回密码（两步：验证码 → 新密码）
├── stores/
│   └── account.ts        账号 / 信息流 / 用户资料缓存三个 store
├── utils/
│   ├── datetime.ts       时间展示与时区（与后端 datetime_utils.py 契约对应）
│   ├── token.ts          令牌持久化（独立于 pinia，避免请求层循环依赖）
│   ├── storage.ts        本地存储封装（读写都兜异常）
│   └── text.ts           HTML 降级、图片字段兼容解析、匿名代号
├── App.vue               启动初始化 + 全局样式
├── pages.json            页面与 tabBar 配置
└── manifest.json         各端打包配置（appid、权限、H5 路由模式）
```

---

## 功能对照（相对 Web 端）

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 登录 / 注册 / 找回密码 | ✅ | 密码同样 md5 后传输 |
| 首页信息流 | ✅ | 游标分页、下拉刷新、新内容提示条 |
| 帖子详情 / 评论 / 点赞 / 删除 | ✅ | 评论为平铺列表，暂不做楼中楼 |
| 发帖（文字 + 最多 9 图） | ✅ | 草稿 7 天有效，选图后串行上传 |
| 用户主页 / 关注 / 粉丝 | ✅ | 粉丝接口 404 时区分「没有人」与「接口未开放」 |
| 搜索（用户 + 内容） | ✅ | 内容接口未实现时降级为「暂无结果」 |
| 天亮即焚 | ✅ | 本地 23:00~06:00 判定 + 倒计时 + 15s 轮询 |
| 编辑资料（头像/昵称/签名/性别/生日） | ✅ | |
| 短视频 / 抖音式信息流 | ❌ | Web 端基于 `video.js` + DOM，跨端需重写播放器 |
| 富文本长文编辑器 | ❌ | wangEditor 依赖 DOM；移动端首版只支持纯文本 + 图片 |
| DCF 估值模型页 | ❌ | 纯 Web 计算器，无移动端诉求 |
| 人机验证（Cloudflare Turnstile） | ⚠️ | 见下方「已知差异」 |

---

## 开发与构建

```bash
npm install

# 本地开发
npm run dev:h5            # 浏览器，默认 http://localhost:5174
npm run dev:mp-weixin     # 产物在 dist/dev/mp-weixin，用微信开发者工具导入
npm run dev:app           # 产物在 dist/dev/app，用 HBuilderX 运行到手机

# 生产构建
npm run build:h5          # → dist/build/h5
npm run build:mp-weixin   # → dist/build/mp-weixin
npm run build:app         # → dist/build/app（资源包，非 APK）
npm run type-check        # vue-tsc
```

### 手机真机预览 H5

```bash
npm run dev:h5 -- --host
```

用手机访问电脑的局域网 IP（`vite.config.ts` 里已设 `host: true`）。
注意 `.env.development` 的 `VITE_APP_API_BASE_URL` 要改成电脑的局域网 IP，
否则手机会去请求手机自己的 `localhost`。

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `VITE_APP_API_BASE_URL` | 接口地址 |
| `VITE_CDN_BASE_URL` | 图片/静态资源地址（后端返回相对路径时拼接） |
| `VITE_APP_BASE_URL_APP` | 站点地址，用于生成分享链接 |
| `VITE_APP_IS_DEBUG` | 调试开关（字符串 `"False"` 也是真值，代码里有显式解析） |
| `VITE_MAIL_SUFFIX` | 注册页邮箱后缀快捷输入 |

App 装到手机上后改不了 `.env`，所以「登录页底部 / 我的 → 服务器地址」留了
一个运行期切换入口，写进本地存储后立即对所有请求生效。

---

## 构建工作流

| 工作流 | 触发 | 做什么 |
| --- | --- | --- |
| `ci.yml` | push / PR 到 `main`、`develop` | 类型检查 + 三端构建（只验证不发布） |
| `build.yml` | push `main`/`develop`、`v*` tag、手动 | 产三端 zip 作为 artifact；tag 触发时创建 GitHub Release |
| `build-images.yml` | push 且改动影响产物、`v*` tag、手动 | 构建 H5 的 nginx 镜像并推送到 Docker Hub / 阿里云 ACR |

### 镜像标签策略

| 事件 | 标签 |
| --- | --- |
| push `main` | `main` |
| push `develop` | `develop` |
| tag `v1.2.3` | `1.2.3` + `1.2` + `latest` |
| 手动（填版本号） | 该版本号（语义化版本再滚动 `1.2`） |
| 手动（不填） | 当前分支名 |

分支构建**不推** `<分支>-<sha>`：每次提交一个新标签、永不覆盖也没人去拉，
只会把镜像仓库堆满。一个分支恒定一个标签，推多少次都是覆盖同一个。

### 需要的仓库配置

Secrets：

- `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`（兼容旧命名 `DOCKER_USERNAME` / `DOCKER_PASSWORD`）
- `ALIYUN_REGISTRY` / `ALIYUN_USERNAME` / `ALIYUN_PASSWORD`

Variables：

- `ALIYUN_NAMESPACE`（ACR 命名空间）
- `NPM_REGISTRY`（可选，默认官方源）

一个都没配也能跑：镜像照常构建，只在末尾给一条 warning，不会卡住流程。

---

## 各端发布

### H5

产物是可静态托管的站点（history 路由，需要服务端回落到 `index.html`）。
仓库里的 `Dockerfile` + `docker/nginx.conf` 已经处理好回落、gzip 与
`index.html` 不缓存（发版后不会因为入口被缓存而引用已删除的 chunk）：

```bash
docker build -t uniapp_tuiwen:dev .
docker run -p 8080:80 uniapp_tuiwen:dev
```

### 微信小程序

1. 把 `src/manifest.json` 的 `mp-weixin.appid` 换成自己的 AppID（当前是 `touristappid` 占位）；
2. `npm run build:mp-weixin`；
3. 微信开发者工具 → 导入项目 → 选 `dist/build/mp-weixin`；
4. 在「详情 → 本地设置」勾选 *不校验合法域名*（本地调试），
   正式发布前把 `api.tuiwen.alsoapp.com` 加到「开发管理 → 服务器域名」的 request 白名单。

### App

CI 产出的是 **App 资源包（www）**，不是 APK/IPA —— 原生包需要 DCloud 云打包或
本地 Xcode / Android SDK，托管 runner 上没有这套工具链。

```bash
npm run build:app       # 产物：dist/build/app
```

用 HBuilderX 打开本工程 → 发行 → 原生 App 云打包，选择证书即可产出 APK/IPA。
`manifest.json` 里的 `appid` 留空，需要在 DCloud 开发者中心申请后填入。

---

## 已知差异与限制

1. **人机验证（Turnstile）未接入。**
   Cloudflare Turnstile 是 Web 组件，小程序 / App 端无法直接渲染。
   若后端对登录/注册强制校验 `cf_turnstile_token`，移动端会被拒 ——
   需要服务端为移动端开一条独立通道（如 App 签名 + 风控），
   而不是在前端伪造一个 token 糊过去。
2. **没有实现「开板提醒」推送。** Web 端用浏览器通知；移动端要做得靠谱需要
   接入厂商推送通道（个推 / 极光 / 微信订阅消息），属于另一件事。
3. **列表页不预加载点赞状态。** 一屏 10 条就是 10 个额外请求，
   改成点过赞之后才显示数字，代价是没点过的卡片没有计数。
4. **评论不做楼中楼。** 后端有 `parent_id`，首版只做平铺。
5. **时区降级。** 小程序基础库不保证有 `Intl`，此时 `X-Timezone` 会退化成
   `UTC+08:00` 这种偏移写法，后端无法识别时回退到业务时区；
   展示侧同步退化为设备墙钟，两端口径仍然一致。
