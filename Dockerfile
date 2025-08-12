# Stage 1: Build
FROM node:22.17.0-alpine as builder
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Stage 2: Run
FROM node:22.17.0-alpine
WORKDIR /usr/src/app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY package.json ./
# COPY .env.* ./
EXPOSE 3006
# CMD [ "pnpm", "run", "start:dev" ]
# CMD [ "pnpm", "run", "start:stage" ]
# CMD [ "pnpm", "run", "start:prod" ]
CMD [ "node", "dist/main" ]