# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY prisma ./prisma
COPY src ./src

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build

# Install tsc-alias to resolve TypeScript paths
RUN npm install -D tsc-alias

# Resolve TypeScript path aliases in compiled code
RUN npx tsc-alias -p tsconfig.json

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy Prisma schema and migrations
COPY prisma ./prisma

# Copy built application from builder (with resolved paths)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Expose port
EXPOSE 3000

# Run Prisma generate and start server (skip migrations for existing DB)
CMD npx prisma generate && node dist/server.js
