# Lesson — Resuming a match after a reload, and when to clear a stored token

**Feature:** debt-dt60-reconnect (`debt-dt60-reconnect.plan.md`; DT-60)
**Date:** 2026-10-05
**Tags:** `#protocol` `#architecture` `#testing`

---

## Context

A page reload in the middle of a match left the player on "Servidor indisponível": the title joined a new room
instead of the one the player was seated in, and the server refused the second human. The fix was small. The
decisions around it were not: when to forget a stored credential, and how identity will work once there is
PvP.

---

## Decisions worth reusing

**A refused resume does not clear the stored token**

- Situation: a stored reconnection token is refused by the server, either because the seat expired or because
  the request failed for another reason.
- Decision taken: a refused resume returns `false` and keeps the token. `open()` then calls `connect()`, which
  overwrites the token with the new room's. A stale token costs one request per load and nothing else.
- Alternative rejected: delete the token on refusal. To do that safely, the code must tell a server refusal
  apart from a network error or a proxy timeout. The SDK's error code for a refused reconnect is an HTTP
  status, which Cloudflare also uses (522 and 524), so the code cannot tell them apart.
- Applies when: deciding whether to clear stored credentials after a failed resume. If the next successful
  step overwrites the credential anyway, deleting it adds risk and no benefit.

**Per-tab tokens are a shortcut for the bot match, not the identity for PvP**

- Situation: the token lives in `sessionStorage`, which is per tab. A duplicated tab copies it, and the second
  tab can get the same seat refused.
- Decision taken: keep the per-tab token for the bot match, and warn about a second tab. For PvP, identity
  comes from a login, so the seat is resolved by account.
- Applies when: designing reconnection. A token is a credential for a seat, and the seat should be resolved by
  whatever identifies the player across tabs and devices.

**Where a debt's suggested fix and the plan disagree, the plan says so**

- Situation: the debt suggested clearing the stale token, and the plan chose not to.
- Decision taken: the plan records the deviation, its reason, and the section that justifies it. The debt's
  closure text repeats it.
- Applies when: a debt's suggested fix was written before the code was read.

---

## Armadilhas encontradas

**A debt's evidence named a file that no longer existed**

- Sintoma: the debt cited `frontend/src/scenes/LobbyScene.ts`. That file was gone, since the title page had
  replaced it.
- Causa real: the debt was written before the screen was replaced, and nobody updated the evidence.
- Solução: the plan named the current file (`frontend/src/title/title.ts`), and the closure records the change.
- Sinal de alerta: an evidence path that does not resolve. Check `git ls-files` before planning from a debt.

**The SDK loses the server's error body**

- Sintoma: the server's reason for refusing a resume (expired, room disposed) was not visible to the client.
- Causa real: the SDK converts the HTTP error into a `MatchMakeError` with only the numeric code and the
  message. The body is dropped. A network failure has no numeric code at all.
- Solução: no code was written to distinguish them, because the plan no longer needs to.
- Sinal de alerta: any design that depends on telling error causes apart. Read the SDK's error path first.

---

## O que fazer diferente

- [ ] Check every evidence path in a debt before writing a plan from it.
- [ ] Read the SDK's error path before designing error handling against it.
- [ ] When a decision changes during planning, update the test list in the same edit.
- [ ] Write the second-tab case as a debt the day it is found, not as a note in a closure.
