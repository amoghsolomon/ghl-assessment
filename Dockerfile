FROM node:24-slim AS build

WORKDIR /app

ENV CI=true

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json ./api/package.json
COPY web-component/package.json ./web-component/package.json

RUN pnpm install --frozen-lockfile

COPY api ./api
COPY web-component ./web-component

RUN pnpm build

FROM node:24-slim AS runtime

WORKDIR /app

ENV CI=true
ENV NODE_ENV=production
ENV PORT=3000

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json ./api/package.json
COPY web-component/package.json ./web-component/package.json

RUN pnpm install --prod --frozen-lockfile --filter api

COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/web-component/dist ./web-component/dist

RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

CMD ["node", "api/dist/index.js"]
