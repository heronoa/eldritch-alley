# Plan — Playable match against the bot, local (M2)

**Milestone:** M2 in [ROADMAP.md](../../ROADMAP.md), in two steps: **M2-a** (code, local) and **M2-b** (deploy). The comparison point with Wizard Battle is the end of M2-b.
**Created on:** 2026-10-03
**Status:** pending approval. Nothing here is applied yet.

---

### 1. Objective

A complete match, played in the browser against the bot, running locally. The match server runs the engine from `@eldritch-alley/engine` through its public contract only. The client only requests actions and draws the public state. Ends when one side has no living unit.

### 2. Decisions taken

| Topic | Decision | Source |
|---|---|---|
| Abilities | Only the basic attack. Sniper, Wizard and Priest differ by data: range, health, movement, attack, speed | Owner, M2 questions |
| Colyseus | Migrate to 0.18 at the start of M2, with an ADR. This closes the server-path high advisory (DT-08) | Owner |
| Identity | Anonymous session id issued by the server on connection. No login, no secret. JWT comes in M4 | Owner |
| Deploy | Stays in M2 as **M2-b**, after M2-a is merged. Every cloud resource needs its own approval | Owner |
| Reconnection | On return, the server sends the full public state. No event replay | Owner |
| Turn timer | None against the bot in M2. The 30 s timer (ADR 0004) comes with PvP in M5 | Owner |
| Client scope | Grid with coloured tiles by height, units as labelled shapes, click to select, move and attack. No artwork | Owner |
| Bot | Utility heuristic from the pitch: attack the weakest target in range, seek height, retreat with low health | Roadmap |
| Ammunition | Sniper has a magazine. An attack spends one round. Reload fills the magazine and costs the action only. With an empty magazine, the attack becomes a melee attack at half damage, rounded down | Owner, ADR 0002 addendum |
| Roster | Sniper, Wizard and Priest, as before. Assaulter is data for M3 and is not in the M2 roster | Owner |
| Magic basic attack | Costs no mana in M2 | Owner |

### 3. Split into M2-a and M2-b

- **M2-a** (this plan): code only, local. Ammunition for the Sniper is already implemented and lands in the M1 commit (ADR 0002 addendum), so it is not part of this plan. Done when a complete match is played against the bot in the browser, and a forced disconnect is recovered.
- **M2-b** (separate plan, after M2-a is merged): frontend on Cloudflare Workers, one EC2 instance, the Cloudflare Tunnel, and the tunnel tests (DT-13). The DT-08 gate is already satisfied by the Colyseus 0.18 migration in M2-a.

The roadmap already records this split.

### 4. Files

| File | Operation | What changes |
|---|---|---|
| `docs/adr/0008-colyseus-0.18.md` | create | Why Colyseus moves to 0.18 now; what the migration changes; closes the server-path advisory |
| `backend/game-server/package.json` | modify | Colyseus packages to 0.18 |
| `backend/game-server/src/main.ts` | modify | Server bootstrap on 0.18 API; registers `BattleRoom` |
| `backend/game-server/src/battle-room.ts` | create | Room: one match per room; holds the engine state; validates each client message against the actor's session; applies accepted actions; broadcasts the public state and events; runs the bot's turns |
| `backend/game-server/src/session.ts` | create | Maps a session id to its team; issues session ids on connect |
| `backend/game-server/src/bot.ts` | create | Utility heuristic. Pure function from public state to an action |
| `backend/game-server/src/*.test.ts` | create | Tests in section 6 |
| `frontend/src/net/client.ts` | create | Colyseus client: connect, join, send actions, receive state, reconnect |
| `frontend/src/scenes/MatchScene.ts` | create | Draws the grid, units and log; handles clicks |
| `frontend/src/scenes/LobbyScene.ts` | create | Team selection and "play against the bot" |
| `frontend/src/scenes/BootScene.ts` | modify | Starts the lobby |
| `frontend/src/view/grid.ts` | create | Pure functions: cell ↔ pixel, colour by height, hit testing |
| `frontend/src/*.test.ts` | create | Tests in section 6 |
| `frontend/package.json` | modify | Colyseus client package; test runner for the pure view logic |
| `ROADMAP.md` | modify | After the owner confirms section 3 |

No engine source changes are planned. If the engine needs a change, it stops and comes back here as a new decision.

### 5. Contracts

**Client to server messages** (`action`): payload is an `Action` from the engine, without `actor`. The server adds the actor from the session. A client cannot choose the actor.

**Server to client:**
- `state`: the public state (`publicState`), sent on join, on each accepted action, and on reconnection.
- `events`: the events of the last accepted action, for the log.
- `rejected`: the reason of a refused action, sent only to the client that sent it.

**Session.** Connecting issues a session id. Joining a room with that id attaches the session to its team. Reconnecting with the same id reattaches it and gets the full public state.

**Bot.** Given the public state, `chooseBotAction(state, botTeam)` returns one legal action. It is a pure function, deterministic for a given state. It never reads `rng`.

**Match end.** When `isGameOver` is true, the room broadcasts `ended` with the winning team and stops accepting actions.

### 6. Tests planned

**Game server**
- [ ] A client message with an action whose actor belongs to another team is rejected. The state does not change.
- [ ] An accepted action broadcasts `state` and `events` to both clients.
- [ ] A rejected action sends `rejected` to the sender only, and nothing to the other client.
- [ ] A reconnect with the same session id receives the full public state, and its team is restored.
- [ ] A reconnect with an unknown session id is refused.
- [ ] The bot plays its turns, and the match ends with `ended` when one team has no living unit.
- [ ] The bot never returns an illegal action: every action it returns is accepted by `validateAction` on the same state.
- [ ] The bot is deterministic: the same public state gives the same action.
- [ ] A full bot-versus-bot match on a fixed seed ends, and the server state equals `applyEvents` over the broadcast events (replay consistency).

**Client**
- [ ] Cell to pixel and pixel to cell are inverses for every cell of the 8×8 grid.
- [ ] Colour by height: each level maps to a distinct colour.
- [ ] Clicking a tile holding a unit selects it; clicking a legal target after selection sends an attack; clicking an adjacent empty tile sends a move.
- [ ] A rejected action shows its reason in the log and leaves the selection in place.
- [ ] After a forced disconnect, the client reconnects with its session id and redraws from the `state` it receives.

**Acceptance (manual, local, M2-a)**
- [ ] A complete match is played in the browser against the bot until one side is eliminated.
- [ ] A forced disconnect in the middle of the match is recovered by reconnecting.

**Deploy (M2-b, separate plan)**
- [ ] The tunnel tests in the roadmap (idle connection, reconnection through the tunnel) are recorded.

### 7. Dependencies

- M1 engine merged to `develop`.
- Owner approval of section 3 (roadmap change).
- Colyseus 0.18 migration (ADR 0008) is the first task; the rest depends on it.

### 8. Out of scope

- Abilities beyond the basic attack (M3).
- Reactions and the reaction window (M3, DT-17).
- Line of sight, cover, facing bonus, height advantage (M3).
- Login, accounts, persistence, replays in the UI (M4).
- PvP, matchmaking, turn timer (M5).
- EC2, Cloudflare Tunnel, Workers deployment, and the tunnel tests: M2-b, its own plan.
- Artwork and isometric rendering (later, after the comparison).

### 9. Points to confirm before applying

1. **Comparison point.** The roadmap puts the Wizard Battle comparison at the end of M2-b, the published version. Confirm, or move it to the end of M2-a.
2. **Colyseus 0.18 API.** The migration is the first task. If 0.18 changes the room lifecycle in a way that breaks the session design, the plan returns here before the room is written.
