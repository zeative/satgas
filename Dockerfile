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
# Debian's chromium is the agents' browser, driven through agent-browser; it lives outside /home/node, so the volume
# mounted there never hides it. Python with python-pptx, python-docx, openpyxl and reportlab, plus pandoc, let agents
# make decks, documents, spreadsheets and PDFs without installing anything.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git ripgrep tini chromium fonts-liberation \
    python3 python3-pip python3-docx python3-openpyxl python3-reportlab pandoc \
  && rm -rf /var/lib/apt/lists/*
# Debian has no package for python-pptx. Installed as root, so it stays outside the /home/node volume too.
RUN pip3 install --break-system-packages --no-cache-dir python-pptx==1.0.2
RUN npm install -g @anthropic-ai/claude-code @openai/codex agent-browser && npm cache clean --force

COPY --from=build /app/dist/satgas /usr/local/bin/satgas
COPY --from=build --chmod=755 /app/scripts/docker-entry.sh /usr/local/bin/satgas-entry

# Agents run commands as this user, never root; its home keeps the CLIs' sign-ins and settings.
RUN mkdir -p /data && chown -R node:node /data /home/node
USER node
WORKDIR /data
ENV HOME=/home/node \
  AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium \
  SATGAS_HOST=0.0.0.0 \
  SATGAS_PORT=4317 \
  SATGAS_DATA_DIR=/data \
  SATGAS_CONTAINER=1
VOLUME ["/data", "/home/node"]
EXPOSE 4317

# The app shell answers without signing in, so it doubles as the health probe (slim images have no curl).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4317/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# tini reaps the processes agents leave behind and forwards signals, so a stop still saves boards.
ENTRYPOINT ["tini", "--"]
CMD ["satgas-entry"]
