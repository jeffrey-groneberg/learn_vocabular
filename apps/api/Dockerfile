FROM node:24.14.0-alpine3.23 AS build
WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json vitest.config.ts ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/observability/package.json packages/observability/package.json
RUN npm ci --no-audit --no-fund

COPY apps/api apps/api
COPY packages packages
RUN npm run build --workspace @vocabulary/domain \
  && npm run build --workspace @vocabulary/observability \
  && npm run build --workspace @vocabulary/api \
  && npm prune --omit=dev --workspaces --include-workspace-root

FROM node:24.14.0-alpine3.23 AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/packages ./packages
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--import", "@azure/monitor-opentelemetry/loader", "dist/index.js"]
