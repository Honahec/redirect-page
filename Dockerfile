FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM nginx:1.29-alpine

COPY nginx/30-render-config.sh /docker-entrypoint.d/30-render-config.sh
COPY --from=builder /app/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/30-render-config.sh

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
