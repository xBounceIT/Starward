# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=${APP_VERSION}

COPY . .
RUN node -e "const fs = require('node:fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); pkg.version = process.env.APP_VERSION; fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');" \
    && pnpm build \
    && pnpm prune --prod

FROM node:24-alpine AS runtime
WORKDIR /app

ARG APP_VERSION=0.0.0-dev

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV APP_VERSION=${APP_VERSION}

LABEL org.opencontainers.image.title="Starward Frontend" \
      org.opencontainers.image.description="Starward Password Manager - TanStack Start frontend" \
      org.opencontainers.image.version="${APP_VERSION}"

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/server.mjs ./server.mjs

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.mjs"]
