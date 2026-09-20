# ============================================================================
# Production backend image (built from the repository root context).
#   docker build -f backend/Dockerfile -t bazar-survey-backend .
# Multi-stage: dev-dependency install + tsc build, then a lean runtime image
# with only production dependencies. Test fixtures, dev seed data, host
# node_modules and .env files are excluded via the root .dockerignore.
# ============================================================================

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY backend backend
RUN npm run build -w backend

# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# Only the backend production dependency tree lands in node_modules.
RUN npm ci --omit=dev -w backend

# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Compiled backend (src + database tooling) with static migration files.
COPY --from=build /repo/backend/dist ./backend/dist
COPY --from=deps /repo/node_modules ./node_modules
# Static SQL migrations are read from dist/database/migrations by migrate-lib.
COPY backend/database/migrations ./backend/dist/database/migrations

WORKDIR /app/backend
EXPOSE 4000

COPY backend/docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh

# Backend starts as a non-root user.
RUN addgroup -S app && adduser -S -G app app && chown -R app:app /app
USER app

# Migrations run automatically on container start (never a dev reset/seed);
# then the API server starts.
ENTRYPOINT ["backend-entrypoint.sh"]
CMD ["node", "dist/src/index.js"]