# =============================================================================
# H5 产物镜像：node 构建 → nginx 托管
#
# 只镜像 H5：小程序 / App 的产物是给各平台工具用的资源包，不属于容器交付物。
# 这两端的产物由 GitHub Actions 打成 artifact / Release 附件（见 .github/workflows）。
#
# 构建参数：
#   BUILD_MODE  uni 的构建模式（默认 production，对应 .env.production）
#   NPM_REGISTRY npm 源（国内 CI 或自建缓存时可用）
# =============================================================================
FROM node:22-alpine AS builder

ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app

# 只拷依赖清单：源码变动时仍能命中依赖层缓存
COPY package.json package-lock.json* ./
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
    && npm ci --no-audit --no-fund

COPY . .

# uni build 默认 production 模式，输出到 dist/build/h5
RUN npm run build:h5

# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine

# 时区：日志时间与运维习惯对齐（不装 tzdata 时 nginx 日志一律 UTC）
RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/build/h5 /usr/share/nginx/html

# 健康检查：curlimages 里的 wget 在 alpine 自带 busybox 中可用
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
