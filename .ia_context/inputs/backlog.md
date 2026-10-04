# Backlog — features queued

Features we will build, not compromises we left behind. Each item keeps its `DT-` id so plans and the debt list still resolve. The debt list ([technical-debt.md](./technical-debt.md)) holds only what we chose to leave behind. An item moves here when it is planned work, and moves out of here when it becomes a plan.

Order follows the roadmap: [ROADMAP.md](../../ROADMAP.md).

---

### DT-04 · Per-client state filtering for hidden items
- **Category:** Security
- **Risk if untreated:** the identity of an unknown item dropped on the map would reach clients before pickup, breaking the post-MVP rule.
- **Effort:** M
- **Trigger:** implementing equipment drops (post-MVP).
- **Evidence:** `backend/engine/src/match.ts`, `publicState`. It filters only the rng; there is no per-viewer filter.

### DT-05 · Resurrection needs its implementation
- **Category:** Rules
- **Risk if untreated:** resurrection (two steps, ADR 0003 addendum) is not implemented. Bodies occupy their tiles (implemented in M1, round counter included), so the engine is ready for it.
- **Effort:** M
- **Trigger:** implementing resurrection (M3).
- **Evidence:** `docs/adr/0003-permanent-death.md` addendum; `backend/engine/src/corpses.test.ts`.

### DT-15 · Balance values are fixtures only
- **Category:** Design
- **Risk if untreated:** movement budgets, attack and hit values exist only in tests. Real values come with M3 balancing.
- **Effort:** M
- **Trigger:** M3 balancing.
- **Evidence:** `backend/engine/src/*.test.ts` fixtures.

### DT-17 · Reaction windows, slots and counter-attacks in the engine
- **Category:** Rules
- **Risk if untreated:** reactions (counterspell, counter-attack) are decided (ADR 0007) but cannot be played yet. The engine has no reaction window, no reaction slots and no pending-response state.
- **Effort:** M
- **Trigger:** M3, before reaction skills are added.
- **Evidence:** `docs/adr/0007-reaction-abilities.md`; the M1 engine has no reaction code.

### DT-54 · Movement is one tile per action; there is no pathfinding
- **Category:** Architecture (design)
- **Risk if untreated:** the owner cannot cross the board in one move, and the move range is not shown. The engine refuses any step that is not adjacent.
- **Effort:** G
- **Trigger:** decision between options A (client path, one message per step), B (engine path action, protocol bump) and C (engine `reachableCells`, one action); and whether allies block passage.
- **Evidence:** `backend/engine/src/actions.ts:96` (`not-adjacent`); `frontend/src/game/selection.ts` (`chebyshev(...) === 1`).

### DT-55 · Tiles that hide units are not faded
- **Category:** Architecture (design)
- **Risk if untreated:** a unit behind a raised block cannot be seen. Known limit, recorded in the isometric plan.
- **Effort:** M
- **Trigger:** playtest shows units lost behind blocks.
- **Evidence:** `.ia_context/plans/iso-board.index.md` (decision 4); `frontend/src/scenes/BoardTiles.ts`.

### DT-56 · No audio in the client
- **Category:** Architecture (design)
- **Risk if untreated:** effects such as the sniper's bolt click and the impacts are silent. Known limit of the identity and title plans.
- **Effort:** M
- **Trigger:** the first audio plan.
- **Evidence:** `.ia_context/plans/visual-identity-m2-integration.plan.md` (section 9); no audio file or loader in `frontend/`.

### DT-57 · Mana pips are not drawn; the engine has no mana
- **Category:** Architecture (design)
- **Risk if untreated:** wizards and priests show no resource on the board. Known limit.
- **Effort:** G
- **Trigger:** mana reaches the engine (ADR 0002, M3).
- **Evidence:** `frontend/src/view/unit-look.ts` (`pipsFor` returns `null` for magazine `null`); `.ia_context/plans/visual-identity-m1-logic.plan.md` (section 9).

### DT-58 · Sprites have no back view
- **Category:** Architecture (design)
- **Risk if untreated:** a unit walking away from the camera still shows its face. Known limit of the characters handoff.
- **Effort:** M
- **Trigger:** the first view of a unit facing away from the camera in a playtest.
- **Evidence:** `.ia_context/prototypes/eldritch-alley-characters-v1/README.md` ("Only the front view exists").
