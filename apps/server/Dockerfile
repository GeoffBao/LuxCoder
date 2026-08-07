# MyYoda Server — 企业版 Skills 分发注册中心
#
# 基于 oven/bun 官方镜像，安装依赖后复制源码运行。
# 数据持久化到 /data（SQLite + Skills 存储）。

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
RUN bun install --frozen-lockfile --production

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV MYYODA_SERVER_DB=/data/myyoda-server.db
ENV MYYODA_SERVER_SKILLS_DIR=/data/skills
ENV MYYODA_SERVER_JWT_SECRET=change-me-in-production

COPY --from=deps /app/node_modules ./node_modules
COPY apps/server ./apps/server
COPY packages ./packages
COPY tsconfig.json ./

RUN mkdir -p /data

EXPOSE 8787
VOLUME ["/data"]

CMD ["bun", "run", "apps/server/src/index.ts"]
