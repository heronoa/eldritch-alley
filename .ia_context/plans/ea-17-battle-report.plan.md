# Plan — EA-17 (provisional id, confirm against the owner's own tracker) · The battle report

**Milestone:** —
**Parent feature:** m3-rules-and-content — the owner's request before opening the MR
**Created:** 2026-10-13
**Status:** pending

## 1. Objective

The match's log stops disappearing. Today `MatchScene` keeps only the last six lines in memory
(`logLines`, trimmed in `appendLog`) and the HUD shows them in a 6-line collapsible panel built to be
glanced at mid-match. When the match ends, the player gets a one-word result and nothing else: no way
to read the whole fight back, and no way to keep a copy of it. This plan adds a full, unbounded record
of the match kept alongside the existing 6-line ring, shown in a dedicated modal that opens the moment
the match ends, scrollable, and downloadable as a plain-text file.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|---------------|
| `frontend/src/game/battle-report.ts` | create | Pure: `exportText`, `exportFileName`, `clampScroll`, `visibleLines` (§3) |
| `frontend/src/game/battle-report.test.ts` | create | §4 |
| `frontend/src/scenes/MatchScene.ts` | modify | A second, unbounded log (`fullLogLines`) fed by the same `appendLog`; `battleReportOpen` and `reportScroll` state; `handleEnded` opens the report; the report panel swallows presses while open and reads the wheel as a scroll instead of a zoom; a "Ver registro"/"View log" link reopens it after it is closed |
| `frontend/src/scenes/MatchScene.test.ts` | modify | §4 |
| `frontend/src/scenes/HudScene.ts` | modify | `drawBattleReport`: the panel, its windowed lines, the scroll chevrons and range ("12–26 de 48"), the export button, the close button, the reopen link beside `Sair` |
| `frontend/src/view/layout.ts` | modify | `BATTLE_REPORT_RECT`, `BATTLE_REPORT_CLOSE_RECT`, `BATTLE_REPORT_LIST_RECT`, `BATTLE_REPORT_EXPORT_RECT`, the scroll chevrons' rects, `BATTLE_REPORT_REOPEN_RECT`, `REPORT_LINES` (visible rows) |
| `frontend/src/view/layout.test.ts` | modify | §4 |
| `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | `hud.report.title`, `hud.report.export`, `hud.report.range`, `hud.report.reopen` |
| `frontend/src/i18n/catalog.test.ts` | modify | §4 |

## 3. Contract of the layer

```ts
// frontend/src/game/battle-report.ts

/** What the exported file's header names: the result the player already read on the screen, and when
 * the file was written, from the client's own clock — no event carries a timestamp. */
export interface BattleReportHeader {
  readonly result: string;
  readonly endedAt: Date;
}

/** The whole match, one line per event, as a single plain-text blob — the header first, then every
 * line `appendLog` ever pushed, in the order it was played. */
export function exportText(header: BattleReportHeader, lines: readonly string[]): string;

/** A filesystem-safe name for the download, built from the same clock: `eldritch-alley-<date>-<time>.txt`. */
export function exportFileName(endedAt: Date): string;

/** Keeps a scroll offset inside `[0, max(0, total - visible)]`. A report shorter than the panel scrolls
 * nowhere, and scrolling past either end clamps instead of wrapping. */
export function clampScroll(offset: number, total: number, visible: number): number;

/** The slice of `lines` the panel draws at `offset`, at most `visible` of them. */
export function visibleLines(lines: readonly string[], offset: number, visible: number): string[];
```

- **What this layer does not do.** It does not persist the log anywhere the server can read back — no
  replay storage exists yet (that is its own future feature, tracked separately) — so "export" means a
  file the browser hands the player, nothing more. It does not change `describeEvent`'s sentences, the
  in-match 6-line panel, or the protocol. It does not filter or search the log (D-decisions below name
  what the owner picked instead).
- **The one piece of I/O left to the scene.** Turning `exportText`'s string into a download (a `Blob`
  and a clicked anchor, the same shape the browser's own download dialog needs) is not pure and stays
  in `MatchScene`, exactly the way EA-12 kept the long-press timer out of `press.ts`. The test seam is a
  small `downloadText(name, content)` helper the scene test can spy on, the same pattern EA-15 used for
  `UnitSprite.prototype.setCoverBadge` where the Phaser stub swallows the real thing.

## 4. Tests planned

**Unit — `game/battle-report.test.ts`:**
- [ ] `exportText` puts the header (result, then the date) before every line, one per line, in order.
- [ ] `exportFileName` is deterministic for a fixed `Date`, contains no character a filesystem would
  reject, and ends in `.txt`.
- [ ] `clampScroll` never goes negative and never exceeds `total - visible`; a report shorter than the
  panel always clamps to 0.
- [ ] `visibleLines` returns exactly `visible` lines from `offset`, and fewer only at the very end.

**Scene — `scenes/MatchScene.test.ts`:**
- [ ] `handleEnded` opens the report and seeds it with every line played, not only the last six — the
  regression test against the ring buffer's own truncation.
- [ ] A match longer than `LOG_LINES` still has every line in the report once it ends.
- [ ] The mouse wheel over the report panel scrolls it; the same wheel anywhere else still zooms the
  camera, unchanged.
- [ ] A press outside the report panel while it is open closes the report and sends nothing; `Sair` is
  not reachable through it.
- [ ] Pressing the export button calls the download helper with exactly what `exportText` would build
  for the match's own lines and result (a spy on the helper, per §3).
- [ ] Closing the report and pressing "Ver registro" reopens it with the same content, scrolled back to
  the top.

## 5. Dependencies

- None beyond `develop`'s current head. Purely additive to the five rule plans already committed on
  `feat/rules-and-content`; nothing here touches `backend/`.

## 6. Out of scope

- **Server-side replay persistence** or sharing a match's log with anyone but the player who played it.
  `platform-api` carries no replay storage yet; this plan is client-only and the file never leaves the
  browser except by the player's own download.
- **Filtering or searching the log** (only acertos, only a team, a text search). The owner picked plain
  scroll over this.
- **A JSON export.** The owner picked plain text; a structured export is a separate request if it comes
  up later.
- **Any change to the in-match 6-line collapsible panel** (`LOG_RECT`, `logOpen`). It keeps doing what
  it does today; the report is a second, independent view of the same lines.

## 7. Decisions

**D1 · Reopening after closing.** A small "Ver registro completo" / "View full log" link appears beside
`Sair` once the match is finished, so closing the modal is not a dead end. **Recommended**: the owner
asked for the report to be evident, and a close button that locks the player out of it for the rest of
the session would undercut that.

**D2 · A press outside the panel closes it rather than leaving.** While the report is open, any press
outside its rectangle — including on the `Sair` button underneath it — closes the report and does
nothing else; the player presses `Sair` again, now that nothing covers it, to actually leave. This
mirrors the ability menu's own rule (EA-16, D2): one overlay at a time, closed by its own X or by a
press outside. **Alternative**: let a press on `Sair` leave immediately even with the report open,
which is one fewer press but risks a surprise exit for a player who meant to dismiss the report.

**D3 · The filename.** `eldritch-alley-<YYYY-MM-DD>-<HH-mm-ss>.txt`, from the client's own clock — no
event carries a timestamp today, so the moment the report was generated is the only time the file can
name. **Recommended** as simple and unique enough for a player keeping more than one.

**D4 · Panel size.** Proposed 14 visible lines in a panel roughly 640×520, centred on the 1280×720
canvas, the same fixed-rectangle-plus-close-button shape `INSPECT_RECT` and `ABILITY_MENU_RECT` already
use. Tuned visually during implementation; not a rule worth a decision beyond "fits the canvas with
room for the chevrons and the export button."
