# CLAUDE.md

## Project

Eldritch Alley: Tactics is a turn-based tactical RPG for the browser. Squads of soldiers, initiates and adepts fight across an urban map with height: rooftops, fire escapes, alleys, overpasses. The server decides everything, and any match can be replayed action by action.

The design is in [pitch.md](pitch.md), the delivery plan is in [ROADMAP.md](ROADMAP.md), and the accepted decisions are in [docs/adr/](docs/adr/).

## Structure

```
backend/
  engine/         deterministic battle engine (pure TypeScript)
  game-server/    Colyseus: match rooms, state sync, bot
  platform-api/   NestJS: accounts, rosters, rating, replays, matchmaking
frontend/         Phaser + Vite, published as static assets on Cloudflare
docs/adr/         architecture decision records
.ia_context/      AI-assisted planning artifacts (see its README)
```

## Rules

1. `backend/engine` imports nothing from frameworks or I/O.
2. The server is the authority over every action. The client only requests actions and draws the state.
3. The engine is deterministic and uses integer math only (ADR 0005).
4. For non-trivial tasks, plan first and wait for approval before applying changes.
5. Keep diffs small and focused on one subject.
6. Everything in the repository is written in English. Conversation with the owner is in Portuguese.

## Precedence

When sources disagree: accepted ADR > `CLAUDE.md` > plans.
