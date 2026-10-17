# Plan — Security card and deletion confirmation (frontend integration)

**Milestone:** m4
**Parent feature:** sso-login
**Created:** 2026-10-17
**Status:** approved (2026-10-17)

## 1. Objective

The account dialog gains a **Security** card and, over it, the **delete-account** confirmation. The
profile card carries the entry; the confirmation asks for the exact word and — only when the account has
one — the password; every refusal the platform can give is said in place; a successful deletion leaves the
title in the guest state with every card closed. The sign-in dialog itself needs no wiring: its provider
buttons are drawn from the list, and m3 already taught the list the word `keycloak`.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `frontend/index.html` | modify | The profile's "Segurança" action; the `#security` card; the `#delete-account` confirmation card |
| `frontend/src/account/account.ts` | modify | Opens and closes the two cards, renders their text, runs the deletion, maps the outcome, and returns the store to guest on success |
| `frontend/src/account/account.css` | — | Not in this milestone; m5 styles the new markup |

No new module. The cards follow the pattern `account.ts` already uses for the profile and the history:
one card at a time, the same `setCard` counter, the same `keepKeys` for Escape, the same language
redraw. A separate module would have to be handed the store, the control and the card helper only to do
what the file next door already does.

## 3. Layer contract

**Markup — `index.html`.** The profile's action row gains `#profile-security` between History and Sign
out. Two cards join `#auth`, `#profile` and `#history`:

```
#security        role="dialog" aria-modal="true" aria-labelledby="security-title"
  #security-close       close
  #security-title       Segurança / Security
  #security-methods     how this account signs in          class="account-security-methods"
  #security-delete      "Excluir conta" — opens the confirmation   class="account-danger"
#delete-account  role="dialog" aria-modal="true" aria-labelledby="delete-title"
  #delete-close
  #delete-title         Excluir conta / Delete account
  #delete-warning       what is erased, and that it cannot be undone   class="account-hint"
  #delete-confirm-label / #delete-confirmation             class="account-field"
  #delete-password-label / #delete-password-field          class="account-field", hidden when the account has no password
  #delete-problem       role="alert"                       class="account-problem"
  #delete-submit        disabled until `confirmationAccepted`   class="cta"
  #delete-cancel        back to the title                  class="account-link"
```

The two class names m4 introduces — `account-security-methods` and `account-danger` — are the ones m5
styles; every other element reuses a class the dialog already has.

**Behaviour.**

| Event | Result |
|---|---|
| `#profile-security` | closes auth, history and profile; opens `#security`; focuses its close button |
| `#security-delete` | closes `#security`; opens `#delete-account` with empty fields and no problem; focuses the confirmation input |
| typing | `#delete-submit.disabled = !confirmationAccepted(draft, hasPassword)`; the problem is left as it is until the next submit |
| submit | `deleteAccount(api, draft, hasPassword)` |
| outcome `deleted` | `setAccount({ status: 'guest' })`, close the card, focus the account control |
| outcome `signed-out` | the same: the session is gone, so the client is a guest |
| outcome refused | the confirmation stays open and `#delete-problem` names the reason: wrong word (only reachable by a race), wrong password, too many attempts, offline, unknown |
| Escape, close, cancel | closes the card and focuses the account control |
| language change | both cards re-render from the catalog; a typed confirmation and password are kept |
| account change to guest | both cards close |

The password field is rendered only when `currentAccount().account.hasPassword` is true. The
confirmation word is `DELETE` in both languages — it is a token the server checks, not copy.

**What this milestone does not do.** No route, no toast, no provider linking or unlinking, no styles or
contrast work, no change to the sign-in dialog beyond the button m3 made possible, and no new store.

## 4. Planned tests

The repository has no DOM test runner; the pure parts are m3's and are covered there. This milestone is
verified by the scenarios below, which become m4's pre-review checklist. A DOM harness is a separate
piece of infrastructure and is not smuggled into this delivery.

- [ ] **Password account.** Profile → Segurança shows that the account signs in with an address and a
      password. Delete → the confirmation asks for the word and the password.
- [ ] **Word is exact.** `delete`, `Delete` and `DELETE ` leave the submit disabled; `DELETE` enables it.
- [ ] **Wrong password.** `DELETE` + a wrong password → 403; the card stays and the line says the password
      is wrong; nothing is deleted.
- [ ] **Throttled.** Eleven wrong passwords inside the window → the line says to wait; the button stops
      being useful until the window slides.
- [ ] **SSO-only account.** The password field is absent; the word alone deletes.
- [ ] **Success.** The platform answers 204; both cards close; the account control says "Entrar"; a
      reload is still a guest; `/me` is a 401.
- [ ] **Offline.** Stop the platform, submit → the line says the platform did not answer, the card stays,
      the typed word is kept.
- [ ] **Stale session.** Delete the account in another tab, then submit here → 401 is treated as
      signed-out: the card closes and the control is a guest.
- [ ] **Card discipline.** With either card open, Enter on the title does not start a match and starts
      the card's own action instead; Escape closes and returns focus to the control.
- [ ] **Language.** Switch the title's language with the confirmation open: every line, including the
      methods and the warning, changes; what was typed stays.
- [ ] **Both provider deployments.** With Keycloak configured the sign-in dialog draws one "SSO" button;
      without it, the Google and GitHub buttons are back and both sign in.
- [ ] **History and profile still work** after the new card's markup: opening one closes the others, and
      the counter never leaves the title's keys stuck.

## 5. Dependencies

- **m3 approved** — the copy keys, `Account.hasPassword`, `Api.deleteAccount` and the outcome mapping.
- **m1 and m2 running** for the live scenarios; the scenarios that only need a password account need m2.

## 6. Out of scope

- Styles, contrast and the phone layout (m5).
- A success message. The player lands on the title as a guest; that is the confirmation.
- Provider management on the security card. It states how the account signs in and offers the exit; it
  does not add or remove a way in.
- A separate `/settings/security` route. The client has no router and the card is the approved pattern.
