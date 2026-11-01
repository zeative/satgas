# syntax=docker/dockerfile:1.7

# Build: install from the lockfile alone (cached across code changes), then compile the single-file binary with the UI inside.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
COPY . .
RUN bun run build

# Run: agents are the Claude Code and Codex CLIs, so the image carries them plus the tools they reach for.
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git ripgrep tini \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code @openai/codex && npm cache clean --force

COPY --from=build /app/dist/satgas /usr/local/bin/satgas

# Agents run commands as this user, never root; its home keeps the CLIs' sign-ins and settings.
RUN mkdir -p /data && chown -R node:node /data /home/node
USER node
WORKDIR /data
ENV HOME=/home/node \
  SATGAS_HOST=0.0.0.0 \
  SATGAS_PORT=4317 \
  SATGAS_DATA_DIR=/data
VOLUME ["/data", "/home/node"]
EXPOSE 4317

# The app shell answers without signing in, so it doubles as the health probe (slim images have no curl).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4317/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# tini reaps the processes agents leave behind and forwards signals, so a stop still saves boards.
ENTRYPOINT ["tini", "--"]
CMD ["satgas"]
