# syntax=docker/dockerfile:1

FROM node:24.21.0-bookworm-slim AS dependencies

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV DATABASE_URL=postgresql://inventory:inventory@localhost:5432/inventory?schema=public \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./

RUN npm install --no-audit --no-fund

FROM dependencies AS build

COPY nest-cli.json ./
COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY src ./src

RUN npm run build

FROM dependencies AS migration

COPY src ./src

CMD ["sh", "-c", "npm run db:migrate:deploy && npm run db:seed"]

FROM node:24.21.0-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json ./
COPY --from=dependencies /app/package-lock.json ./package-lock.json
COPY --from=dependencies /app/node_modules ./node_modules

RUN npm prune --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const p=(process.env.API_PREFIX||'api/v1').replace(/^\\/+|\\/+$/g,''); fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/'+p+'/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

STOPSIGNAL SIGTERM

CMD ["node", "dist/main.js"]
