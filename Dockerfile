FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for canvas
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (ignore scripts since src not copied yet)
RUN npm ci --ignore-scripts

# Copy source code
COPY src ./src
COPY public ./public

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime and build dependencies for canvas
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    librsvg \
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev --ignore-scripts

# Rebuild canvas native module
RUN npm rebuild canvas

# Remove dev dependencies
RUN npm prune --omit=dev --ignore-scripts

# Remove build dependencies to reduce image size
RUN apk del python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev librsvg-dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
# Copy data files needed at runtime
COPY --from=builder /app/src/map/data ./src/map/data
COPY --from=builder /app/src/imageGeneration/img ./src/imageGeneration/img

# Expose port
EXPOSE 8000

# Start application
CMD ["npm", "start"]

