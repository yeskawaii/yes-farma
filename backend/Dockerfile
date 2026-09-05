FROM node:22-alpine AS development
WORKDIR /usr/src/app
COPY package*.json ./
COPY prisma ./prisma/
COPY scripts/patch-libsignal-session-logging.cjs ./scripts/
RUN npm ci
COPY . .
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" npx prisma generate
EXPOSE 3000
CMD ["sh", "-c", "npx prisma generate && npm run dev"]

FROM node:22-alpine AS build
WORKDIR /usr/src/app
COPY package*.json ./
COPY prisma ./prisma/
COPY scripts/patch-libsignal-session-logging.cjs ./scripts/
RUN npm ci
COPY . .
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" npx prisma generate
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /usr/src/app
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./prisma.config.ts
COPY scripts/patch-libsignal-session-logging.cjs ./scripts/
RUN npm ci --omit=dev
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/src/generated/prisma ./dist/generated/prisma
COPY --from=build /usr/src/app/src/generated/prisma ./src/generated/prisma
EXPOSE 3000
CMD ["npm", "run", "start"]
