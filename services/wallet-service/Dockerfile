FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY services/wallet-service/package.json services/wallet-service/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/kafka-core/package.json packages/kafka-core/
RUN npm install --workspaces --include-workspace-root

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@eds/shared-types
RUN npm run build --workspace=@eds/kafka-core
RUN npx prisma generate --schema=services/wallet-service/prisma/schema.prisma
RUN npm run build --workspace=@eds/wallet-service

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/wallet-service/dist ./services/wallet-service/dist
COPY --from=build /app/services/wallet-service/prisma ./services/wallet-service/prisma
COPY --from=build /app/services/wallet-service/package.json ./services/wallet-service/
COPY --from=build /app/services/wallet-service/node_modules ./services/wallet-service/node_modules
EXPOSE 3002
USER node
# Run migrations on container start, then boot the service. Acceptable for
# the local-dev stack; production deploys should run `migrate deploy` as a
# pre-deploy step so concurrent app boots don't race the migration lock.
CMD ["sh", "-c", "cd services/wallet-service && npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/main.js"]
