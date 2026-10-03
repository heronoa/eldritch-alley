# Eldritch Alley: Tactics

RPG tático por turnos no navegador. Veja [pitch.md](pitch.md) para o conceito.

## Estrutura

```
backend/
  engine/         motor de batalha determinístico (TypeScript puro)
  game-server/    Colyseus: salas de partida, sincronização, bot
  platform-api/   NestJS: contas, elencos, rating, replays, matchmaking
  Dockerfile      imagem única dos serviços (ARG SERVICE)
frontend/         Phaser + Vite, publicado como static assets no Cloudflare
docker-compose.yml  Postgres, Redis, LocalStack e os dois serviços
```

## Desenvolvimento

Requisitos: Node 22+, Docker.

```bash
cp .env.example .env
npm install
npm run infra:up          # Postgres, Redis, LocalStack
npm run dev:platform-api  # http://localhost:3000/health
npm run dev:game-server   # ws://localhost:2567
npm run dev:frontend      # http://localhost:5173
npm test                  # testes do engine
```

Stack completa em containers: `docker compose up --build`.

## Deploy (planejado)

- **Backend:** imagens em `backend/Dockerfile` publicadas no ECR e executadas no ECS (Fargate) atrás de um Application Load Balancer.
- **Frontend:** `npm run build -w @mystic-alley/frontend` e `npm run deploy -w @mystic-alley/frontend` (Cloudflare Workers com Static Assets).
