# Plan: EA-10 · Bot behavior: stop camping, add difficulty levels

**Milestone:** lot 3 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Requires:** EA-1 (line of sight in the bot's legal actions, via the engine); ADR 0011 (no-resource rule, reload score for mana)
**Created:** 2026-10-05
**Status:** ready for review

## 0. Findings (read in `backend/game-server/src/bot.ts`)

- **The camping cause is in the scoring, not in the strength.** `chooseBotAction` adds `endTurn` first, with score 0. A move only replaces the best candidate when it scores strictly more. A move scores only when it gets closer to the nearest enemy, climbs, or retreats while wounded. If none of those is possible (blocked by height, or no closer cell), every candidate ties at 0, and the bot ends its turn without moving. The same happens with no target in reach.
- **Attacks always win** (`hitChance × damage` > 0), so the bot only camps when it cannot attack.
- **No memory.** The bot has no notion of "turns without engaging", so nothing pushes it to advance.
- **No difficulty.** `chooseBotAction` always takes the best candidate.
- **Determinism** is held by the choice being a pure function of the state. Any random choice must come from a stream of its own (ADR 0005), not from the engine's rng.

## 1. Objective

The bot advances toward the enemy and the objective, and does not wait in a safe spot. Difficulty levels exist, and Easy is the default for new players. The bot's choices stay deterministic for a given seed.

## 2. Changes by layer

### Server (`backend/game-server`)

| File | Operation | What changes |
|---|---|---|
| `src/bot.ts` | modify | Scoring: `endTurn` is no longer the default. A move that gets closer adds a score, and a move that keeps distance while no enemy is in reach adds an advance score. The candidates order stays the tie-break order |
| `src/bot.ts` | modify | Input gains `idleTurns` (rounds since the bot last engaged). When `idleTurns ≥ 2`, moves toward the nearest enemy score a forced-advance bonus |
| `src/bot.ts` | modify | `chooseBotAction(state, team, options)` where `options` carries `difficulty` and `idleTurns` |
| `src/bot-random.ts` | create | Random stream for Easy: `createRng(seed ^ BOT_STREAM_SALT)`, separate from the match rng. Its use does not change the match's rng state |
| `src/battle-room.ts` | modify | Keeps `idleTurns` derived from the match events (an attack by the bot resets it). Passes the difficulty chosen for the match |
| Protocol and join options | modify | The difficulty is a join option, default Easy for new players. The server validates it |
| `src/bot.test.ts` (existing or create) | modify | Section 5 |

**Easy (decision D1).** On Easy, the bot takes one of the best N candidates (N = 3), chosen with the bot's own stream. On Normal, it takes the best one (today's behaviour, plus the anti-camping rules). The anti-camping rules apply on every level (the owner's rule).

**Determinism.** The stream is seeded from the match seed and a salt, so the same seed and the same state always give the same bot choices. Replays stay reproducible: they need the difficulty and the seed, both in the match setup.

### Client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| Join screen or title (file to confirm) | modify | Choice of difficulty, Easy by default, with the existing i18n |
| `src/protocol.ts` | modify | Join option `difficulty: 'easy' \| 'normal'`; protocol version bump with EA-14 if not already bumped |
| i18n catalogs | modify | Labels "Fácil" / "Normal", "Easy" / "Normal" |

## 3. Contract of the layer

- **`chooseBotAction(state, team, { difficulty, idleTurns, stream })`**: pure given its inputs. Returns a legal action (the engine validates each candidate, as today).
- **Advance rule**: a move that reduces the distance to the nearest enemy scores `closerMove`. When `idleTurns ≥ 2`, the same move scores `forcedAdvance` on top, so the bot moves even when no attack is possible. `endTurn` never beats a legal move that gets closer.
- **Easy rule**: among the candidates with the top N scores, the stream picks one. The pick is the only randomness.
- **Not done by this layer:** pacing of the bot's moves on the client (EA-9), the engine's rules.

## 4. Scoring details

| Term | Value (proposed) | Applies to |
|---|---|---|
| `closerMove` | 10 (as today) | any move that gets closer |
| `forcedAdvance` | 15 | a move toward the nearest enemy when `idleTurns ≥ 2` |
| `endTurn` | 0, no longer the default: it is the last candidate in the tie-break order | — |
| attack | `hitChance × damage` (as today) | any attack in reach and sight |

The tie-break order becomes: attack, then moves toward the enemy, then other moves, then endTurn. Two moves with the same score keep the order in `NEIGHBOUR_OFFSETS`.

## 5. Tests planned

Bot (`bot.test.ts`):
- [ ] Bot with an enemy 4 cells away and no closer cell reachable does not end its turn when another legal move exists (camping case). Today it ends.
- [ ] Bot with an attack in reach attacks (no change).
- [ ] Bot with `idleTurns` 2 moves toward the enemy even when a safe cell is available.
- [ ] Bot with `idleTurns` 0 keeps the current behaviour (no forced advance).
- [ ] Easy: over the seeds 1 to 50, the bot picks a non-best candidate at least once, and always a legal one.
- [ ] Normal: the bot always picks the best candidate.
- [ ] Same seed, same state, same difficulty: same action (determinism).
- [ ] The match rng is not advanced by the bot's Easy stream (the engine's `rng.state` is unchanged after the bot chooses).

Room (`battle-room` tests):
- [ ] `idleTurns` resets when the bot attacks, and grows by one per round without an attack.
- [ ] Difficulty from the join option reaches `chooseBotAction`.

Replay (integration):
- [ ] A bot match replays to the same final hash with the same seed and difficulty.

## 6. Dependencies

- EA-1 (line of sight is in the engine's validation, the bot inherits it).
- ADR 0011 and EA-14: the bot's reload score applies to mana; `attackDamage` loses its melee branch. Merge EA-14 first, or the bot changes there and here together.
- EA-9 (pacing) is independent.

## 7. Decisions (proposed, not yet confirmed)

- **D1. Easy:** choose among the best N = 3 candidates (recommended). Alternative: penalise the score with a fixed error (less natural, harder to explain).
- **D2. Default difficulty for new players:** Easy (ticket). Per match, chosen on join. The owner confirms that players who already played keep Normal, or the default changes for everyone.
- **D3. Idle threshold:** 2 rounds (proposed). Tune after playtest.

## 8. Out of scope

- Balance of classes (EA-11).
- Pacing (EA-9).
- Bot for PvP (M5).
- A planning bot (multi-turn search).
