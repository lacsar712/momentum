# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Set npm mirror for speed
RUN npm config set registry https://registry.npmmirror.com

# Copy package files
COPY package.json ./

# Install dependencies (using install because we don't have lockfile yet)
RUN npm install

# Copy source
COPY . .

# Build
RUN npm run build

# Production Stage
FROM nginx:alpine

# Copy build artifacts
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
