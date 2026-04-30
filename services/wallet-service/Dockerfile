FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY services/wallet-service/package.json services/wallet-service/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/kafka-core/package.json packages/kafka-core/
RUN npm install --workspaces --include-workspace-root

FROM node:25-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@eds/shared-types
RUN npm run build --workspace=@eds/kafka-core
RUN npm run build --workspace=@eds/wallet-service

FROM node:25-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/wallet-service/dist ./services/wallet-service/dist
COPY --from=build /app/services/wallet-service/package.json ./services/wallet-service/
COPY --from=build /app/services/wallet-service/node_modules ./services/wallet-service/node_modules
EXPOSE 3002
USER node
CMD ["node", "services/wallet-service/dist/main.js"]
