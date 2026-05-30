FROM node:20-slim

WORKDIR /app

# Copy package files first for better caching
COPY package.json ./

# Install dependencies
RUN npm install

# Copy all source files
COPY . .

# Build frontend + backend
RUN npm run build

# Expose the port Railway assigns
EXPOSE ${PORT:-3000}

# Start the production server
ENV NODE_ENV=production
CMD ["node", "dist/server.cjs"]
