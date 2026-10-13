# MR — Cover, facing, height advantage, abilities as data, the battle report and the odds of a shot (M3, slices 1–3, plus EA-17/EA-18)

**Branch:** `feat/rules-and-content`
**Base branch:** `develop`
**Milestone:** M3 · Rules and content — m3-01 (cover), m3-02 (facing & height advantage), m3-03 (mana regeneration & abilities), plus the owner's follow-ups EA-15 (cover on the screen), EA-16 (the ability on the screen), EA-17 (the battle report) and EA-18 (the odds of a shot)
**Ticket(s):** m3-01, m3-02, m3-03, EA-15, EA-16, EA-17, EA-18
**Date:** 2026-10-13

---

### 1. What this MR delivers

Three rules the pitch promised and had no code for now exist: a `wall` prop blocks the line of sight and a `cover` prop lowers the chance to hit whoever stands beside it (never under their own feet); an attack from the flank or the rear hits harder, and an attack from higher ground reaches further and lands more often; and a class is no longer a stat line plus one basic attack — each of the three carries one active ability, read from data the catalog travels with the match, and mana comes back by one point at the start of a turn instead of only through meditation. All four modifiers (cover, direction, height, and whichever an ability uses) fold into the one function that already decided a hit, `resolveHit`, so a replay of any match still reproduces the exact same rolls.

Two follow-ups the owner asked for before this version ships are in the same branch. **EA-18** reads that same `resolveHit` arithmetic *before* the shot is taken: hovering a target with `Atacar` armed, or holding a cell with `Habilidade` armed, now writes the odds over every head the shot would reach — one number for a basic attack, one per body inside an ability's blast, none at all for a heal, which never rolls. The number shown is never a guess: `hitChanceFor`, already the exact function `resolveHit` consults, is simply exported past the engine's own boundary for the first time, so the preview and the roll can never disagree. **EA-17** gives the match a memory: today's six-line log is a ring that drops its oldest line for good, which meant a finished match had nothing to read back. A second, unbounded record now grows beside it, and the moment a match ends a modal opens with the whole fight, scrollable, with a button that downloads it as a plain-text file.

On the screen, a unit beside cover carries a badge naming which side protects it, the debug diamonds became a toggle ("Highlight Covers"), the battle log names a shot's cover on both ends, and the ability button opens a menu naming each class's ability, its cost and its effect before the player aims it — closing the three complaints the owner raised while playing the earlier builds ("não dá pra selecionar qual spell usar", no cost shown, no animation on impact).

Implementation followed the seven approved plans (m3-01, m3-02, m3-03, EA-15, EA-16, EA-17, EA-18) closely, with four divergences worth naming:

- **The ADR numbers shifted from what m3-02 and m3-03 proposed.** EA-15's "a prop under the feet gives no cover" fix landed *before* m3-02, and claimed ADR 0013 for itself. Facing and height, planned as 0013/0014, shipped as **0014/0015**; abilities and mana regeneration, planned as 0015/0016, shipped as **0016/0017**. The decisions themselves are unchanged — only the numbers moved, and `docs/adr/README.md` reflects the order they were actually accepted in.
- **m3-02's D3 (a facing control in the dashboard) was not delivered.** The engine supports a player-initiated turn exactly as planned — the `face` action and its own `faced` event exist in `backend/engine/src/types.ts` and are covered by `facing.test.ts` — but nothing carries it past the engine: it is absent from `action-shape.ts` (so the server would reject it even if sent), from both `protocol.ts` files, and from every frontend scene. A unit's facing today is set only as a side effect of the direction it last moved or attacked in; a player cannot turn a unit on purpose without acting.
- **EA-18's own D3 (the badge reusing the attack highlight's red) was replaced with the plan's own named alternative.** `ACCENT_COLOR` measures ~3.9:1 against paper and ~3.6:1 against ink — under the 4.5:1 floor this project holds ordinary text to, let alone the 7:1 outline floor the cover badge already clears. The badge ships in the cover badge's own paper-on-ink pair instead, confirmed by two new cases in `theme.contrast.test.ts`.
- **EA-18's `hover` outcome required a change to `game/press.ts` beyond what either plan's file table named explicitly**, and `armLongPress`'s inline timer callback was split into a named `triggerLongPress` method: the Node test run has no Phaser clock to advance, so the only way to test "the long press elapsed" at all was to give that moment a name a test can call directly.

Everything else matches the plans at the level of detail they specified: the cover table is exactly decision m3-01/D1-A, the three ability definitions are exactly m3-03/D1, EA-16's D3 (the ability button opens the menu even when the pool cannot pay) is implemented verbatim, EA-17's D1–D3 (the reopen link, closing on a press outside, the filename pattern) and EA-18's D1/D2/D4 (long-press reveal, a narrow redraw on every mouse pixel rather than a full one, the two badges stacking rather than replacing each other) are all implemented as recommended.

One commit on this branch (`af7fd7d`) touches only `.ia_context/inputs/technical-debt.md` — it records the linear scan in `propAt` as a tracked debt rather than fixing it, and ships no code change.

---

### 2. What changed and why

| File | What changed | Why it matters |
|------|---------------|-----------------|
| `backend/engine/src/cover.ts` *(new)* | `coverFor(board, target, attacker)`: true when a `cover` prop stands on one of the target's eight neighbours, on the attacker's side, and never on the target's own cell (ADR 0013 supersedes the first cut of ADR 0012) | The one place that decides whether a shot is covered; a unit standing on top of a car is exposed, not shielded |
| `backend/engine/src/facing.ts` *(new)* | `facingOf`, `attackDirection` (front/flank/rear by dot product against the target's facing), the bonus table (+10 hit/+1 dmg flank, +15 hit/+2 dmg rear) | Turns "where you're standing" into a number `resolveHit` reads, not an afterthought drawn on the sprite |
| `backend/engine/src/height.ts` *(new)* | `heightAdvantage(board, attacker, target)` and the ±10/±5 hit, ±1 range table by level difference | Rooftops and overpasses stop being scenery: standing on one changes the odds and the reach |
| `backend/engine/src/abilities.ts` *(new)* | `abilityById`, `abilityCells` (the Chebyshev-radius patch an effect covers), `abilityTargets` | The engine's own answer for which cells an ability resolves against — the client paints exactly this, never a guess |
| `backend/engine/src/actions.ts` | `resolveHit`/`hitChanceFor` fold cover, direction and height into one roll; `validateUseAbility` and its event sequence; `face` accepted as a free action; `buildEvents` for `endTurn` emits `regained` | The single function every hit goes through, so no rule can drift between a basic attack, an ability and the preview that now reads it |
| `backend/engine/src/index.ts` | `hitChanceFor` exported alongside the package's other read-only rules (EA-18) | No new arithmetic — the number the client now previews is the exact one the server already rolls against |
| `backend/game-server/src/map.ts` | `PROP_EFFECTS` classifies all 27 prop types across the three maps into wall/cover/decoration | The server, not the client, decides which crate is cover |
| `backend/game-server/src/abilities.ts` *(new)* | `ABILITY_CATALOG` and `CLASS_ABILITIES` | The content a match ships; the engine never learns a class or ability name |
| `backend/game-server/src/bot.ts` | The ability joins the bot's candidates, scored against the basic attack | The bot can use what the player can, so a playtest exercises the real rule |
| `backend/game-server/src/protocol.ts`, `frontend/src/protocol.ts` | Protocol bumped through versions 7–10: `board.props`, `unit.facing`, `face`/`useAbility`, the match's `catalog` | Each rule's wire shape, versioned so a mismatched client/server pair fails loudly |
| `frontend/src/game/coverBadge.ts`, `highlightCovers.ts` *(new)* | The sides of a unit that carry cover; the on/off setting for the debug diamonds | Cover stops being invisible — the owner's exact complaint on m3-01 |
| `frontend/src/game/ability-menu.ts` *(new)* | `abilityOptions(state, unit)`: name, cost, effect line, `affordable` per row | The menu's content as a pure, tested module |
| `frontend/src/game/targetPreview.ts` *(new)* | `attackChance(state, attacker, target)` and `abilityChances(state, caster, ability, to)`, the latter empty for a heal effect | The one pure module behind EA-18: which pair of units the odds are asked about, never the odds themselves — those are `hitChanceFor`'s |
| `frontend/src/game/battle-report.ts` *(new)* | `exportText`, `exportFileName`, `clampScroll`, `visibleLines` | The whole match formatted as a download and a scroll window, with no DOM in the module that has to be unit-tested |
| `frontend/src/game/press.ts` | New `hover` outcome on `Gestures.move`: a mouse with no button down now answers `{ kind: 'hover', at }` instead of `{ kind: 'none' }` | The exact gap the module's own comment used to name — "a mouse hovering over the canvas reports moves, and they belong to nothing" — is what EA-18 needed closed |
| `frontend/src/game/selection.ts`, `highlight.ts` | Both take an explicit `abilityId`, falling back to the unit's carried one | Decouples "which ability" from "the one the class happens to carry," which is what let the ability menu exist |
| `frontend/src/game/log.ts`, `i18n/abilities.ts` *(new)*, `catalog.pt-BR.ts`, `catalog.en-US.ts` | Cover sentences, the named `ability-used` line, ability names and effect fragments, the battle-report's copy (`hud.report.*`), the odds badge's own key (`hud.target.chance`) | The log explains a roll instead of reporting it, and every new word on the screen still comes from the catalog (ADR 0009) |
| `frontend/src/scenes/effects.ts`, `game/presentation.ts` | `playImpact` draws a blast, a shot or a glow over the engine's own `abilityCells` | An ability plays something where it lands, in the class's own colour |
| `frontend/src/scenes/download.ts` *(new)* | `download.text(fileName, content)`: a `Blob` and a clicked anchor — the one piece of I/O behind the report's export button | Kept out of `battle-report.ts` on purpose: the Node test run has neither `Blob` nor `document`, so this is the seam a test spies on instead of exercising |
| `frontend/src/scenes/units.ts` | A second `Text` over the unit's head, `setHitChanceBadge(text)`, stacked above the existing cover badge | A target's odds and its cover both read at once, since they answer different questions (EA-18, D4) |
| `frontend/src/scenes/HudScene.ts`, `view/layout.ts` | The ability menu's panel and rows; the cover-highlight settings row; the battle report's panel, list, scroll chevrons, export button and reopen link (`BATTLE_REPORT_*`) | The screen surface four UI plans needed, each sized for what ships today |
| `frontend/src/scenes/MatchScene.ts` | `handlePointerMove` reads a `hover` into a preview cell; `armLongPress`'s timer body became the named `triggerLongPress`, which shows the preview instead of the inspect sheet while `Atacar`/`Habilidade` is armed; `fullLogLines` grows beside the six-line ring, never trimmed; the battle report opens on `handleEnded`, reads the wheel ahead of the camera's own zoom, and is a modal over `Sair` itself | Where a hover or a held finger becomes a number over a head, and where a finished match becomes something the player can read back and keep |
| `docs/adr/0012` through `0017` *(new)* | One record per rule | Keeps the reasoning behind each number and each refusal public and citable |

**Verification at the head of this branch:** `npm test -w @eldritch-alley/engine` 342/342 (22 files); `npm test -w @eldritch-alley/game-server` 81/81 (8 files); `npm test -w @eldritch-alley/frontend` 783/783 (57 files); `npm run typecheck` and `npm run build -w @eldritch-alley/frontend` both clean.

**Not verified by any test:** the actual rendering of every panel and badge — `HudScene`, `MapView`, `scenes/units.ts` and `scenes/effects.ts` need real Phaser and are asserted by spying on the scene's calls (`setCoverBadge`, `setHitChanceBadge`, `playImpact`, the download seam), never by seeing a pixel. A manual pass in the browser — badge legibility and stacking, the ability menu, the three impact shapes, the battle report's panel and its download, the odds on hover and on a held finger — is still owed.

---

### 3. Notes for the reviewer

- **The `face`/`faced` engine support is real but currently dead code from the player's point of view.** Fully implemented and tested, deliberately not wired to `action-shape.ts` or the frontend — the missing half of m3-02/D3, named above.
- **Friendly fire on `fireball` is intentional** (m3-03/D2), and so is EA-18 pricing it: the caster and an ally standing in their own blast get an odds badge too.
- **`piercing-shot`'s numbers are provisional and already flagged as unbalanced** in the EA-16 plan's own "out of scope" section — m3-04 tunes it, not this MR.
- **ADR 0012 § D4 is superseded by ADR 0013, not edited.** `cover.test.ts` was updated to match the newer rule, and the ADR record is what explains why.
- **The battle report is a modal over everything a finished match shows, `Sair` included.** A press on the way-out button while the report is open only closes the report — the same one-overlay-at-a-time rule the ability menu already follows (EA-16, D2; EA-17, D2). Pressing `Sair` again, now that nothing covers it, leaves the match. This is not a dead button; it is the modal's own rule.
- **The odds badge never appears for a cell the attack or ability highlight would not already offer.** A target out of range, out of sight, on the player's own team while `Atacar` is armed, or dead, gets no number — the badge is a readout of a shot the player could actually take, never a hint about one they could not.
