FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY services/api-gateway/package.json services/api-gateway/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/kafka-core/package.json packages/kafka-core/
RUN npm install --workspaces --include-workspace-root

FROM node:25-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/api-gateway/node_modules ./services/api-gateway/node_modules
COPY . .
RUN npm run build --workspace=@eds/shared-types
RUN npm run build --workspace=@eds/api-gateway

FROM node:25-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=build /app/services/api-gateway/dist ./services/api-gateway/dist
COPY --from=build /app/services/api-gateway/package.json ./services/api-gateway/
COPY --from=build /app/services/api-gateway/node_modules ./services/api-gateway/node_modules
EXPOSE 3000
USER node
CMD ["node", "services/api-gateway/dist/main.js"]
