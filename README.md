# Eldritch Alley: Tactics

Turn-based tactical RPG for the browser. See [pitch.md](pitch.md) for the concept, [ROADMAP.md](ROADMAP.md) for the delivery plan, and [docs/adr/](docs/adr/) for the architecture decisions.

## Structure

```
backend/
  engine/         deterministic battle engine (pure TypeScript)
  game-server/    Colyseus: match rooms, state sync, bot
  platform-api/   NestJS: accounts, rosters, rating, replays, matchmaking
  Dockerfile      single image for the services (ARG SERVICE)
frontend/         Phaser + Vite, published as static assets on Cloudflare
docker-compose.yml  Postgres, Redis, LocalStack and both services
docs/adr/         architecture decision records
```

## Development

Requirements: Node 22+, Docker.

```bash
cp .env.example .env
npm install
npm run infra:up          # Postgres, Redis, LocalStack
npm run dev:platform-api  # http://localhost:3000/health
npm run dev:game-server   # ws://localhost:2567
npm run dev:frontend      # http://localhost:5173
npm test                  # engine tests
npm run typecheck         # type checks for the backend
npm run build             # builds every workspace
```

The full stack in containers: `docker compose up --build`.

## Deploy (planned)

- **Backend:** images from `backend/Dockerfile` published to ECR and run on ECS (Fargate) behind an Application Load Balancer. The first public version's infrastructure is described in the roadmap (M2).
- **Frontend:** `npm run build -w @eldritch-alley/frontend` and `npm run deploy -w @eldritch-alley/frontend` (Cloudflare Workers with Static Assets).

## License

MIT. See [LICENSE](LICENSE).
