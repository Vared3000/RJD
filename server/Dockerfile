FROM node:24-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["sh", "-c", "node src/database/migrate.js up && node src/database/seed.js && exec node src/server.js"]
