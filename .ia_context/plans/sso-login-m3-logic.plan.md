# Plan — SSO and account deletion (frontend logic)

**Milestone:** m3
**Parent feature:** sso-login
**Created:** 2026-10-17
**Status:** implemented (2026-10-17), awaiting approval

## 1. Objective

The client learns the two new words and nothing about the screen yet: `keycloak` is a provider name the
sign-in dialog can draw, `GET /me` says whether the account has a password, and one pure module turns the
deletion form into an answer — accepted, refused for a named reason, or unable to reach the platform. No
DOM, no styles, no fetch in the module: everything here is testable without a browser.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `frontend/src/api/client.ts` | modify | `PROVIDER_NAMES` gains `keycloak`; `Account` gains `hasPassword`; `Api` gains `deleteAccount(input)` |
| `frontend/src/account/delete-account.ts` | create | The confirmation rule, the request, and the outcome type the card will render |
| `frontend/src/account/copy.ts` | modify | The Keycloak label and every line of the security and deletion flow |
| `frontend/src/account/panel.ts` | modify | `ProfileView` gains `securityLabel`, so the profile card's new action is part of the pure view |
| `frontend/src/i18n/catalog.pt-BR.ts` | modify | The new keys |
| `frontend/src/i18n/catalog.en-US.ts` | modify | The same keys |
| `frontend/src/api/client.test.ts` | modify | Provider filter, `hasPassword`, the DELETE call |
| `frontend/src/account/delete-account.test.ts` | create | Section 4 |
| `frontend/src/account/panel.test.ts` | modify | The new label in the view |
| `frontend/src/account/copy.test.ts` | modify | The new copy is complete in both catalogs |

## 3. Layer contract

**`PROVIDER_NAMES = ['keycloak', 'github', 'google']`.** The list is an allowlist, not an order: the
client draws the buttons in the order the platform answered, and a name it does not know still draws
nothing. Adding `keycloak` is what lets the answer `['keycloak']` produce a button.

**`Account`** — `{ user, agents, hasPassword }`, parsed from `GET /me`. A body without a boolean
`hasPassword` reads as `false`; the client and the platform ship together, and the wrong guess would only
hide a field the server would have refused.

**`Api.deleteAccount(input: { confirm: string; password?: string }): Promise<void>`**

- `DELETE /auth/account`, JSON body, `credentials: 'include'`, the same timeout and referrer policy as
  every other call.
- A 204 resolves. Anything else throws the parsed `ApiError` — **including 401**, unlike `logout`: the
  caller must know whether the account was deleted, and "already signed out" is not the same answer.

**`delete-account.ts`**

```ts
export const CONFIRMATION_WORD = 'DELETE';

export interface DeletionDraft {
  readonly confirmation: string;
  readonly password: string;
}

export type DeletionRefusal =
  | 'confirmation' | 'password' | 'throttled' | 'signed-out' | 'offline' | 'unknown';

export type DeletionOutcome =
  | { readonly status: 'deleted' }
  | { readonly status: 'refused'; readonly reason: DeletionRefusal };

export function confirmationAccepted(draft: DeletionDraft, hasPassword: boolean): boolean;
export async function deleteAccount(
  api: Api,
  draft: DeletionDraft,
  hasPassword: boolean,
): Promise<DeletionOutcome>;
```

- `confirmationAccepted` is exact and case-sensitive: `DELETE`, with no trimming. A pasted trailing space
  is a refusal, because the server refuses it and the two must agree.
- The password is required only when `hasPassword`; when it is false the field is not sent at all.
- `deleteAccount` maps the platform's refusals by code: `invalid_confirmation` → `confirmation`,
  `invalid_password` → `password`, `too_many_attempts` → `throttled`; a 401 → `signed-out`; a transport
  failure → `offline`; anything else → `unknown`.
- The module never changes the account store, closes a card or navigates. The caller owns those, so the
  module stays a function of its inputs.

**Copy.** `keycloak` reads as **SSO** in both languages (`Entrar com SSO` / `Sign in with SSO`). The
security and deletion lines live under `account.security.*` and `account.delete.*`; the profile's
`securityLabel` is `Segurança` / `Security`.

**What this milestone does not do.** No DOM element, no event listener, no CSS, no route, no state change,
no provider linking or unlinking.

## 4. Planned tests

**`client.test.ts`:**

- [ ] A providers answer `['keycloak', 'github', 'bitbucket']` becomes `['keycloak', 'github']`.
- [ ] An empty or failed providers answer is still `[]`.
- [ ] `me()` reads `hasPassword: true`; a body without it gives `false`.
- [ ] `deleteAccount` sends `DELETE /auth/account` with `{ confirm, password }`, `credentials: 'include'`
      and JSON content type.
- [ ] Without a password the body has no `password` key.
- [ ] A 204 resolves; 400, 403, 429 and 401 throw `ApiError` with the code intact.
- [ ] A transport failure throws `ApiError('offline')`.

**`delete-account.test.ts`:**

- [ ] `confirmationAccepted` accepts `DELETE`; refuses `delete`, `Delete`, `DELETE `, and an empty string.
- [ ] With `hasPassword`, an empty password refuses; a filled one accepts.
- [ ] Without `hasPassword`, an empty password still accepts.
- [ ] Each server code maps to its reason; an unknown code maps to `unknown`.
- [ ] A network failure maps to `offline`; success maps to `deleted`.
- [ ] The API is called with the confirmation exactly as typed and with the password only when required.

**`panel.test.ts` / `copy.test.ts`:**

- [ ] The signed-in profile view carries the security label; the guest view is still hidden.
- [ ] Both catalogs carry every new key, and the Keycloak label is present in both.

**Edge cases included above:** case sensitivity, trailing whitespace, missing password on an SSO account,
a 401 that is not a success, an unknown refusal code.

## 5. Dependencies

- **m2's contract frozen**, not merged: `GET /me` carries `hasPassword`, the route is
  `DELETE /auth/account`, and the codes are the three in § 3. The module is written and tested against a
  fake `Api`, as m4-04's logic was written against a fake platform.
- The i18n catalogs and the copy parity test already exist (m4-04); this milestone only adds keys.

## 6. Out of scope

- The card and the modal (m4), and their styles and contrast (m5).
- Showing which providers an account has, or letting it unlink one. `hasPassword` is the only fact the
  screen gets.
- A success message after deletion. The player is returned to the title as a guest; the input does not
  ask for a toast and the client has none.
- Localized e-mails. The platform's messages are English, like the rest.
