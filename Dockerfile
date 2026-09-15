# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Cloudwright
#
# One image, two things: the web app and the MCP server, served from a single
# process on one port. The MCP's screenshot and video tools drive the very app
# the container is serving, so Chromium and ffmpeg are installed alongside.
#
#   docker build -t cloudwright .
#   docker run --rm -p 8080:8080 cloudwright
#
#   app  http://localhost:8080
#   mcp  http://localhost:8080/mcp
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    CLOUDWRIGHT_BROWSER=/usr/bin/chromium \
    CLOUDWRIGHT_DIST=/app/dist

# Chromium renders the screenshots and video frames; ffmpeg encodes them.
# Without these the app and every non-visual MCP tool still work.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium ffmpeg fonts-liberation ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

# Only what is needed to run: the built app, the built server, and the runtime
# packages the server imports (the SDK, zod, puppeteer-core).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-mcp ./dist-mcp

RUN useradd --create-home --shell /usr/sbin/nologin cloudwright \
 && chown -R cloudwright:cloudwright /app
USER cloudwright

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps the browser processes the screenshot tools spawn.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist-mcp/serve.mjs"]
