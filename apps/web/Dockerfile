FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# /backend/* is rewritten to API_PROXY_TARGET. Next bakes rewrites at build time,
# so this MUST be a build arg (internal URL like http://api:8008 works in compose).
ARG API_PROXY_TARGET=http://api:8008
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_ACCOUNTS_URL=https://accounts.collab.name.ng
ARG NEXT_PUBLIC_APP_URL=https://crede.collab.name.ng
ENV API_PROXY_TARGET=$API_PROXY_TARGET \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ACCOUNTS_URL=$NEXT_PUBLIC_ACCOUNTS_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
ARG API_PROXY_TARGET=http://api:8008
ENV API_PROXY_TARGET=$API_PROXY_TARGET
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/manifest.webmanifest >/dev/null || exit 1
CMD ["node", "server.js"]
