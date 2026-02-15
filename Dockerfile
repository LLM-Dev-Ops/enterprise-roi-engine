# Enterprise ROI Engine - Cloud Run Deployment
FROM node:22-alpine AS builder

WORKDIR /app

# Upgrade npm to handle alpha semver versions in lockfile
RUN npm install -g npm@latest

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

# Production stage
FROM node:22-alpine

WORKDIR /app

RUN npm install -g npm@latest

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built files from builder
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/server.js"]
