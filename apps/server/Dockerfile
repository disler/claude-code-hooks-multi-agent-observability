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

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:4000/events/recent?limit=1').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "src/index.ts"]
