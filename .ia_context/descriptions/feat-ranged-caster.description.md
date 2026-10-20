# MR — Ranged basic attack for the magic classes, one pool per class, and the two resource refusals

**Branch:** `feat/ranged-caster`
**Base branch:** `develop`
**Milestone:** Lot 2 (before the AWS staging deploy) — EA-14, ranged basic attack and mana
**Ticket(s):** EA-14; accepts ADR 0011; closes DT-57 (M2 scope) and DT-80
**Date:** 2026-10-06

---

### 1. What this MR delivers

Every class of the roster now has one basic attack that spends its own pool at any distance. The Wizard
reaches 3 and the Priest 2, both carrying a pool of 3; a strike with an empty pool is refused with
`no-ammunition` or `no-mana` and the player reads *"Sem munição, recarregue"* or *"Sem energia, medite"*.
The melee fallback is gone for every class: an empty magazine no longer turns the shot into an adjacent blow
at half damage, damage is the class's own attack at every distance, and `reload` — a meditation for a magic
class — is the only way to refill. The refusal is the same sentence on both sides, because the client mirrors
the engine's validation order exactly (EA-1 D1).

The non-obvious decision is that mana is not a second mechanism. It rides on the magazine the game already
had: a magic class gets `magazine: 3` and a `resourceKind` of `'mana'`, and every rule that used to read
"has a magazine with rounds in it" now reads the same two fields for both kinds (ADR 0011). That is what let
the change stay small — the refusals, the pip count, the replay and the bot all read `magazine`/`ammo` and
only the *kind* decides the word and the colour. One consequence is worth knowing before reading the diff:
the pool is answered **before** the reach and before the line of sight, so an empty pool now masks
`target-out-of-range` and `no-line-of-sight` with the resource sentence.

Divergences from the approved plan, named explicitly:

- **The word on the screen is energy, not mana.** The plan's D3 fixed the copy as *"sem mana, medite"*; the
  owner decided on 2026-10-06 that the player-facing name of the pool is **energy** — *"sem energia, medite"*,
  the panel row `Energia`, the English `Energy`. The mechanism keeps the name mana everywhere in the code:
  the kind `'mana'`, the refusal code `no-mana`, the ADR. So a refusal whose *code* reads `no-mana` renders
  as "Sem energia, medite", and the Sniper's pool stays ammunition in both the code and the copy. Recorded in
  ADR 0011's consequences, not silently applied.
- **The meditation animation was not delivered.** The plan listed a `create` for a magic circle (Wizard,
  Initiate) and a light beam (Priest), as data-driven effects. Nothing was added: a meditation plays exactly
  the cue a reload plays — the pips refilling (`game/presentation.ts`) — and today only the cyan colour tells
  the two actions apart on the board. The plan's animation timings remain unimplemented for magic.
- **The unit panel lost a row, and the plan's file list did not include it.** The plan did not touch
  `game/panel.ts` or `game/inspect-window.ts`; both changed as a consequence of ADR 0011. There is now one
  resource row, keyed and labelled by the kind the unit carries, instead of an ammunition row plus a dimmed
  mana placeholder (`PanelKey`'s `mana` became `energy`, so the panel is five rows where it was six). The
  dashboard cell and the inspection sheet follow the same rule, and the refill closes DT-57's "mana pips are
  not drawn" limit: a magic class now shows three cyan pips.
- **Two `it.todo` cases became real tests.** `actions.test.ts` had `a wizard at range 2 shoots across the
  rooftop gap` and the priest's twin parked as `it.todo`; both are implemented. The engine suite has no
  pending case left.
- **DT-80's other half is closed by the same change.** With an empty pool the highlight still paints the full
  reach, but the click no longer refuses silently past melee — it names the pool, which is exactly what the
  debt was waiting for EA-14 to add.

---

### 2. What changed and why

| File | What changed | Why it matters |
|------|--------------|----------------|
| `backend/engine/src/types.ts` | New `ResourceKind = 'ammo' \| 'mana'`; `Unit.resourceKind` optional, `UnitState.resourceKind` required and null for a class with no pool; `attacked.ammoSpent: boolean` became `attacked.resource: ResourceKind \| null`; `reloaded` carries `resource`; `no-ammunition` and `no-mana` join `RejectReason` | The contract of the whole feature. The optional field on the setup type is what kept every existing board and fixture compiling: a setup that omits it is an ammunition class |
| `backend/engine/src/actions.ts` | `isMelee`/`firesRound`/`meleeDamage` replaced by one `resourceRefusal(unit)`; `validateAttack` answers the pool before the reach and uses `attacker.range` always; damage is `attacker.attack` at every distance; the `reloaded` event is built with the unit's kind | One rule for two kinds, and one place where "cannot pay" is decided. It also removes the only rule that made distance change what a shot cost or dealt |
| `backend/engine/src/match.ts` | `newMatch` fills `resourceKind`: `magazine === null ? null : (unit.resourceKind ?? 'ammo')` | The default is the compatibility promise — an old setup silently means ammunition, and a class with no magazine has no kind at all rather than a kind it cannot spend |
| `backend/engine/src/events.ts` | `applyEvent` spends a round when `event.resource !== null` instead of when `ammoSpent` was true | What makes a v6 replay land on the same state as the live match: the event, not the unit, says what was spent |
| `backend/game-server/src/map.ts` | Wizard `range: 3`, `magazine: 3`, `resourceKind: 'mana'`; Priest `range: 2`, the same; `ClassSpec` gained the kind | The class data is the only place a class's pool and reach are stated, so EA-11 can tune balance without touching a rule |
| `backend/game-server/src/bot.ts` | `attackDamage` deleted — damage is `actor.attack`; `emptyMagazineReload` renamed `emptyPoolReload` | The bot stops undervaluing its own shot and now meditates when out of mana. The full refill-versus-spell weighting is still EA-10 |
| `backend/game-server/src/protocol.ts`, `frontend/src/protocol.ts` | `PROTOCOL_VERSION` 5 → 6, with the changelog entry; the client's `ResourceKind`, `UnitState.resourceKind`, `attacked.resource`, `reloaded.resource` and the two reasons | A breaking change to two event shapes and to the state. Client and room must be deployed together; a stale tab shows *"Versão incompatível"* instead of drawing a board it cannot read |
| `frontend/src/game/selection.ts` | `reachOf` (melee at 1 with an empty magazine) replaced by the same `resourceRefusal` the engine uses, answered in the same order before range and sight | The refusal the player reads is the one the server would have sent, which is EA-1 D1's rule extended to the new reasons. This is a deliberate duplicate of the engine's function |
| `frontend/src/game/panel.ts`, `game/inspect-window.ts` | One resource row keyed and labelled by the kind (`energy` for mana, `ammo` otherwise); the placeholder mana row removed from both; `PanelKey.mana` → `energy` | The unit reads its own class's word, whoever is looking at it — the dashboard, the panel and the sheet agree |
| `frontend/src/game/log.ts` | A `reloaded` event is described as `log.event.meditated` when the pool is mana, `log.event.reloaded` otherwise; the two new reasons are named | One engine action, two words on the screen (ADR 0011 §3): a magazine is reloaded, a pool of mana is meditated |
| `frontend/src/view/unit-look.ts`, `view/theme.ts`, `scenes/units.ts` | `Pips` carries the kind; `MANA_COLOR` (cyan) added beside the warm ammunition colour, and the pip row is filled with it | The one place the two kinds look different on the board, and the reason a player can see mana without opening a panel. Closes DT-57 |
| `frontend/src/view/layout.ts` | `DASHBOARD_AMMO_RECT` renamed `DASHBOARD_RESOURCE_RECT`, geometry untouched | The name stopped being true once the cell could hold energy. No coordinate moved, so nothing re-laid out |
| `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | `log.event.meditated`, `log.rejection.no-ammunition`, `log.rejection.no-mana`, `panel.label.energy`, and `panel.label.mana` removed | pt-BR is the reference and en-US is typed by it, so the two catalogs cannot drift. The owner reviews the English energy wording |
| `docs/adr/0011-mana-as-magic-class-resource.md` | Status `Proposed` → `Accepted`; the consequences amended for the energy wording and for the bot's deleted damage estimate | The decision this MR implements, accepted on the day it landed rather than left proposed behind the code |
| `backend/engine/src/mana.test.ts` *(new)* | 15 cases: a full pool, the strike at range 1 and 3, no halving, the empty-pool refusal at three distances with the state untouched, meditation, the second meditation, the full-pool refusal, the Priest's reach, a spell through a building, and a replay to the same hash | The whole feature's rule set in one place, including the two `it.todo` cases EA-14 owed |
| `backend/engine/src/actions.test.ts`, `ammo.test.ts`, `backend/game-server/src/battle-room.test.ts`, and the frontend fixtures | `ammoSpent` → `resource`; the empty-magazine shot now expects `no-ammunition` where it expected `target-out-of-range`; the rejection table gained the two reasons; every `UnitState` fixture gained `resourceKind` | The changed expectations are the behaviour change written down: an empty pool is answered before the reach, and the melee fallback is gone |

**Verification at the head of this branch:** `npm test -w @eldritch-alley/engine` 216 passed in 18 files,
no pending cases (was 200 passed with 2 todo); `npm test -w @eldritch-alley/game-server` 63/63 in 7 files;
`npm test -w @eldritch-alley/frontend` 650/650 in 51 files (was 643); `npm run typecheck` clean over the three
backend slices; `npx tsc -p frontend/tsconfig.json --noEmit` clean; `npm run build -w @eldritch-alley/frontend`
passes (206.66 kB entry plus the 1,581.12 kB Phaser chunk, with the size warning this project has had since
M2). The platform-api is untouched.

**Not verified by any test:** the cyan pip row is a `Phaser.GameObjects.Graphics` fill inside `UnitSprite`,
so the colour is asserted only through `pipsFor`'s kind, never by execution — the drawing paths in this
project still need real Phaser. The dashboard cell, the panel row and the sheet row are likewise verified by
hand. The browser pass over the new ranges, the two sentences and the cyan pips is owed; the automated suite
covers the model of all of them.

---

### 3. What this MR does not deliver

Deferred in the approved plan, with where each one is going:

- **The meditation animation** (magic circle, light beam), as noted in section 1. A meditation is drawn as a
  reload today.
- **Mana regeneration** and **spells** — EA-13, after the staging deploy.
- **Initiate and Adept**, the rest of the M3 roster. The class data format takes them without an engine
  change, which was the plan's requirement.
- **Balance**: the ranges (Wizard 3, Priest 2) and the capacity of 3 are the plan's D1-A and D2-A, unplayed
  against a human. EA-11 tunes them.
- **The bot's full treatment of the refill** — weighing a meditation against a spell, EA-10. This MR only
  removes its melee damage estimate and renames its reload score.

---

### 4. Notes for the reviewer

- **The bank of debts was not updated by this branch, and should be before the MR is opened.** DT-80
  (highlight and click disagreeing on reach with an empty magazine) and DT-57 (mana pips not drawn; the
  engine has no mana) are both closed by this code and both still listed open, DT-80 with evidence pointing
  at `selection.ts` lines this branch rewrote. `.ia_context/inputs/technical-debt.md`,
  `backlog.md` and `technical-debt-closed.md` are untouched by the diff.
- **The ADR index does not list this decision.** `docs/adr/README.md`'s table stops at 0009; 0010 and 0011 are
  absent, so the one place a reader looks for "is this accepted?" does not answer for the ADR this MR accepts.
- **Energy on the screen, mana in the code is deliberate and asymmetric on purpose.** Read
  `log.rejection.no-mana` → "Sem energia, medite" as the intended shape, not as a half-finished rename. The
  same asymmetry is why `resourceKind` says `'mana'` while `panel.label.energy` says `Energia`.
- **An empty pool now answers before everything else.** A Wizard with no energy aiming at a target four cells
  away, or through a building, is told *"Sem energia, medite"* rather than *"Alvo fora de alcance"* or
  *"Sem linha de visão"*. The client mirrors the order, so the sentence is the server's own; if the order is
  ever questioned, changing it means changing both copies together.
- **`Unit.resourceKind` is optional and `UnitState.resourceKind` is not.** The first is what makes old setups
  and every pre-existing test fixture valid; the second is what makes the rendering and the log total, since
  a unit in a match always knows which pool it spends. A setup that omits the field is an ammunition class,
  silently — worth knowing if a future class is added without its kind.
- **The "cannot pay" rule is written twice on purpose** (engine `actions.ts`, client `selection.ts`), and the
  *kind* branch is written once more in each of the panel, the sheet, the log and the pips. That is the price
  of EA-1 D1's mirror, and it is four small expressions over one field, not four rules.
- **A replay of a v5 match cannot be read by this build** — `attacked` changed shape. Nothing persists events
  yet (the platform-api is a health endpoint and a config), so there is no data to migrate; it becomes a real
  constraint the day replays are stored.
- **The branch is three commits, one subject each**: the resource mechanism (`implement resource management
  for basic attacks`), the wording move to energy, and the `reloaded` event carrying the kind so the log can
  tell a reload from a meditation. The last one is the only commit whose subject is the log, even though it
  also touches the engine's event.
