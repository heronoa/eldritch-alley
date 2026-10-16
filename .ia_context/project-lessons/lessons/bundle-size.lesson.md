# Lesson — Keeping the game engine out of the first page load

**Feature:** bundle-size (`bundle-size.plan.md`; DT-12 and DT-40)
**Date:** 2026-10-05
**Tags:** `#architecture` `#testing` `#process`

---

## Context

The title page downloaded the whole game, Phaser included, before the player pressed anything. The entry
chunk was 1,726 kB (420.6 kB gzip). The goal was a small first load without changing the title's look or the
match's behaviour.

---

## Decisions worth reusing

**Load the game on the action that needs it, not before**

- Situation: the match depends on a large engine, and the title needs none of it.
- Decision taken: a one-shot dynamic `import()` (`loadMatch()`) runs when the player starts a match, after the
  server confirms the session. The cost is that the first match waits for about 340 kB gzip.
- Alternatives considered: start the import on hover or focus of the button, or preload when idle. Both are
  kept as options and not used, because the wait is short and the code stays simpler.
- Applies when: a page has a cheap entry point and an expensive destination. Split at the action that
  leads there.

**Source maps follow the build mode**

- Situation: `sourcemap: true` put an 11.5 MB `.map` in the deployed folder.
- Decision taken: `sourcemap: mode !== 'production'`. Production emits no maps. Staging keeps them.
- Applies when: the build is deployed publicly. Make the rule a function of the mode, not a constant.

**Stop the page from preloading the destination chunk**

- Situation: Vite adds `modulePreload` links for chunks it can predict, which would pull the match chunk
  into the title's first load.
- Decision taken: `modulePreload: false`.
- Applies when: a split is meant to defer a download. Check that the entry HTML does not still ask for it.

---

## Armadilhas encontradas

**A `manualChunks` rule moved the title's dependency into the game chunk**

- Sintoma: the split was configured, but the title still downloaded Phaser.
- Causa real: forcing `phaser` into its own chunk moved a CommonJS helper, used by `ws` through
  `@colyseus/sdk`, into that chunk. The title's entry then imported from it, so the entry pulled in the game
  chunk regardless.
- Solução: the manual chunk was dropped. Without it, the entry imports nothing from another chunk.
- Sinal de alerta: the entry's size stays the same after a split. Check which chunks the entry imports, not
  only the chunk names.

**A debt was closed on a reinterpretation of its own metric**

- Sintoma: DT-12 was titled "bundle above 500 kB", and the build still warns about a chunk above 500 kB.
- Causa real: the debt was closed by changing what it measured (the first load, not the chunk size). DT-40
  was closed on an inference ("the bulk is Phaser and the scenes") that was not measured.
- Solução: the closure text records what was measured and what was inferred. Measurement results are
  reproducible with `vite build --outDir <scratch>`, which does not touch `dist/`.
- Sinal de alerta: a debt closed while its own acceptance metric still fails.

---

## O que fazer diferente

- [ ] Write the metric a debt names into the debt, so the closing check uses the same one.
- [ ] Separate "measured" from "inferred" in every closure text.
- [ ] Keep the MR description: the plan asked for one and it was not written.
- [ ] Keep a deploy configuration change in its own commit, not inside a performance commit.
