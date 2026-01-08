# LINDAS Cube Cleanup Service - Docker Image
#
# Build: docker build -t lindas-cleanup .
# Run:   docker run -v ./config:/app/config -v ./backups:/app/backups lindas-cleanup cleanup

FROM node:18-alpine

# Labels
LABEL maintainer="LINDAS Team"
LABEL description="LINDAS Cube Version Cleanup Service"

# Create app directory
WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY config/ ./config/

# Create directories for backups and logs
RUN mkdir -p /app/backups /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV BACKUP_PATH=/app/backups
ENV LOG_FILE=/app/logs/cleanup.log

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('./src/triplestore').createAdapter(require('./config/config.json').triplestore).testConnection().then(ok => process.exit(ok ? 0 : 1))"

# Default command
ENTRYPOINT ["node", "src/cli.js"]
CMD ["--help"]
