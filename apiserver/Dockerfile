FROM node:20-alpine AS base

# Install buf CLI for proto code generation
RUN apk add --no-cache curl && \
    curl -sSL "https://github.com/bufbuild/buf/releases/latest/download/buf-$(uname -s)-$(uname -m)" \
    -o "/usr/local/bin/buf" && \
    chmod +x "/usr/local/bin/buf"

WORKDIR /app

# Copy proto files and package files
COPY proto ../proto
COPY apiserver/package*.json ./

# Install dependencies
RUN npm ci

# Generate code from protos
RUN npm run generate

# Copy source code
COPY apiserver/src ./src
COPY apiserver/tsconfig.json ./

# Build TypeScript
FROM base AS builder
RUN npm run build

# Production image
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files and install production dependencies only
COPY apiserver/package*.json ./
RUN npm ci --only=production

# Copy built files and database
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/gen ./dist/gen

# Create db directory
RUN mkdir -p /app/db

EXPOSE 3001

CMD ["node", "dist/index.js"]
