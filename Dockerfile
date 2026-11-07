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
  && apt-get install -y --no-install-recommends ca-certificates curl git ripgrep tini chromium fonts-liberation \
    python3 python3-pip python3-docx python3-openpyxl python3-reportlab pandoc \
  && rm -rf /var/lib/apt/lists/*
# Debian has no package for python-pptx. Installed as root, so it stays outside the /home/node volume too.
RUN pip3 install --break-system-packages --no-cache-dir python-pptx==1.0.2
RUN npm install -g @anthropic-ai/claude-code @openai/codex agent-browser @ast-grep/cli@0.51.1 && npm cache clean --force
# Catalog tools nobody could install inside a running container, pinned and checked. rtk-oss because the default
# rtk edition links BUSL code that may not ship inside another product.
RUN set -eu; \
  case "$(dpkg --print-architecture)" in \
    amd64) rtk=x86_64-unknown-linux-musl rtk_sha=4dec94a64035e08189ae82fd5408fe4ae9ae27a665fc07e3e3ec3c4c2d8e8a3e \
      leaks=x64 leaks_sha=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb ;; \
    arm64) rtk=aarch64-unknown-linux-gnu rtk_sha=57a4fac13d18da77f0577ea8b68def7934b934bf76d0a6e161f0bfd06b1e1078 \
      leaks=arm64 leaks_sha=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080 ;; \
    *) echo "no rtk or gitleaks build for this architecture" >&2; exit 1 ;; \
  esac; \
  tmp="$(mktemp -d)"; \
  cd "$tmp"; \
  curl -fsSL -o rtk.tgz "https://github.com/rtk-ai/rtk/releases/download/v1.1.0/rtk-oss-$rtk.tar.gz"; \
  curl -fsSL -o gitleaks.tgz "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_$leaks.tar.gz"; \
  printf '%s  rtk.tgz\n%s  gitleaks.tgz\n' "$rtk_sha" "$leaks_sha" | sha256sum -c -; \
  mkdir -p /usr/local/share/licenses/rtk /usr/local/share/licenses/gitleaks; \
  tar -xzf rtk.tgz --no-same-owner -C /usr/local/bin rtk; \
  tar -xzf rtk.tgz --no-same-owner -C /usr/local/share/licenses/rtk LICENSE; \
  tar -xzf gitleaks.tgz --no-same-owner -C /usr/local/bin gitleaks; \
  tar -xzf gitleaks.tgz --no-same-owner -C /usr/local/share/licenses/gitleaks LICENSE; \
  cd /; \
  rm -rf "$tmp"; \
  rtk --version; \
  gitleaks --version; \
  ast-grep --version

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
