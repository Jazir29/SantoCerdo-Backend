FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 4000
CMD ["sh", "-c", "npx ts-node src/migrate.ts && npm run dev"]
