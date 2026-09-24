FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/vendor ./backend/vendor
RUN npm ci --workspace @quantforge/backend --include-workspace-root
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src
RUN npm run build:backend && npm prune --omit=dev --workspace @quantforge/backend --include-workspace-root && mkdir -p backend/node_modules

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4100
WORKDIR /app/backend
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/package.json ./package.json
COPY --from=build --chown=node:node /app/backend/dist ./dist
COPY --from=build --chown=node:node /app/backend/vendor ./vendor
RUN chown node:node /app/backend
USER node
EXPOSE 4100
CMD ["node", "dist/server.js"]
