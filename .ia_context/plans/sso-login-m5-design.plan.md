# Plan — Security card and deletion confirmation (frontend design)

**Milestone:** m5
**Parent feature:** sso-login
**Created:** 2026-10-17
**Status:** approved (2026-10-17)

## 1. Objective

The two new cards read as part of the account dialog and not as a screen bolted onto it: the
confirmation's warning is legible, the destructive action is recognisable as destructive without
shouting, every text pair meets the dialog's contrast floor, and the layout holds at phone width. The
existing account design is not reopened — the new card borrows its card, fields, link and call to action
exactly as they are.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `frontend/src/account/account.css` | modify | The security card's method line, the destructive action, and the confirmation's spacing — built from the tokens and classes the dialog already has |
| `frontend/src/account/contrast.test.ts` | modify | The new pairs join the matrix: danger text and border, the method line, the focus ring |

No JavaScript and no markup change. m4 writes the semantic classes the styles hang off
(`account-security-methods`, `account-danger`); this milestone styles them and nothing else.

## 3. Layer contract

**Reused, not reinvented.**

| Element | Class it already has | What m5 does |
|---|---|---|
| Card frame | `.account-card`, `.account-card-body`, `.account-card-head` | Nothing |
| Warning and method line | `.account-hint` | Nothing; the security line gets one spacing rule only if it needs it |
| Confirmation and password fields | `.account-field` | Nothing |
| Submit | `.cta` | Nothing — the disabled state is the one the sign-in form already draws |
| Cancel and close | `.account-link`, `.account-close` | Nothing |
| Problem line | `.account-problem` | Nothing |

**New rules.**

- `.account-security-methods` — the card's own explanatory line, muted, 12 px, the same 4.5:1 floor as
  the other hints.
- `.account-danger` — the "Excluir conta" action on the security card: the problem red (`#e07a6f`, a
  colour the sheet already writes and the title's palette already carries) on the card, with a matching
  1 px border and a focus ring in `--ink`. Hover underlines the label instead of flooding the button:
  the red is a warning, not a primary action.
- The confirmation's action row reuses `.account-actions`; the destructive submit is `.cta` and keeps
  the existing disabled treatment.

**States the rules must cover.** Rest, hover, `:focus-visible`, disabled submit, and the problem line on
the confirmation. No new colour literal enters the sheet; the palette test is the guard.

**What this milestone does not do.** No new token, no dark mode, no change to the sign-in or history
cards, no icon set, no animation beyond what the dialog already uses.

## 4. Planned tests

**`contrast.test.ts`:**

- [ ] `.account-danger` text is at least 4.5:1 on the card's `--game`.
- [ ] `.account-danger`'s border is at least 3:1 — a graphic pair, not a text pair.
- [ ] `.account-danger:focus-visible` draws its ring in `--ink`, at least 3:1 on the card.
- [ ] `.account-security-methods` is at least 4.5:1 on the card.
- [ ] The palette invariants still hold: every literal in `account.css` exists in `title.css`, and every
      token it borrows is defined there.

**Manual, at 360 px and at desktop width:**

- [ ] The two new cards are the same width as the profile card, with no horizontal scroll.
- [ ] The warning wraps without widening the card, and the confirmation input is reachable without
      zooming.
- [ ] The destructive action is distinguishable from Sign out at rest and with the keyboard, and its
      focus ring is visible on the card.
- [ ] The disabled submit is visibly disabled and does not read as the primary action while the word is
      wrong.
- [ ] The problem line keeps its place when it appears, so the buttons do not jump under the pointer.
- [ ] The sign-in and history cards are pixel-identical to their m4-04 state.

## 5. Dependencies

- **m4 approved.** The classes this milestone styles must exist in the markup, and the states (disabled,
  problem, hidden password field) must be the ones the wiring produces.

## 6. Out of scope

- Any change to the approved account visual language.
- A responsive rewrite of the dialog. The card already fits a phone; only the new content is checked.
- Icons, illustrations or a second warning colour.
