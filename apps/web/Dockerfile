# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Build-time environment variables for Vite
ARG VITE_API_URL=http://localhost:5064/api/v1
ENV VITE_API_URL=$VITE_API_URL

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build shared package and web app
RUN pnpm --filter @oxy/shared build
RUN pnpm --filter @oxy/web build

# Production stage - serve with nginx
FROM nginx:alpine AS runner

# Install curl for health checks
RUN apk add --no-cache curl

# Copy nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
