# syntax=docker/dockerfile:1

# Build stage
FROM node:20-bookworm AS builder

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

# Production stage - using full bookworm for better networking support
FROM node:20-bookworm-slim AS runner

# Install essential tools for networking and debugging
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    dumb-init \
    netcat-openbsd \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Add non-root user for security
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs oxy

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

# Use dumb-init as PID 1 (more reliable than tini for signal handling)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
