FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY web-app/package.json web-app/package-lock.json ./
RUN npm ci --production

# Copy application source
COPY web-app/server.js ./
COPY web-app/public/ ./public/

# Copy query files
COPY queries/ ./queries/

# Disable destructive API by default
ENV ENABLE_DESTRUCTIVE_API=false
ENV PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/ || exit 1

CMD ["node", "server.js"]
