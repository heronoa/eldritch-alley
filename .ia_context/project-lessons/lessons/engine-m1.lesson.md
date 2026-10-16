# Lesson — Minimal deterministic battle engine (M1)

**Feature:** engine-m1 (`backend/engine`, the M1 milestone)
**Date:** 2026-10-03
**Tags:** `#determinism` `#architecture` `#testing` `#process` `#types`

---

## Context

The engine had to be the one layer of the project that is pure: no framework, no I/O, no clock, no
`Math.random`, and reproducibility from a setup plus an event log (ADR 0005). The difficulty was never
the rules — an 8×8 grid with height, initiative and a basic attack is small. The difficulty was that
three requirements pull against each other: **the state must be rebuildable from the events**, **the
rolls must be deterministic**, and **the rules must be provably integer-only**. Each of them is easy to
satisfy alone and easy to break while satisfying the other two.

---

## Decisions worth reusing

**One writer for the state**

- Situation: a live match and a replay both produce the final state, and they must agree. Two code
  paths that "do the same thing" drift, and the drift shows up as a mismatch nobody can reproduce.
- Decision taken: `applyEvent(state, event)` is the only function in the engine that returns a changed
  state. `applyAction` validates an action and then calls it; `applyEvents(setup, events)` is
  `newMatch(setup)` followed by the same `applyEvent` per event. Play and replay are not two
  implementations that agree — they are one implementation used twice.
- Alternative rejected: `applyAction` mutating the state directly, with replay as a separate reducer.
  Nothing forces the two to stay in step, and the first divergence is silent.
- Applies when: anything whose state must be rebuildable from a log — event sourcing, undo, server
  reconciliation, sync, debugging from a recorded session. The question to ask is "how many functions
  can change this state?", and the answer should be one.

**The architectural rule is a test, not a paragraph**

- Situation: "no `Math.random`, no `Date`, no I/O, no floating-point division" is a rule a human
  reviews badly. A forbidden call inside a helper three files deep is invisible in a diff, and the
  failure it causes (a match that cannot be replayed) surfaces weeks later.
- Decision taken: `forbidden.test.ts` reads the engine sources, blanks comments and string literals,
  and fails on each forbidden construct. The division check falls out of that same trick: once
  comments and strings are blanked, **any `/` left is an operator**, so one regex enforces "integer
  math only" across the whole layer.
- Alternative rejected: documenting the rule in the ADR and trusting review. Because the rule is a
  test, it kept applying itself to code written afterwards — ammunition and the corpse rule arrived
  later and had to satisfy it without anyone remembering to check (see the melee helper below).
- Applies when: an invariant is easy to violate by accident, cheap to state as a pattern, and
  expensive to notice in review — forbidden imports, layer boundaries, banned APIs. Write the test.
- **Its own maintenance trap:** the guard scans the directory, so a new module is covered
  automatically, but a second, hand-written list (`GUARDED_MODULES`) asserts which modules *must
  exist*. That list was not updated when `corpse.ts` was added, so the guard silently under-specified
  its own inventory. Adding a module means updating the inventory — a file scan is not a substitute
  for knowing what should be there.

**Randomness is recorded, never recomputed**

- Situation: the replay bug (BUG-01). The rebuilt match rolled *differently* from the live one,
  because the rng was not advanced on replay. The obvious fix — "advance the rng the same way" —
  is wrong in general: the number of draws per roll is not fixed.
- Decision taken: the `attacked` event carries `rngState` (the generator state *after* the roll), and
  `applyEvent` adopts it. The replay never rolls; it reads the outcome of a roll that already
  happened.
- Alternative rejected: replaying the roll from the same seed and expecting the same result. It works
  only while the draw count is stable, and it was not — the generator uses rejection sampling, so a
  roll takes a variable number of draws.
- Applies when: any randomness that has to survive a replay, a retry, a cache or a log. The general
  form: **a nondeterministic input must be captured in the log, not re-derived from the log's
  premise.** The same reasoning applies to timestamps, ids and network responses.
- **Corollary that cost real time:** the hash deliberately excludes the rng, so a shallow
  comparison *passed* while the full state differed. Replay was only ever proven by comparing the
  whole state, never by comparing hashes. If a field is excluded from the fingerprint on purpose,
  the fingerprint can no longer be the test for it.

**Post-MVP fields go in as data now, with no rule reading them**

- Situation: the roadmap already knew that Nerve, Attunement, classes, equipment and abilities were
  coming. Adding them later means reshaping `Unit`, and `Unit` is inside the state that is hashed,
  persisted and replayed.
- Decision taken: `Unit` carries them from M1 as plain data with range validation and **zero rules**.
  No Nerve effect, no class progression, no ability types — an empty slot is a fixture value.
- Alternative rejected: adding each field in the milestone that needs it. The type stays small, but
  every milestone pays a reshaping of the state and a new hash.
- Applies when: the next milestones are already decided and the field is *data*, not behaviour.
- **Where this bet does not pay, and the honest calibration:** preparing the type did not save the
  engine from changing anyway. M2-a had to add `maxHealth` to `UnitState` and bump the wire protocol
  from 1 to 2, because a health ceiling turned out to be public state. **Pre-guessing a data field is
  cheap; pre-guessing the contract is not possible.** The lesson is to separate the two: be generous
  with fields that only the engine reads, and version anything that crosses a boundary instead of
  trying to future-proof it.

**Two failure modes, two shapes**

- Situation: `newMatch` can be handed a malformed setup, and a player can ask for an illegal action.
  Treating both the same way makes one of them wrong: an exception for a refused move means the server
  needs a try/catch on the hot path, and a return value for a broken setup means the caller can forget
  to check it.
- Decision taken: a malformed setup **throws** `RangeError` (duplicate positions, out of bounds,
  non-integer values, empty team, duplicate ids). A rule violation **returns** `{ ok: false, reason }`,
  produces no event and leaves the state object untouched.
- Alternative rejected: one mechanism for both, which was the path of least resistance and would have
  put either exceptions or unchecked results in the wrong place.
- Applies when: designing any command API. The dividing question is "is this a programming error or a
  legitimate request that is not allowed right now?" — the first is a throw, the second is a typed
  result the caller is expected to handle and forward.

---

## Traps found

**A replay that rolls differently from the match it replays**

- Symptom: replaying the events of a live match produced a state that was *nearly* identical — same
  hash, different outcome for the next roll. Because the hash excludes the rng, the test that compared
  hashes stayed green and the bug survived until someone compared the full state.
- Real cause: the random source was not part of the event log, so the rebuilt match drew from an
  unadvanced generator. The draw count per roll is variable (rejection sampling), so "just advance it
  the same amount" is not a fix.
- Solution: the event carries the generator state after the roll, and `applyEvent` adopts it.
- Early warning: **compare full state after a replay, never the hash alone** — especially when a field
  is excluded from the hash by design. And when a roll can consume a variable amount of entropy, the
  entropy consumption is part of the outcome.

**Modulo bias in the random range**

- Symptom: none. Nothing failed. A generator that had been passing every test was quietly biased.
- Real cause: `2^32 % span` is not zero for most spans, so the first values of the range came up more
  often. The bug was in the design, not in a change.
- Solution: rejection sampling — draw, and redraw when the value falls in the biased tail. The number
  of draws per call is therefore variable, which is what fed the replay trap above.
- Early warning: `%` applied to a random draw is guilty until proven innocent, and "no test failed" is
  not evidence that a distribution is correct. This one was found by reading the code, not by running
  it.

**Integer-only math does not mean awkward math — but it does mean different math**

- Symptom: a reviewer reading `meleeDamage` sees `attack >> 1` and has to be told why.
- Real cause: the guard forbids `/`, so "half, rounded down" cannot be written as a division. A shift
  is the same operation for non-negative integers and passes the guard.
- Solution: keep the operation, change the notation, and say so in a one-line comment. The same
  pressure produced comparisons instead of range arithmetic in `corpseRounds` (`nerve < 50`,
  `nerve < 100`) rather than a lookup by division.
- Early warning: budget for the notation. It is not a defect to be fixed later; it is the cost of the
  ADR, and the comment explaining it is part of the implementation.

**The red-first order was never recorded, so it could not be shown**

- Symptom: at the close of the milestone, the plan's process requirement — every test red before its
  implementation — could not be demonstrated, only asserted.
- Real cause: the tests and the implementation were written in one pass, and the failing output was
  never captured at the moment it happened. Nothing about the final code is wrong; what is missing is
  the evidence.
- Solution: a retroactive check (move the sources out, run the suite, confirm all 10 files fail with
  `Cannot find module`, restore). It proves the tests depend on the implementation. It does **not**
  prove any individual test was red before its rule existed, and the plan says so explicitly.
- Early warning: if the process asks for an order, the order has to be recorded **when it happens**.
  A process requirement that is reconstructed afterwards is a claim, not a record.

**The plan's file table is a forecast, and forecasts age**

- Symptom: the same class of small disagreement, in feature after feature — the plan's file table
  named `initiative.ts` for the round counter and the code put it in `actions.ts`; the plan named a
  `unit` field for a defeat event and the code used `target`; a later plan omitted a file it turned
  out to need, and carried test counts that were already stale.
- Real cause: a plan is written before the code exists, and the file table is the part of it that is
  most confidently wrong. None of these were implementation mistakes.
- Solution: name the divergence where the artifact is durable — in the MR description and in the plan
  itself — instead of bending the code to fit a table written in advance. Every one of the examples
  above was handled this way and none of them cost anything afterwards.
- Early warning: when applying a plan, expect the file table to be the first thing that is wrong, and
  decide up front that recording the divergence is the deliverable — not silence, and not conformance.

---

## What to do differently

- [ ] Capture the red output **at the moment it happens** — command and result — instead of
      reconstructing it at the close of the milestone.
- [ ] When a plan's file table disagrees with the code, record the divergence in the plan or the MR;
      never reshape working code to match a forecast.
- [ ] When adding a module to the engine, update the `GUARDED_MODULES` inventory in
      `forbidden.test.ts` — the directory scan covers it, but the "must exist" list does not.
- [ ] For anything nondeterministic, record the outcome in the event log rather than recomputing it,
      and verify replays by comparing the **full state**, never a fingerprint that excludes the field.
- [ ] When a random draw can consume a variable amount of entropy, treat the consumption as part of
      the outcome.
- [ ] Before rejecting a field as "not needed yet", ask whether the engine alone reads it (add it as
      data) or whether it crosses a boundary (version the boundary instead of guessing).
