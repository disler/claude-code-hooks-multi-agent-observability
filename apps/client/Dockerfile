FROM oven/bun:1.3 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Build-time: tell client where the API server is at runtime
# The browser connects to localhost:4000 (exposed via docker-compose ports)
ARG VITE_API_PORT=4000
ENV VITE_API_PORT=${VITE_API_PORT}

# Skip vue-tsc type check (upstream TS errors), build directly with vite
RUN bunx vite build

# --- production stage: serve static files with nginx ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
