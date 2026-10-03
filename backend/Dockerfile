# Imagem única para os serviços do backend.
# Build: docker build -f backend/Dockerfile --build-arg SERVICE=game-server .
# SERVICE é o nome da pasta em backend/ (game-server ou platform-api).
# O contexto é a raiz do repositório, porque o engine é compartilhado.

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS build
ARG SERVICE
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/engine/package.json backend/engine/
COPY backend/game-server/package.json backend/game-server/
COPY backend/platform-api/package.json backend/platform-api/
RUN npm ci -w backend/${SERVICE} -w backend/engine

COPY backend backend
RUN npm run build -w backend/${SERVICE}

FROM node:${NODE_VERSION} AS runtime
ARG SERVICE
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/backend/${SERVICE}

EXPOSE 2567 3000
CMD ["node", "dist/main.js"]
