# Index — Secondary abilities: camouflage, mud and resurrection

**Created:** 2026-10-17
**Roadmap:** [ROADMAP.md](../../ROADMAP.md) § M3. Rules and content (delivered 2026-10-14); this is a
post-M3 content pass, not a new roadmap milestone
**Branch:** `feat/secondary-abilities`
**Status:** pending — waiting for the owner's approval of this index and m1

## What this delivery covers

Each existing class gains a second active ability: the Sniper becomes untargetable for three of its
own turns with **Camouflage**, the Wizard turns a 3×3 area into **Mud** that doubles the cost of
entering it and can knock a unit **Prone**, and the Priest brings a fallen ally back with
**Resurrection** while its body is still on the map. The three existing abilities stay exactly as they
are; the second slot stops being decorative.

The delivery reaches every layer the game already has. The engine learns three new effect kinds, two
per-unit statuses and a separate difficult-terrain layer that leaves the board immutable. The match
server authors the three definitions, fills the second active set, teaches the bot to weigh the new
plays, and carries the new action, state and events over protocol 11. The client lists both slots,
aims the self-cast and the two-step revival, and draws the white camouflage silhouette, the prone
sprite and the mud overlay. ADR 0023 records the rules and amends ADR 0016 where this delivery makes
a second effect set and a second active set real.

## Milestones

### Backend

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [secondary-abilities-m1-engine.plan.md](./secondary-abilities-m1-engine.plan.md) | [ ] pending | — |
| 2 | [secondary-abilities-m2-server-protocol.plan.md](./secondary-abilities-m2-server-protocol.plan.md) | [ ] pending | — |

### Frontend

| # | Plan | Status | PR |
|---|------|--------|----|
| 3 | [secondary-abilities-m3-client-logic.plan.md](./secondary-abilities-m3-client-logic.plan.md) | [ ] pending | — |
| 4 | [secondary-abilities-m4-client-visual.plan.md](./secondary-abilities-m4-client-visual.plan.md) | [ ] pending | — |

m1 is a backend vertical slice that owns the rules, the replay and ADR 0023. m2 is the data and
transport slice: the catalog, the second slot, the bot and protocol 11, including both protocol
mirrors so the client builds against a frozen contract. m3 is the client's pure logic: the menu, the
aim, the two-step revival, the highlight, the log and the words. m4 is the scene integration and the
visual pass: the glow, the rotation, the mud overlay and the manual checks.

The owner chose four milestones (decision 14A). The PR column fills when a PR opens. All four can
share `feat/secondary-abilities`; the commit groups below keep each milestone reviewable on its own.

## Decisions taken (owner, 2026-10-17)

| # | Question | Answer |
|---|---|---|
| P1 | What happens to the existing abilities | **They stay.** Each class keeps its current first-slot ability and gains the new one in the second slot. The engine reads both active sets and the menu lists both rows |
| P2 | How each ability is aimed | **Camouflage is self-cast**: range 0, no sight, the only legal cell is the caster's. **Mud targets a cell.** **Resurrection follows the two-step rule** of the pitch: choose the fallen ally, then the free cell |
| P3 | Who mud affects | **Everyone, the caster and its allies included.** No stacking: a recast refreshes the cells it covers. It can be cast on an occupied cell. The step cost reads the **destination** cell |
| P4 | When prone rolls | **Only when entering a mud cell.** Starting a turn on mud does not roll. A prone unit is targetable and occupies normally; only the sprite changes |
| P5 | Whether healing breaks camouflage | **No.** A heal is not an attack. Only basic attacks and damaging abilities roll the break |
| P6 | Plan shape | **An index with four milestones**, and **ADR 0023 written before the code** |
| 1A | Camouflage duration | **Three of the Sniper's own turns, the activation turn included.** It expires at the end of the third |
| 2A | What camouflage protects against | **Only basic attacks are refused** against a camouflaged unit. Damaging abilities still reach the cell and hit it |
| 3A | When the 30% break rolls | **Every basic attack and every damaging ability the camouflaged unit uses**, hit or miss. The action resolves normally and the break applies after |
| 4A | Mud geometry and duration | **Range 3, radius 1 (3×3), 3 rounds**, expiring at the start of round R+3 when cast in round R |
| 5A | The difficult-terrain cost | **The full step cost doubles, climb included.** A flat step costs 2; a one-level climb at the default profile costs 4; a two-level climb costs 6 |
| 6A | When prone rolls | **20% on every step that enters a mud cell.** On success the walk stops on that cell and the turn ends immediately; the engine's path is truncated there |
| 7A | What prone costs | The current turn ends immediately. On its next turn the unit starts standing, with `floor(movement / 2)` movement and a normal action. The sprite lies down between the two turns |
| 8A | How resurrection is played | **Two steps on the screen, one engine action**: choose the fallen ally, then a free cell in range. The cell cannot hold a living unit or a body. The body is consumed and the unit appears on the chosen cell. Range 3, no sight |
| 9A | What a revived unit brings back | **Full HP; the pool exactly as it was at death.** Nothing else is restored |
| 10A | Where the revived unit enters the turn order | **At its speed position in the initiative.** It can act in the current round if that position has not passed; otherwise it waits for the next round |
| 11A | Resurrection and game over | **Game over stays immediate.** Resurrection works only while the Priest is alive and a body exists. If the Priest dies, the match ends; nothing waits for his turn |
| 12A | Whether the bot uses the new abilities | **Yes, all three** |
| 13 | — | Covered by 3A |
| 14A | Plan shape | **An index with four milestones, by layer** (see above) |

## Implementation choices to review before m1

These are the small decisions the approved rules do not spell out. None of them changes the product
behaviour above; they are listed here so the plan is executable without a silent assumption. The owner
can overturn any of them before m1 starts.

| # | Choice | Effect and alternative |
|---|---|---|
| I1 | **Mud needs sight** (`needsSight: true`) | It is an aimed spell like Fireball. Alternative: no sight, so the Wizard can deny a cell behind a wall. This is not in the approved answers and is the one choice worth a second look |
| I2 | **Mud expiry is per cell** | A cast writes one expiry per covered cell; a recast on a covered cell refreshes it instead of stacking. Non-overlapping casts coexist. This is what P3's "a recast refreshes" means in the state |
| I3 | **The body can be anywhere on the map** | The pitch's two-step rule puts the range on the destination tile, not on the body. A Priest can call a distant body to a free tile within 3; the alternative is to require the body itself to be in range |
| I4 | **The break roll comes first** | The 30% roll happens before the action's own rolls, and the action's `rngState` covers both. `camouflage-ended` is emitted after the resolution. This is 3A read literally |
| I5 | **`moved` carries the terrain outcome** | The event gains `rngState` and `prone`; there is no separate prone event. The truncated path is the event's path. This keeps one move one event |
| I6 | **Statuses and terrain live in the match state** | `UnitState` gains `camouflage` and `prone`; the match gains `difficultTerrain`. No database column and no board mutation |
| I7 | **The ability menu grows to two rows** | `ABILITY_MENU_ROWS` becomes 2 and the panel height follows. The row hit-test already loops over the constant |
| I8 | **The unit sheet is unchanged** | The player reads the status from the white silhouette, the lying sprite, the log and the ability menu. A status row in the sheet would be a new design and is not needed |
| I9 | **The bot's weights are provisional** | 12A asks the bot to use the abilities, not to play them perfectly. The weights are named constants and are tuned in playtest |
| I10 | **Stored replays are not migrated** | The new state fields change the final hash and the `moved` payload. The history lists matches but does not replay them yet, so no player-facing break; new matches record the new shape |
| I11 | **The client keeps a deterministic fallback** | When no menu row is armed, the client still falls back to `activeSets[0]` for callers that never opened the menu. The menu is the only way to choose the second ability |

## Rules in one glance

| Class | Ability | Cost | Range | Sight | Effect |
|---|---|---|---|---|---|
| Sniper | `camouflage` | 3 ammunition | 0 (self) | no | camouflage, 3 own turns, 30% break |
| Wizard | `mud` | 1 mana | 3 | yes (I1) | difficult terrain, radius 1, 3 rounds |
| Priest | `resurrection` | 3 mana | 3 (to the free cell) | no | revive a fallen ally at full HP |

The existing `piercing-shot`, `fireball` and `area-heal` keep their slots and numbers.

## Scope

- The engine rules: the three effect kinds, the two statuses, the difficult-terrain layer, the
  resurrection action, the replay and hash, and ADR 0023.
- The server: the three catalog entries, the second active set, the bot's candidates and scores,
  protocol 11 and both mirrors.
- The client logic: two-row menu, self-cast and two-step aim, hidden-target refusal, difficult-terrain
  preview through the engine, log and i18n.
- The client visuals: the pulsing white silhouette, the 90° prone sprite, the mud overlay, the
  two-step guidance, and the manual verification.

## Out of scope

- **More than one new ability per class**, new classes, or a change to the existing three.
- **Reactions (ADR 0007), Silence, and the rest of the pitch's ability list.** This delivery is the
  three abilities the owner asked for.
- **Board mutation.** Mud is a separate state layer; the board and its props stay immutable.
- **Other terrain kinds** (fire, ice, healing ground) and terrain that changes height or props.
- **Forced movement and knockback.** Prone is caused by the walk, not by a push.
- **Cooldowns, charges, upgrades or per-match uses.** A recast is allowed and refreshes.
- **Reviving a permanently dead unit**, partial-HP revival, or a revival that outlives the Priest.
- **A new game-over rule.** 11A keeps the immediate end.
- **Persistence.** Statuses and terrain live in the match state; no table, no column, no migration.
- **Replay migration.** Stored old matches are not re-hashed or replayed (I10).
- **A perfect bot.** Its weights are provisional (I9).
- **A replay UI or a new HUD status panel.** The existing log, menu and sprites carry the information.
- **Rewriting the unit sheet** (I8).

## Test strategy

| Case | Where | Why there |
|---|---|---|
| Camouflage, terrain, prone, resurrection, replay and hash | `backend/engine` | The rules are pure, deterministic and integer-only |
| Catalog validation, the second slot, the bot, protocol 11 | `backend/game-server` | The data and the heuristic live there |
| A whole bot match carrying all three abilities, replayed from its events | `backend/game-server/src/integration.test.ts` | The server is the only place that owns a whole match |
| Menu rows, two-step aim, hidden target, highlight, log and i18n parity | `frontend` unit tests | The logic is pure and the repo has no DOM test runner |
| Glow, rotation, mud overlay, two-step guidance, phone width | manual, in m4's pre-review | The repo has no visual test infrastructure; the same gap the account work has |

## ADR 0023

**Statuses, difficult terrain and resurrection**, written in m1 before the code. It records:

1. The engine reads both active sets; a class may carry two abilities.
2. Three new `AbilityEffect` kinds join the union: `camouflage`, `terrain`, `revive`.
3. `UnitState` gains `camouflage` and `prone`; `MatchState` gains `difficultTerrain`.
4. Difficult terrain doubles the full step cost and is checked by the movement search and by replay.
5. Prone ends the current turn and halves the next turn's movement.
6. Camouflage is untargetable by basic attacks, is broken by its own damaging actions, and counts the
   caster's own turns.
7. Resurrection is one action with a target and a destination; the body must exist; the unit returns
   at full HP with its pool; it re-enters by speed.
8. Every new roll is in an event; replay never rolls again.
9. Protocol 11.
10. The engine still knows no class or ability name.

It amends ADR 0016's "two kinds and no more", its "only the first active set is read" and its
board-immutability consequence (terrain is not board mutation). It records the implementation of the
two-step resurrection ADR 0003 and the pitch already define. ADR 0016 itself is not rewritten; the
README gains the 0023 row.

## Dependency notes

- **m1 depends on nothing external.** It writes ADR 0023 first; the engine work starts once the ADR
  is accepted.
- **m2 depends on m1 approved.** It can be written against m1's branch, but the engine types and the
  event shapes must be frozen. It also freezes protocol 11 in both mirrors, so m3 has a contract.
- **m3 depends on m2's protocol frozen**, not on m2 merged. Its tests build `PublicState` values by
  hand, so it can start while m2 is in review.
- **m4 depends on m3 approved.** The scene wiring reads the logic m3 tested.
- The plan runner must check the status of each milestone before starting the next, as the workflow
  requires. A milestone in review blocks the next one; the owner can override explicitly.

## Protocol and replay compatibility

`PROTOCOL_VERSION` goes from 10 to 11 because the client action gains an optional `target`, the state
gains `camouflage`, `prone` and `difficultTerrain`, the event union gains `camouflage-ended`,
`stood-up`, `terrain-expired` and `revived`, `moved` gains `rngState` and `prone`, and the refusal
union gains `target-hidden`. The server rejects any message whose version is not 11, which is the
existing rule.

The stored match events are opaque to the platform, and the platform stores the final hash from the
server. The new state fields change that hash, and the new `moved` payload is not the old one. No
stored replay is re-verified today and the history screen only lists summaries, so there is no data
migration in this delivery; old matches are left as they were recorded (I10).

## Commit groups (proposal for when the work is done)

The owner writes and pushes every commit. When the work is ready, the changes split naturally into:

1. `docs(adr): record statuses, terrain and resurrection` — ADR 0023 and the README row.
2. `feat(engine): add camouflage, difficult terrain and resurrection` — engine types, rules, events,
   movement, initiative and tests.
3. `feat(server): ship the second ability per class` — catalog, map, bot, protocol 11 and tests.
4. `feat(client): offer both ability slots and the two-step revival` — menu, selection, highlight,
   actions, log, i18n and tests.
5. `feat(client): draw camouflage, prone and mud` — sprite, overlay, scene, theme and manual checks.

The exact split follows the final diff; the milestones above are also the review boundaries.
