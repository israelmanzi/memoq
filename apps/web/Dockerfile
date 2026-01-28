# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Build-time environment variables for Vite
ARG VITE_API_URL=http://localhost:5064/api/v1
ENV VITE_API_URL=$VITE_API_URL

# Copy workspace config files first (for better caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install dependencies with cache mount
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build shared package and web app
RUN pnpm --filter @oxy/shared build && \
    pnpm --filter @oxy/web build

# Production stage - serve with nginx
FROM nginx:1.27-alpine AS runner

# Copy nginx config template
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template

# Copy built static files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Setup permissions for nginx user (already exists in nginx-alpine)
# Pre-create all nginx cache subdirectories with correct ownership
# This avoids needing CHOWN capability at runtime
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    mkdir -p /var/cache/nginx/client_temp \
             /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp \
             /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Default port (can be overridden via environment)
ENV NGINX_PORT=80

EXPOSE 80 5063

# Health check - uses NGINX_PORT env var
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:${NGINX_PORT}/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
