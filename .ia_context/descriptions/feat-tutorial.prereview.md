# Pre-review — Onboarding: the admission-test sequence over the title (M3.5)

**Branch:** `feat/tutorial`
**Generated on:** 2026-10-16

---

### 1. What to test

Run `npm run dev:frontend` from the root and open the page in a browser you have just used in a private window (or clear `eldritch-alley.onboarding-seen.v1` from `localStorage` under the devtools' Application tab) — almost every scenario below depends on that flag, and a browser that has already seen the sequence will silently show you the title instead. Organised from most critical to least.

**1. The language switcher is reachable while the card is up — the review correction, and the one bug this branch had to fix twice.** Clear the flag, reload so the first card opens by itself, and click directly on the `PT`/`EN` switcher in the top-right corner, **without** pressing Skip or Tab first. Expected: the click lands on the switcher's button, the card is rewritten in the other language, and the step does not move — you stay on whichever card you were reading. This is the scenario that failed before the fix: the click fell on the overlay instead of the button, so the sequence opened in the browser's own language with no way to change it. If the click does nothing, that is the bug back — check that `#lang` is not inside `<main class="title">` in the page's DOM inspector, and that `.lang` is `position: fixed`.

**2. First visit opens it, a second visit does not.** With the flag cleared, reload: the sequence opens on its own, on the first card ("Ocorrência aberta" / "Incident opened"), with the focus already on Continue. Press Continue nine times — the forward button becomes "Concluir"/"Finish" on the last card — and confirm the overlay closes on the last press and the title is usable again. Reload: the sequence does **not** open, and `localStorage` carries `eldritch-alley.onboarding-seen.v1` = `true`. Then check the negative: with the flag cleared and **only** `skip` pressed, reload — it must not open either.

**3. The footer link reopens it, at step 0, and changes nothing.** With the flag already marked (so the sequence does not open by itself), click "Como jogar" in the footer. Expected: the sequence opens at the **first** card, not where it was left, and `localStorage`'s flag is byte-for-byte what it was before. Close it with Skip and confirm the flag still has not changed — the link is a question, never a first visit, so it neither reads nor writes the flag.

**4. Back, and the ends of the sequence.** On the first card, Back is drawn but greyed and does not answer (clicking it does nothing, and its cursor is not a pointer). Advance one card and Back works, walking back to the first. On the **first** card, pressing Back must not move anything — confirm the step dots do not shift.

**5. Tab stays inside the sequence, forwards and backwards.** With the card open, press Tab repeatedly: focus cycles Back → Continue → Skip → Back, and never lands on the title's call to action or the switcher behind it. Press Shift+Tab from Back: it wraps to Skip, not out of the dialog. This is deliberate (`aria-modal`) and is the known gap recorded in §3 below — confirm it behaves as described rather than treating the trap as the bug.

**6. The board covers the switcher and the cards during a match.** Start a match. Expected: neither the language switcher nor the onboarding overlay floats over the board — `#game` is one layer above both. Return to the title (`Voltar ao início`) and confirm the switcher is visible and clickable again.

**7. Blocked storage — the error state.** In a private window with site data blocked, or with `localStorage` denied, load the page. Expected: the sequence opens (a browser that cannot be read is a browser that has not seen it), Skip and Finish both work, the overlay closes, and **nothing throws** in the console. The deliberate failure mode is "shown again next time", never "screen will not close".

**8. The card survives a narrow window.** Resize the window down to a phone width and to a short height. Expected: the card is at most 560 px wide and never overflows the viewport horizontally; the three controls stay on one row; the text does not run outside the card's border. Nothing here is covered by a test — the card's layout is only checked by eye.

**9. Contrast, by eye, on the states a screenshot misses.** Hover each of Back, Skip and the footer link, and Tab to each so the focus ring shows. Expected: the words come up to the paper ink on hover, the ring is visible on both the card's dark background and the night behind the footer link, and the two muted controls are readable at rest. The numbers are held by `contrast.test.ts`; what the test cannot do is tell you whether the ring is *visible* where it lands.

**10. The copy itself.** Read all nine cards in both languages. Check specifically that the squad card names **sniper, wizard and priest** (the advanced classes the match fields) and not the pitch's base classes — that text was corrected in review — and that no card is a leftover stub. This is the part of the MR with no automated check and the part a player actually reads.

---

### 2. Code checklist

- [ ] `content.ts` is pure data — ids and categories only, no DOM, no language, no side effect.
- [ ] `copy.ts` reads `t()` on **every** call and never caches a line as a constant — the switcher rewrites an open card, and a constant cannot follow a language that changes after load.
- [ ] `flow.ts` returns **the same object** for an event it does not answer (identity, not deep equality), and `step` stays a valid index in the `done` state.
- [ ] `seen.ts` swallows a throwing storage on both the read and the write; `hasSeenOnboarding` treats "the key holds something that is not the marker" as *not seen*.
- [ ] `overlay.ts` imports nothing from the DOM and nothing from Phaser; `onboarding.ts` is the only file of the feature that touches `document`.
- [ ] Nothing in the diff reads or writes `connect-flow.ts`, `Session`, or the locale storage key — the sequence never participates in the connection, and `seen.test.ts` holds that it leaves `LOCALE_STORAGE_KEY` alone.
- [ ] No colour literal in `onboarding.css` that `title.css` does not already write, and no `var(--token)` naming a token `title.css` does not define — both are asserted, but confirm the new rule did not quietly add a shade.
- [ ] `onboarding.css` re-declares neither `color` nor `background` on `.onboarding-forward`, which is what keeps the forward button the title's own red.
- [ ] Every `onboarding.*` key exists in both catalogs (`catalog.en-US.ts` is typed as the whole reference, so a gap is a compile error — confirm the type is still `Record<MessageKey, string>`).
- [ ] `#lang` is **outside** `<main class="title">` in `index.html`, and the stack reads overlay/notice `1`, `.lang` `2`, `#game` `3`.
- [ ] The Portuguese fallback inside `index.html`'s `#onboarding` matches the catalog's first card — a script-less page shows it verbatim.
- [ ] No `any` without a justification, no `console.log` left in the diff.
- [ ] Nothing outside the onboarding, title and catalog files changed, apart from the plan documents.
- [ ] `npm test -w @eldritch-alley/frontend` (887/887 in 68 files), `npm run typecheck`, `npx tsc -p frontend/tsconfig.json --noEmit` and `npm run build -w @eldritch-alley/frontend` all pass.

---

### 3. Behaviour checklist

- [ ] The sequence opens by itself on a browser that has never seen it, and stays down on one that has.
- [ ] Skip on any card, and Continue on the last card, both close the overlay and both mark the flag — and nothing else marks it.
- [ ] Back on the first card does nothing at all, and the button is drawn disabled.
- [ ] The step dots light one per card and follow the cards; there are exactly as many dots as cards.
- [ ] The footer link reopens the sequence at step 0 however far it had been read, and neither reads nor writes the flag.
- [ ] Switching language with the card open rewrites the card and the three controls **and leaves the step where it was** — the click lands on the switcher itself.
- [ ] Tab cycles the overlay's three controls in both directions and never leaves the dialog; the title's call to action is unreachable by both mouse and keyboard while the sequence is up.
- [ ] A returning visitor's title keeps its own focus — the sequence does not steal it when it is not shown.
- [ ] The board covers the switcher and the overlay during a match, and both are back after returning to the title.
- [ ] With storage blocked, the sequence still opens, still closes, and raises nothing in the console.
- [ ] The card fits a phone-width, short viewport without overflow, and the three controls stay on one row.
- [ ] No English line appears inside the Portuguese sequence, or vice versa, in any card or control.
