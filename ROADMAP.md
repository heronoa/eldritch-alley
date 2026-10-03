# Delivery roadmap: Eldritch Alley: Tactics

Based on [pitch.md](pitch.md) (MVP scope) and the state of the repository.

## Current state

| Package | Status |
|---|---|
| `backend/engine` | Only `ENGINE_VERSION` and one test. No game rules implemented. |
| `backend/game-server` | Starts Colyseus over WebSocket, no rooms yet. |
| `backend/platform-api` | NestJS with `/health`. No database, no authentication. |
| `frontend` | Phaser with a boot scene that shows the title. |
| Infra | Docker Compose with Postgres, Redis, LocalStack and a single Dockerfile. |

Not yet built: combat rules, persistence, login, match client, CI.

## Order and principles

1. **Engine first.** Rules, height, line of sight and initiative are the core of the game. The server, platform and client depend on the engine API.
2. **Vertical slice early.** M2 delivers a complete match against the bot, even if rough and without accounts. This validates the game before investing in the platform.
3. **Bot before PvP**, as the pitch defines.
4. **Each milestone ends with something playable or verifiable**, not just finished code.
5. **Comparison MVP.** This project is being compared with another game (Wizard Battle) built to the same point. The end of M2 is the comparison point. Only the chosen project continues to M3 and later.

```mermaid
graph LR
  M0[M0 Foundation] --> M1[M1 Minimal engine]
  M1 --> M2[M2 Playable match vs bot]
  M2 -->|comparison point| M3[M3 Rules and content]
  M3 --> M4[M4 Accounts and persistence]
  M4 --> M5[M5 Ranked PvP]
  M5 --> M6[M6 Release]
```

Parallel track: once the event API from M1 stabilizes, the client can be developed against a mocked server while the game server is built.

## Decisions

The decisions below are recorded as ADRs in [docs/adr/](docs/adr/).

| Decision | Milestone | ADR |
|---|---|---|
| Individual initiative | M1 | [0001](docs/adr/0001-individual-initiative.md) (Accepted) |
| One resource per class | M3 | [0002](docs/adr/0002-one-resource-per-class.md) (Accepted) |
| Permanent death within a match | M1 | [0003](docs/adr/0003-permanent-death.md) (Accepted) |
| PvP turn timer (30 s hypothesis) | M5 | [0004](docs/adr/0004-pvp-turn-timer.md) (Proposed) |
| Deterministic engine with integer math | M1 | [0005](docs/adr/0005-deterministic-integer-engine.md) (Accepted) |
| NestJS 11 instead of 12 | M4 | [0006](docs/adr/0006-nestjs-11.md) (Accepted) |

Open, with no ADR yet: whether the setting shares the Magia Urbana universe. It does not affect code. It affects names, tone and art, and must be decided before M3 (content).

## Milestones

Sizes are relative (P, M, G) and have no dates, because they depend on team availability.

### M0. Foundation (P, nearly done)

- [x] Monorepo with workspaces, scaffolds and Docker Compose.
- [x] Project renamed to `eldritch-alley`, documentation and comments in English.
- [x] Architecture decisions recorded in `docs/adr/`.
- [x] `CLAUDE.md` with the project rules.
- [ ] CI with typecheck, test and build on every pull request.

**Done when:** CI is green on every pull request, and the ADRs are merged.

### M1. Minimal engine (G, critical)

- 8×8 grid with a height level per cell (ground, first floor, rooftop).
- Movement with a cost per height and a limit on climbed levels per step, per class.
- Initiative by speed, with deterministic tie-breaking, and the initiative queue as public state (ADR 0001).
- A basic attack with range.
- Randomness only from a seed, with no `Math.random`, `Date` or clock (ADR 0005).
- Each accepted action produces an event. A function `applyEvents(seed, events)` rebuilds the final state.
- Integer math only (ADR 0005).

**Done when:** a hash test shows that the same seed and the same actions always produce the same final state, and the engine has no framework or I/O dependencies.

### M2. Playable match against the bot (G). Comparison point.

Infrastructure is a proposal and needs approval before any resource is created.

- Map 8×8 with three height levels, with the three MVP classes (Sniper, Wizard, Priest) as configuration.
- Client with Phaser and the Colyseus client: pick three units, play against the bot, see the grid with height, move and attack with clicks, initiative queue and action log. Placeholder art.
- `BattleRoom` in the match server: creates the match, applies actions with the engine, sends only the differences.
- Bot with a utility heuristic: attack the weakest target in range, seek height, retreat when health is low.
- No login and no persistence. Anonymous session identity.
- Published version:
  - Frontend on Cloudflare Workers with Static Assets.
  - One match-server instance on AWS, proposed as a small EC2 instance running Docker Compose.
  - Public access through a Cloudflare Tunnel at a subdomain such as `game.<domain>`, with TLS handled by Cloudflare. The client connects with `wss://`. The instance has no inbound ports open to the internet.
  - Verification before the milestone is considered done: test a real WebSocket connection through the tunnel, including the idle timeout, which Cloudflare closes after a period without traffic. Colyseus heartbeats must keep the connection alive.

**Done when:** a complete match is played in the browser until one side is eliminated, on the published version. The comparison with Wizard Battle is decided here.

### M3. Rules and content (G). Only if this project is chosen.

- Line of sight and cover (walls, crates, cars), using an integer algorithm (ADR 0005).
- Direction bonus: attacks from behind and from the flank.
- Height advantage: range and accuracy.
- Resources: ammunition with reload, and mana with regeneration, one per class (ADR 0002).
- Abilities and classes read from data, not hard-coded in the engine.
- Balancing of the three classes.
- Map with contested high points, cover and at least two routes between the sides.
- Playtest: at least ten matches against the bot, with recorded adjustments.
- Universe decision, before this milestone's content.

**Done when:** playtest matches end with varied winners, not one dominant strategy, and the playtest is documented.

### M4. Accounts and persistence (G)

- `platform-api` with MikroORM and PostgreSQL: players, matches and events.
- Sign-up and login with a JWT issued by NestJS. The match server validates the token when joining a room.
- Choosing the three units before the match (no roster management).
- When a match ends, the match server publishes "match ended" with the events to a queue (SQS on LocalStack). The platform-api consumes it and stores the match.
- Replay endpoint and a replay screen in the client, using the same engine.
- Reconnection in the middle of a match.

**Done when:** a replay built from the stored events produces the same final state as the live match, and a match survives a client disconnection.

### M5. Ranked PvP (G)

- Matchmaking queue in Redis, pairing by rating with a range that widens over time.
- When paired, the match server creates a room with two human players.
- Turn timer (ADR 0004), with rules for disconnection and inactivity.
- Asynchronous rating update: the platform-api consumes "match ended" and updates the rating (simple Elo or Glicko).
- Colyseus presence and driver on Redis, so more than one match-server instance can run.

**Done when:** two players on different browsers find each other through the queue, play a match and see the rating updated afterwards.

### M6. Release (G)

- Backend: images in ECR, running on ECS Fargate behind an Application Load Balancer, with autoscaling.
- Frontend: Cloudflare Workers with Static Assets.
- Basic observability: structured logs, health checks for both services, match and error counts.
- Security: secrets kept out of the repository, rate limiting on actions, all validation on the server.
- End-to-end tests of a match against the bot and of a PvP match.
- Open playtest with a few players, collecting feedback.

**Done when:** two outside players can join, play PvP and finish the match without intervention.

## Out of the MVP

Class progression and unlocking advanced classes, roster management, secondary abilities, PvE campaign, more maps, equipment and 3D visuals. These go into a later roadmap, after feedback from M6.

## Risks

- **Engine scope.** Height, line of sight and cover together are the hardest part. Mitigation: M1 has the minimum rules, and M3 adds the rest once real matches exist.
- **Determinism.** Any use of time, object ordering or randomness outside the seed breaks verification. Floating-point math breaks it across runtimes. Mitigation: integer math only (ADR 0005), and the hash test in CI from M1.
- **Isometric client.** It can take longer than expected. Mitigation: placeholder art until M3.
- **Balancing.** It needs playtests, and the time they take is often underestimated. Mitigation: time reserved in M3.
- **Tunnel and WebSockets.** Cloudflare Tunnel and long-lived connections may behave differently than expected. Mitigation: the verification listed in M2 comes before the milestone is closed.
- **Universe.** A late decision causes rework in names and art, not code. Mitigation: decide before M3.
