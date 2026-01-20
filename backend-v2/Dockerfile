FROM node:18-slim

WORKDIR /app

COPY package*.json ./

# Install dependencies (including dev for building)
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
