FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY prisma prisma
RUN npm ci

COPY tsconfig.base.json tsconfig.base.json
COPY apps apps
RUN npm run db:generate && npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=8000
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY prisma prisma
RUN npm ci --omit=dev && npm run db:generate && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist

EXPOSE 8000
CMD ["npm", "run", "start:prod"]
