FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY services/ledger-service/package.json services/ledger-service/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/kafka-core/package.json packages/kafka-core/
RUN npm install --workspaces --include-workspace-root

FROM node:25-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@eds/shared-types
RUN npm run build --workspace=@eds/kafka-core
RUN npm run build --workspace=@eds/ledger-service

FROM node:25-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/ledger-service/dist ./services/ledger-service/dist
COPY --from=build /app/services/ledger-service/package.json ./services/ledger-service/
COPY --from=build /app/services/ledger-service/node_modules ./services/ledger-service/node_modules
EXPOSE 3003
USER node
CMD ["node", "services/ledger-service/dist/main.js"]
