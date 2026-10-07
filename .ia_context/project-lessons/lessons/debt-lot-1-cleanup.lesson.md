# Lesson — A cleanup lot: a test that shouts, and an ADR that contradicts itself

**Feature:** debt-lot-1-cleanup (`debt-lot-1-cleanup.plan.md`; closes DT-22, DT-25, DT-66)
**Date:** 2026-10-07
**Tags:** `#process` `#testing` `#architecture`

---

## Context

Three low-risk debts with no behaviour change: a test that printed Colyseus' stack on every run, a sentence in an
**accepted** ADR that contradicted its own decision, and an item already resolved by a previous ticket. The risk
was not the code — it was editing a document that outranks everything else in the repository.

---

## Decisions worth reusing

**A test that expects a failure holds the log it causes**

- Situation: the room-full case passed, and printed `BattleRoom.onJoin`'s stack every time, which trains people
  to ignore the suite's output.
- Decision taken: `vi.spyOn(console, 'error')` around the refused join, `vi.waitFor` on the server's own line,
  and an assertion that the message contains `room full` — the output became quiet *and* the contract with the
  client got pinned harder than before.
- Alternative rejected: muting the logger globally, which affects every test and hides real failures.
- Applies when: a passing test prints an expected failure. Assert on the message instead of silencing it.

**The text a client depends on is named as a contract, in the test**

- Situation: `onJoin` throwing `room full` is how the client learns another session holds the seat, and one
  module reads it.
- Decision taken: the test's comment says so explicitly, and points at the reader, so rewording one side without
  the other is a visible change rather than a silent one.
- Applies when: a refusal's wording crosses a boundary. Pin both ends.

**An accepted document is corrected by a person, and only where it is wrong**

- Situation: the ADR's Decision section said `setMetadata` "merges into the existing metadata", while
  `@colyseus/core` replaces the whole object. The ADR is accepted, and accepted ADRs outrank `CLAUDE.md` and the
  plans.
- Decision taken: the owner confirmed first (the plan's execution note says so), then one sentence was rewritten
  to say `setMetadata` replaces the whole object. The decision itself — call `setMetadata`, do not assign the
  field — did not change, and nothing else in the document was touched.
- Applies when: a document above the code is factually wrong. Name the sentence, get the confirmation, change
  nothing else.

---

## Armadilhas encontradas

**An item whose resolution is "already done"**

- Sintoma: DT-25 (the move-preview intent declared and never returned) had been resolved by EA-7, and stayed in
  the open list.
- Causa real: the ticket that resolved it did not close it, and the next reader sees an open item that looks
  like work.
- Solução: closed with the resolution text and the line numbers that prove it ("nothing left to remove").
- Sinal de alerta: an open debt whose evidence describes code that no longer exists. (The same branch closed
  DT-22 and DT-66; the bank catches up slower than the code.)

**A document describing a dependency from memory**

- Sintoma: an accepted ADR stated a library's behaviour that the library does not have.
- Causa real: the sentence was written from what the API's name suggests (`setMetadata` sounds additive), not
  from the source.
- Solução: the plan's review step names the dependency's own file and line that settles it.
- Sinal de alerta: a document asserting what a third-party library does. Quote the source, or verify it when
  writing.

**Evidence recorded by line number**

- Sintoma: the lot's own record notes that DT-80's evidence pointed at `selection.ts` lines a later branch had
  rewritten, so the citation stopped resolving.
- Causa real: line numbers are the cheapest thing to write down and the first thing to age.
- Sinal de alerta: an evidence field that is a bare `file.ts:120`. Name the function; a line number is a bonus,
  not the pointer.

---

## O que fazer diferente

- [ ] A test that triggers a logged failure asserts on the message instead of muting the logger.
- [ ] When a refusal's wording crosses a boundary, name both ends in the test.
- [ ] Fix a wrong sentence in an accepted ADR only with the owner's confirmation, and only that sentence.
- [ ] Evidence points at a function, not at a line number.
- [ ] When a ticket resolves another ticket's debt, close it there — an "already done" item costs a whole
  planning cycle to notice twice.

See also [[debt-quick-wins]] (the earlier lot, and the same trap of a debt file that outruns the plans) and
[[debt-dt60-reconnect]] (the reconnect item this bank references as a precedent for owner-confirmed closes).
