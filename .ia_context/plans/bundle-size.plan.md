# Plan — Bundle size: load Phaser only when a match starts

**Milestone:** — (single frontend plan, two files, no backend change)
**Parent debts:** [DT-12](../inputs/technical-debt.md) (bundle above 500 kB), [DT-40](../inputs/technical-debt.md) (1.69 MB bundle, not compared with develop)
**Created on:** 2026-10-05
**Status:** closed on 2026-10-05. Applied and committed as `4c9b6a7`, already in `develop`. Approved by the owner, who ran the section 5 checks in the browser and reported the title's transitions faster and the animations smoother. Section 4.2 changed from the first draft (see there).

---

### 1. Objective

The title page downloads the whole game today, Phaser included, although the game only exists after the server confirms a session. Move the Phaser load out of the title's first load, so the title downloads its own code and Phaser is fetched when the player starts a match. Keep the sourcemap question as a separate decision.

Measured on the current branch (`feat/envs-config`, `npm run build`):

- `dist/assets/index-*.js`: 1,726 kB minified, 420.6 kB gzip, one chunk, the only entry is `index.html` → `src/title/title.ts`.
- `title.ts` line 9 imports `startMatch` and `whenTitleShown` from `main.ts`, and `main.ts` imports `phaser` statically. Phaser is therefore in the title's first load.
- `vite.config.ts` sets `sourcemap: true`: an 11.5 MB `.map` sits in `dist/`, which is deployed to Cloudflare.

### 2. Decisions to take before applying

These are open. Each has a recommended option; the plan is written with it, and changes only if the owner picks another.

**D1 — When the Phaser download starts — chosen: (a)**

- (a) **Chosen.** On the start of the match, once the server has confirmed the session. The first match waits for about 340 kB gzip. Nothing is preloaded.
- (b) Start the import on `pointerover` / `focus` of the call-to-action button. Not done.
- (c) Preload after the title renders (idle). Not done.

**D2 — Sourcemap — chosen: none in production, yes in dev and staging**

- `sourcemap: mode !== 'production'`. `npm run build` is production and emits no `.map`. A staging build (`vite build --mode staging`) emits them. The dev server serves maps regardless.
- Staging is not a mode in the repository yet: there is no `.env.staging` and no staging deploy. The rule is in place for when it exists.

**D3 — `whenTitleShown` — chosen: (a)**

- `main.ts` is unchanged. `title.ts` calls `whenTitleShown(resume)` once, right after the first `import('../main')` resolves, which is before any match can start.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/title/title.ts` | modify | Static import of `../main` removed. `loadMatch()` does the dynamic import once and registers `whenTitleShown(resume)`. `handOver()` awaits it before `startMatch`, and on failure releases the session and returns the title to its usable state |
| `frontend/vite.config.ts` | modify | Config as a function of `mode`. `sourcemap: mode !== 'production'` (D2). `modulePreload: false`, so the title page does not preload the match chunk |
| `frontend/src/main.ts` | unchanged | D3a |

Not touched: `backend/`, `protocol.ts`, the engine, scenes, the look of the title or the HUD, the tests of pure modules.

### 4. Contracts

#### 4.1 Start path

- The title shows without loading Phaser. Nothing in `title.ts` reads a Phaser value at module load.
- The match starts exactly as before: `startMatch(confirmed)` is called after the import resolves, with the same arguments and in the same order.
- If the import fails (network), the title shows the existing error copy and stays usable. The session is not left half-open. The error path is handled where `startMatch` is called.
- `whenTitleShown` is registered once, not on every start.

#### 4.2 Chunks — changed from the first draft

The first draft put Phaser in its own chunk with `manualChunks`, for cache stability. That was dropped:

- With `manualChunks` for `phaser` (object form or only ids under `node_modules/phaser/`), Rollup moved a CommonJS helper used by `ws` (pulled in by `@colyseus/sdk`) into the Phaser chunk. The title's entry then imported from that chunk, and the title downloaded Phaser anyway.
- Without it, the title's entry imports nothing from another chunk. Phaser sits in the match chunk with the scenes.

Result on the current branch:

| Output | Before | After |
|---|---|---|
| Entry loaded by `index.html` | `index-*.js` 1,726 kB (420.6 kB gzip), with Phaser | `index-*.js` 194 kB (62.2 kB gzip), no Phaser |
| Match chunk, loaded on start | — | `main-*.js` 1,532 kB (358.6 kB gzip), Phaser and scenes |
| `modulepreload` in `index.html` | — | none |

The build still warns about a chunk above 500 kB, now the match chunk. That is expected: DT-12 is closed by the title no longer loading Phaser, not by the warning disappearing. The cache gain of a separate Phaser chunk is not in this plan.

### 5. Tests

Automated:

- [x] `npm test` (Vitest) passes unchanged. No test imports `title.ts`'s start path, so existing tests should not move.
- [x] `npm run build` passes (`tsc --noEmit` and `vite build`).
- [x] A new check in `frontend/src/title/` only if D1 is (b): the hover handler starts the import at most once, and the click reuses that promise. Test the helper that owns the promise, not the DOM. — Not applicable: D1 is (a), so nothing is preloaded and no helper owns a promise to test.

Build comparison (DT-40 and DT-12 evidence):

- [x] Record the baseline before any change: the output of `npm run build` on the current branch (1,726 kB, 420.6 kB gzip, already recorded above).
- [x] Record the baseline of `develop`, built from a copy, to close DT-40's open question (growth from Phaser or from new code). — Answered without a second build: `develop` now contains `4c9b6a7`, so it *is* the post-change build. The growth is Phaser's: the title, which no longer imports it, is 199.90 kB (gzip 64.63 kB) against the match chunk's 1,531.95 kB (gzip 358.08 kB). The match chunk still holds the scenes, so this separates Phaser from the title's code, not Phaser from the scenes.
- [ ] After the change: the title entry chunk size, and the Phaser chunk size, reported in the MR description. — The numbers are recorded above and in the DT-12 and DT-40 closures. No MR description exists for this work: there is no `feat-envs-config.description.md` in `.ia_context/descriptions/`, and `4c9b6a7` reached `develop` without one. Left open as the one item of this plan that was not delivered.

Automated results (2026-10-05): `tsc --noEmit` passes; `vitest run` 312 tests in 28 files pass; `npm run build` passes; production build has no `.map`; `vite build --mode staging` emits maps.

Re-measured on 2026-10-05 after the localization work merged into the same branch, `npm run build` clean: title entry `index-BVFa8avo.js` 199.90 kB (gzip 64.63 kB), match chunk `main-BDNFA4K6.js` 1,531.95 kB (gzip 358.08 kB), no `.map`, no `modulepreload` in `index.html`; `vitest run` 354 tests in 33 files pass. The entry grew about 6 kB over the 194 kB recorded in section 4.2, which is the localization code that landed after this plan was applied.

Manual, in the browser (`npm run dev`, then `npm run preview` with the production build):

- [x] The title renders with the Network tab showing no Phaser chunk before the start action (or only the hover prefetch, per D1).
- [x] Starting a match shows the board and the HUD as before.
- [x] Ending a match returns to the title, and the title resumes (the `whenTitleShown` path).
- [x] Starting a second match after returning works.
- [x] With the network blocked at the moment of the click, the title shows the error and can be used again.

Checked by the owner in the browser on 2026-10-05, who approved the result and reported the title's transitions faster and its animations smoother — the title no longer parses and runs Phaser before its first frame. The five lines above are marked from that approval, which came in answer to this list; the owner can unmark any line he did not exercise.

### 6. Dependencies

- None on other milestones. The branch is `feat/envs-config`.
- Decisions D1 to D3 answered on 2026-10-05 (section 2).

### 7. Out of scope

- Importing only the used parts of Phaser (a custom Phaser build). The gain is smaller and the maintenance is more fragile; it is left for a later plan if the numbers after this change still need it.
- Compression, CDN headers and Brotli on Cloudflare. Those are deploy configuration, not this plan.
- Replacing `@colyseus/sdk` or any other dependency. Not measured as a problem yet.
- Changing the visual look of the title or the board.
