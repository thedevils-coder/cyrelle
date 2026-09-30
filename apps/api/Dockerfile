FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm ci --workspace @cyrelle/shared --workspace @cyrelle/api
RUN npm run build --workspace @cyrelle/shared && npm run build --workspace @cyrelle/api && npm run db:generate --workspace @cyrelle/api
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
