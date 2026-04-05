FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git config --global user.email "kb-platform@local" && \
    git config --global user.name "KB Platform"

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# Setup Quartz
COPY scripts/setup-quartz.sh scripts/
RUN bash scripts/setup-quartz.sh

# Copy source
COPY tsconfig.json ./
COPY src/ src/

# Build TypeScript
RUN npx tsc

EXPOSE 8000

CMD ["node", "dist/index.js"]
