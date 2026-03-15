FROM node:25-alpine AS web-builder

WORKDIR /app

COPY packages/web/package.json packages/web/package-lock.json ./packages/web/
RUN npm --prefix ./packages/web ci

COPY packages/web ./packages/web
RUN npm --prefix ./packages/web run build

FROM node:25-alpine AS runtime

WORKDIR /app

COPY package.json ./package.json
COPY packages/server/src ./packages/server/src
COPY packages/shared/src ./packages/shared/src
COPY --from=web-builder /app/packages/web/dist ./packages/web/dist

ENV HOST=0.0.0.0
ENV PORT=3001
ENV WORKSPACE_ROOT=/data
ENV WEB_ROOT=/app/packages/web/dist

VOLUME ["/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

CMD ["node", "packages/server/src/http/node-server.ts"]

