# -------- Development Stage --------
FROM node:20-alpine

WORKDIR /app

# Copy package.json first for caching
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm install

# Copy everything
COPY . .

EXPOSE 3000

# Use dev script with tsx
CMD ["npm", "run", "dev"]