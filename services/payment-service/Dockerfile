FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY services/payment-service/package.json services/payment-service/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/kafka-core/package.json packages/kafka-core/
RUN npm install --workspaces --include-workspace-root

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@eds/shared-types
RUN npm run build --workspace=@eds/kafka-core
RUN npx prisma generate --schema=services/payment-service/prisma/schema.prisma
RUN npm run build --workspace=@eds/payment-service

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/payment-service/dist ./services/payment-service/dist
COPY --from=build /app/services/payment-service/prisma ./services/payment-service/prisma
COPY --from=build /app/services/payment-service/package.json ./services/payment-service/
COPY --from=build /app/services/payment-service/node_modules ./services/payment-service/node_modules
EXPOSE 3001
USER node
# Apply pending Prisma migrations before booting. Production deploys should
# run `migrate deploy` as a separate pre-deploy step to avoid races between
# concurrent boots, but this is the right ergonomics for the local stack.
CMD ["sh", "-c", "cd services/payment-service && npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/main.js"]
