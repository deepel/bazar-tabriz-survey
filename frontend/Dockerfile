# ============================================================================
# Production frontend image (built from the repository root context).
#   docker build -f frontend/Dockerfile -t bazar-survey-frontend .
# Stage 1 builds the static React bundle; stage 2 serves it with nginx and
# reverse-proxies /api to the backend container over the internal network.
# ============================================================================

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY frontend frontend
RUN npm run build -w frontend

# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]