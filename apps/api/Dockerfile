# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace config files first (for better caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all dependencies with cache mount
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package and API
RUN pnpm --filter @oxy/shared build && \
    pnpm --filter @oxy/api build

# Create production deployment
RUN pnpm --filter @oxy/api deploy --prod /app/deploy

# Production stage
FROM node:20-alpine AS runner

# Add tini for proper signal handling (PID 1)
RUN apk add --no-cache tini

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 oxy

WORKDIR /app

ENV NODE_ENV=production

# Copy the deployed production files
COPY --from=builder --chown=oxy:nodejs /app/deploy ./

# Copy drizzle migrations
COPY --from=builder --chown=oxy:nodejs /app/apps/api/drizzle ./drizzle

# Copy shared dist (needed at runtime)
COPY --from=builder --chown=oxy:nodejs /app/packages/shared/dist ./node_modules/@oxy/shared/dist

USER oxy

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
