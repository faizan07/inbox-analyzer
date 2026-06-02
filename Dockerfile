# ── Stage 1: Build client ──────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY client/package*.json client/
RUN cd client && npm ci
COPY client/ client/
RUN cd client && npm run build

# ── Stage 2: Production image ──────────────────────────────
FROM node:20-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy server code and built client
COPY server/ server/
COPY --from=builder /app/client/dist client/dist

# Security: run as non-root user
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/auth/status || exit 1

CMD ["node", "server/index.js"]
