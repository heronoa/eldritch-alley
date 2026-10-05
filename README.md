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

### Configuration

The backend services read the root `.env` (copied from `.env.example`). The frontend reads its own files in `frontend/`: `.env.production` for builds, which is committed, and an optional `frontend/.env` for dev, copied from `frontend/.env.example`. Only the `VITE_` keys reach the browser bundle.

| Variable | Read by | Default | Notes |
|---|---|---|---|
| `GAME_SERVER_PORT` | game-server | `2567` | Must be 1–65535 |
| `PLATFORM_API_PORT` | platform-api | `3000` | Must be 1–65535 |
| `VITE_GAME_SERVER` | frontend | `ws://localhost:2567` under `vite dev` | Required in builds. Production value is in `frontend/.env.production` |
| `JWT_SECRET` | docker compose | none | Required by `docker compose up`. A secret: never give it the `VITE_` prefix, or it reaches the bundle |

## Deploy (planned)

- **Backend:** images from `backend/Dockerfile` published to ECR and run on ECS (Fargate) behind an Application Load Balancer. The first public version's infrastructure is described in the roadmap (M2).
- **Frontend:** `npm run build -w @eldritch-alley/frontend` and `npm run deploy -w @eldritch-alley/frontend` (Cloudflare Workers with Static Assets).

## License

MIT. See [LICENSE](LICENSE).
