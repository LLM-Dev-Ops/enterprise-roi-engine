# Enterprise ROI Engine - Cloud Run Deployment
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune dev dependencies for production
RUN npm prune --production

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package.json for reference
COPY package*.json ./

# Copy node_modules from builder (already pruned to production)
COPY --from=builder /app/node_modules ./node_modules

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Run the server
CMD ["node", "dist/server.js"]
