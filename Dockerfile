# syntax=docker/dockerfile:1

# Build native dependencies on the same Debian/Node family used at runtime.
FROM node:24-bookworm AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY vite.config.js ./
COPY server/config.js ./server/config.js
COPY scripts/check-api.mjs ./scripts/check-api.mjs
COPY client ./client
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/cinebook.sqlite \
    TZ=Asia/Kolkata
WORKDIR /app
RUN mkdir -p /app/data && chown node:node /app/data
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/client/dist ./client/dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health', { signal: AbortSignal.timeout(4000) }).then(async response => { const health = await response.json(); if (!response.ok || health.status !== 'ok' || health.database !== 'connected') process.exit(1); }).catch(() => process.exit(1));"
CMD ["node", "server/index.js"]
