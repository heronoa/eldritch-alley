# MR — Cover, facing, height advantage and abilities as data (M3, slices 1–3)

**Branch:** `feat/rules-and-content`
**Base branch:** `develop`
**Milestone:** M3 · Rules and content — m3-01 (cover), m3-02 (facing & height advantage), m3-03 (mana regeneration & abilities), plus the owner's follow-ups EA-15 (cover on the screen) and EA-16 (the ability on the screen)
**Ticket(s):** m3-01, m3-02, m3-03, EA-15, EA-16
**Date:** 2026-10-13

---

### 1. What this MR delivers

Three rules the pitch promised and had no code for now exist: a `wall` prop blocks the line of sight and a `cover` prop lowers the chance to hit whoever stands beside it (never under their own feet); an attack from the flank or the rear hits harder, and an attack from higher ground reaches further and lands more often; and a class is no longer a stat line plus one basic attack — each of the three carries one active ability, read from data the catalog travels with the match, and mana comes back by one point at the start of a turn instead of only through meditation. All four modifiers (cover, direction, height, and whichever an ability uses) fold into the one function that already decided a hit, `resolveHit`, so a replay of any match still reproduces the exact same rolls. On the screen, a unit beside cover now carries a badge naming which side protects it, the debug diamonds became a toggle ("Highlight Covers"), the battle log names a shot's cover on both ends, and the ability button opens a menu naming each class's ability, its cost and its effect before the player aims it — closing the three complaints the owner raised while playing the earlier builds ("não dá pra selecionar qual spell usar", no cost shown, no animation on impact).

Implementation followed the five approved plans (m3-01, m3-02, m3-03, EA-15, EA-16) closely, with two divergences worth naming:

- **The ADR numbers shifted from what m3-02 and m3-03 proposed.** EA-15's "a prop under the feet gives no cover" fix landed *before* m3-02, and claimed ADR 0013 for itself. Facing and height, planned as 0013/0014, shipped as **0014/0015**; abilities and mana regeneration, planned as 0015/0016, shipped as **0016/0017**. The decisions themselves are unchanged — only the numbers moved, and `docs/adr/README.md` reflects the order they were actually accepted in.
- **m3-02's D3 (a facing control in the dashboard) was not delivered.** The engine supports a player-initiated turn exactly as planned — the `face` action and its own `faced` event exist in `backend/engine/src/types.ts` and are covered by `facing.test.ts` — but nothing carries it past the engine: it is absent from `action-shape.ts` (so the server would reject it even if sent), from both `protocol.ts` files, and from every frontend scene. A unit's facing today is set only as a side effect of the direction it last moved or attacked in; a player cannot turn a unit on purpose without acting. This narrows what "An attack from the flank or from behind it hits more often" means in practice: flanking happens to whichever side a unit was last facing, not a side the player chose to expose or protect.

Everything else matches the plans at the level of detail they specified: the cover table is exactly decision m3-01/D1-A (`tower` walls; `car`, `crates`, `dumpster`, `moto`, `ac`, `vent`, `fountain`, `bench` as cover; the rest decoration), the three ability definitions are exactly m3-03/D1 (`piercing-shot` 1 ammo/range 4/ignores cover, `fireball` 2 mana/radius 1/ignores cover/hits allies, `area-heal` 2 mana/radius 1/no sight needed), and EA-16's D3 (the ability button opens the menu even when the pool cannot pay, and the cost gate moves to the row's `affordable` flag) is implemented verbatim in `frontend/src/game/actions.ts`.

One commit on this branch (`af7fd7d`) touches only `.ia_context/inputs/technical-debt.md` — it records the linear scan in `propAt` as a tracked debt rather than fixing it, and ships no code change.

---

### 2. What changed and why

| File | What changed | Why it matters |
|------|---------------|-----------------|
| `backend/engine/src/cover.ts` *(new)* | `coverFor(board, target, attacker)`: true when a `cover` prop stands on one of the target's eight neighbours, on the attacker's side, and never on the target's own cell (ADR 0013 supersedes the first cut of ADR 0012) | The one place that decides whether a shot is covered; a unit standing on top of a car is exposed, not shielded |
| `backend/engine/src/facing.ts` *(new)* | `facingOf`, `attackDirection` (front/flank/rear by dot product against the target's facing), the bonus table (+10 hit/+1 dmg flank, +15 hit/+2 dmg rear) | Turns "where you're standing" into a number `resolveHit` reads, not an afterthought drawn on the sprite |
| `backend/engine/src/height.ts` *(new)* | `heightAdvantage(board, attacker, target)` and the ±10/±5 hit, ±1 range table by level difference | Rooftops and overpasses stop being scenery: standing on one changes the odds and the reach |
| `backend/engine/src/abilities.ts` *(new)* | `abilityById`, `abilityCells` (the Chebyshev-radius patch an effect covers), `abilityTargets` | The engine's own answer for which cells an ability resolves against — the client paints exactly this, never a guess |
| `backend/engine/src/actions.ts` | `resolveHit` now folds cover, direction and height into one roll; `validateUseAbility` and its event sequence (`ability-used` → `damaged`/`healed` → `unit-defeated`); `face` accepted as a free, turn-preserving action; `buildEvents` for `endTurn` emits `regained` | The single function every hit (basic or ability) goes through, so no rule can drift between the two paths |
| `backend/engine/src/types.ts` | `PropKind`, `Prop`, `Facing`, `Direction`, `AbilityDefinition`/`AbilityEffect`, the `useAbility`/`face` actions, the `attacked.cover`/`.direction`/`.stood` fields, `ability-used`, `damaged`, `healed`, `faced`, `regained` events | The vocabulary every other layer (bot, protocol, client) now shares with the engine |
| `backend/engine/src/board.ts`, `sight.ts` | `propsOf`, `propAt`; a `wall` prop between two cells blocks sight exactly like a tall cell | Cover and line-of-sight read the same board data the client eventually draws from |
| `backend/game-server/src/map.ts` | `PROP_EFFECTS` classifies all 27 prop types across the three maps into wall/cover/decoration; `boardOf` builds the engine's props from the map's own | The server, not the client, now decides which crate is cover — the client only draws what the state says |
| `backend/game-server/src/abilities.ts` *(new)* | `ABILITY_CATALOG` (the three definitions) and `CLASS_ABILITIES` (one id per class) | The content a match ships; the engine never learns a class or ability name (ADR 0016 §13) |
| `backend/game-server/src/bot.ts` | The ability joins the bot's candidates, scored as `expected damage × affected enemies` against the basic attack, filtered through the same legality check | The bot can now use what the player can, so a playtest exercises the real rule |
| `backend/game-server/src/protocol.ts`, `frontend/src/protocol.ts` | Protocol bumped through versions 7–10 across the four slices: `board.props`, `unit.facing`, the `face`/`useAbility` actions, `attacked.cover`/`.direction`, the match's `catalog` | Each rule's wire shape, versioned so a mismatched client/server pair fails loudly instead of silently |
| `frontend/src/game/coverBadge.ts`, `highlightCovers.ts` *(new)* | The sides of a unit that carry cover, worded for the badge; the on/off setting for the debug diamonds, backed by `VITE_HIGHLIGHT_COVERS` | Cover stops being invisible — the owner's exact complaint while reviewing m3-01 |
| `frontend/src/game/ability-menu.ts` *(new)* | `abilityOptions(state, unit)`: name, cost in the unit's own pool, effect line, `affordable` per row | The menu's content as a pure, tested module — the modal only draws what this hands it |
| `frontend/src/game/selection.ts`, `highlight.ts` | Both now take an explicit `abilityId` and fall back to the unit's carried one, so a player can aim whichever ability the menu armed | Decouples "which ability" from "the one the class happens to carry," which is what let the menu exist at all |
| `frontend/src/game/log.ts`, `i18n/abilities.ts` *(new)*, `catalog.pt-BR.ts`, `catalog.en-US.ts` | Eight cover sentences (hit/miss × shooter-covered/target-covered combinations), the named `ability-used` log line, ability names and effect-detail fragments in both languages | The log explains a roll instead of just reporting it |
| `frontend/src/scenes/effects.ts`, `game/presentation.ts` | `playImpact` draws a blast (area damage), a shot (single-target damage, reusing the class's own ranged effect), or a glow (heal) over the engine's own `abilityCells` | An ability finally plays something where it lands, in the class's own colour, with no new art asset |
| `frontend/src/scenes/HudScene.ts`, `view/layout.ts` | The ability menu's panel and rows; the third settings row for the cover-highlight toggle | The screen surface the two UI plans needed, sized for what ships today |
| `docs/adr/0012` through `0017` *(new)* | One record per rule: cover and typed props, the feet exception, facing and the direction bonus, height advantage, abilities as data, mana regeneration | Keeps the reasoning behind each number and each refusal public and citable, per this repo's own rule |

**Verification at the head of this branch:** `npm test -w @eldritch-alley/engine` 342/342 (22 files); `npm test -w @eldritch-alley/game-server` 81/81 (8 files); `npm test -w @eldritch-alley/frontend` 740/740 (55 files); `npm run typecheck` clean across `backend/engine`, `backend/game-server`, `backend/platform-api`.

**Not verified by any test:** the actual rendering of the badge, the menu and the impact animations — `HudScene`, `MapView` and `scenes/effects.ts` need real Phaser and are asserted by spying on the scene's calls, never by seeing a pixel. A manual pass in the browser (badge legibility, menu layout, the three impact shapes) is still owed.

---

### 3. Notes for the reviewer

- **The `face`/`faced` engine support is real but currently dead code from the player's point of view.** It is fully implemented and tested in the engine, deliberately not wired to `action-shape.ts` or the frontend. This looks like an oversight on a diff read alone; it is the missing half of m3-02/D3, named in section 1.
- **Friendly fire on `fireball` is intentional** (m3-03/D2): the area damages the caster's own allies standing in it. It is not a bug surfacing in a playtest.
- **`piercing-shot`'s numbers are provisional and already flagged as unbalanced** in the EA-16 plan's own "out of scope" section (near-strictly better than the sniper's basic attack) — m3-04 tunes it, not this MR.
- **ADR 0012 § D4 is superseded by ADR 0013, not edited.** If you diff `cover.ts` against ADR 0012's original text, the "cover from every direction including the target's own cell" clause reads as contradicted; ADR 0013 is the record that explains why, and `cover.test.ts` was updated to match the newer rule.
