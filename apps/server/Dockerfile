FROM oven/bun:1.3 AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src/ src/
COPY tsconfig.json ./

# SQLite data directory
RUN mkdir -p /data

ENV SERVER_PORT=4000
ENV DB_PATH=/data/events.db
EXPOSE 4000

CMD ["bun", "src/index.ts"]
