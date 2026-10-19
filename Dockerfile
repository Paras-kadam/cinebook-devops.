# syntax=docker/dockerfile:1

# Build native dependencies on the same Debian/Node family used at runtime.
FROM node:24-bookworm AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY vite.config.js ./
COPY server/config.js ./server/config.js
COPY scripts/check-api.mjs ./scripts/check-api.mjs
COPY client ./client
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/cinebook.sqlite \
    TZ=Asia/Kolkata
WORKDIR /app
RUN mkdir -p /app/data && chown node:node /app/data
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/client/dist ./client/dist
COPY package.json ./
COPY server ./server
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "server/healthcheck.js"]
CMD ["node", "server/index.js"]
