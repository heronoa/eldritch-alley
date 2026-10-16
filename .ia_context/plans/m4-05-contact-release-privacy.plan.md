# Plan — m4-05 · Contact, release e-mails and privacy

**Milestone:** m4-05
**Parent feature:** m4-accounts-and-persistence
**Created:** 2026-10-16
**Status:** pending
**ADR:** none. Consent and the policy are product decisions, recorded in the spec and in the policy's own version, not architecture

## 1. Objective

A visitor can send a contact message, which is stored and forwarded to the owner by e-mail. A player can
opt in to release e-mails from the profile — unchecked by default, with the consent date recorded — and
every release e-mail carries a link that unsubscribes in one click. And the privacy policy becomes a
page, in both locales, linked from the sign-in panel, the contact form and the title's footer.

Three smaller things close with it: `contact_messages` and `release_subscriptions` get their migration,
`GET /me` grows the release-e-mail field, and the mailer arrives behind a port with a log adapter, so
neither the tests nor the local flow needs a mail provider to be reachable.

## 2. Delivery order

| Step | What it delivers | PR |
|---|---|---|
| **1 · Backend** | The two tables and their migration, then the services, then the routes | one |
| **2 · Frontend logic** | The contact form's and the consent's pure modules | one |
| **3 · Frontend integration** | The form, the checkbox in the profile panel, the two policy pages and their links | one |
| **4 · Frontend design** | The styles and the contrast floor | one |

Steps 2 to 4 follow the planning workflow's order, as m4-04 does.

## 3. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `backend/platform-api/src/db/entities/contact-message.entity.ts` | create | `contact_messages` |
| `backend/platform-api/src/db/entities/release-subscription.entity.ts` | create | `release_subscriptions` |
| `backend/platform-api/src/migrations/Migration<timestamp>.ts` | create | The fourth migration: the two tables |
| `backend/platform-api/src/privacy.ts` | create | `PRIVACY_VERSION`, the one constant `privacy_version_seen` is written from |
| `backend/platform-api/src/contact/turnstile.ts` | create | The port: `verify(token, ip)`; the Cloudflare adapter and the fake the tests and the local flow use |
| `backend/platform-api/src/contact/rate-limit.ts` | create | Per-IP-hash counting in Redis, with the window and the limit as data |
| `backend/platform-api/src/contact/ip-hash.ts` | create | `hashIp(ip, salt)`; the raw address is never stored or logged |
| `backend/platform-api/src/contact/contact.service.ts` | create | Store, then notify; the sender's `user_id` when a session is present |
| `backend/platform-api/src/contact/contact.controller.ts` | create | `POST /contact` |
| `backend/platform-api/src/release/release.service.ts` | create | Opt in and out, the consent date, the unsubscribe token |
| `backend/platform-api/src/release/release.controller.ts` | create | `GET /unsubscribe/:token` |
| `backend/platform-api/src/email/email.ts` | create | The port: one `send(message)`; a message carries the unsubscribe link or is not a release e-mail |
| `backend/platform-api/src/email/log.adapter.ts` | create | Writes the message to the log. The local and test adapter |
| `backend/platform-api/src/email/smtp.adapter.ts` | create | SMTP, through `nodemailer`, with the settings read at boot |
| `backend/platform-api/src/me/me.controller.ts` | modify | `releaseEmails` in `GET /me`; `PATCH /me/release-emails` |
| `backend/platform-api/src/config.ts` | modify | `TURNSTILE_SECRET`, `CONTACT_IP_SALT`, `EMAIL_FROM`, `CONTACT_NOTIFY_TO`, `SMTP_*`, the rate-limit numbers |
| `backend/platform-api/src/app.module.ts` | modify | Registers the modules |
| `backend/platform-api/package.json` | modify | `nodemailer`, `ioredis` (and `@types/nodemailer`, dev) |
| `backend/platform-api/src/contact/*.test.ts`, `src/release/*.test.ts`, `src/email/*.test.ts` | create | Section 5 |
| `frontend/src/contact/contact.ts` | create | The form's pure part: what it accepts, what it sends, the failure kinds |
| `frontend/src/contact/contact-panel.ts` | create | The form over the document |
| `frontend/src/account/panel.ts` | modify | The release-e-mails checkbox |
| `frontend/src/privacy/version.ts` | create | The policy's own date, which both pages carry |
| `frontend/public/privacidade.html` | create | The policy in pt-BR: one self-contained page, no JavaScript, `hreflang` to the English one |
| `frontend/public/privacy.html` | create | The policy in en-US: the same document, translated |
| `frontend/index.html` | modify | The contact control, the consent layer's markup, the footer's policy link |
| `frontend/src/title/title.ts` | modify | Opens the contact form and the policy link |
| `frontend/src/contact/contact.css`, `frontend/src/title/title.css` | create / modify | The form's styles, and the anchor points the new controls need |
| `frontend/src/contact/contrast.test.ts` | create | The contrast floor for the new text and controls |
| `frontend/src/privacy/pages.test.ts` | create | Section 5 |
| `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | The new keys, both locales |
| `docker-compose.yml`, `.env.example` | modify | The new variables, and a LocalStack-free local flow: the log adapter is the default |
| `.ia_context/plans/m4-accounts-and-persistence.index.md` | modify | The milestone marked with its PRs |

## 4. Contract of the layer

**`POST /contact`** — no session required, an optional one read when present.

```ts
// Request
{ name: string; email: string; message: string; turnstileToken: string; locale: 'pt-BR' | 'en-US' }
// 201
{ received: true }
```

Order of the checks, because the order is what the tests pin: the shape of the body, then the rate
limit, then Turnstile. Rate-limiting before the challenge means a flood is refused by Redis without
spending a request on Cloudflare; Turnstile after the limit means a human who mistypes is not counted
against their own limit.

| Failure | Status | What the client is told |
|---|---|---|
| A field missing or too long | `400` | Which field |
| Over the rate limit | `429` | Nothing but the code: a friendly sentence is on the client |
| Turnstile refused the token, or could not be reached | `403` | That the challenge failed |
| The message stored but the notification failed | `201` | `received: true` |

The last row is the decision that matters: the message is the artifact, the e-mail is a courtesy. A
message that reached the database and did not reach the inbox is in the database, and the failure is
logged with its id.

**What is stored.** `name`, `email`, `message`, `user_id` (null for a guest), `ip_hash`, `created_at`.
`ip_hash` is `sha256(ip + CONTACT_IP_SALT)`, hex, truncated; the raw address never reaches the database
and never reaches a log line. The policy promises access logs for six months, not an IP beside a
message.

**`PATCH /me/release-emails`** — session required.

```ts
// Request
{ optedIn: boolean }
// 200
{ optedIn: boolean; consentedAt: string | null }
```

Opting in sets `opted_in = true`, `consented_at = now`, and clears `unsubscribed_at`; the token is
created on the first opt-in and then never changes, so an old e-mail's link keeps working. Opting out
sets `opted_in = false` and leaves `consented_at` where it was — the consent happened, and the record
says when. Opting in twice is idempotent in what it stores, except that `consented_at` moves to the
latest consent.

**`GET /unsubscribe/:token`** — no session, reached from a link in an e-mail, so it answers HTML and not
JSON: a small self-contained page saying the address is unsubscribed, in the language the message was
sent in. An unknown token is `404` and changes nothing. A known token sets `opted_in = false` and
`unsubscribed_at = now`, and using it twice is idempotent and still answers `200` — a person who clicks
the link in two old e-mails has not made a mistake.

**The mailer.** One port, two adapters, and one rule enforced in the port's own code: **a release
e-mail is never sent to a subscription whose `opted_in` is false.** The unsubscribe link is built from
the API's own public URL (`PUBLIC_API_URL`) and appended by the port, so a message that forgets it is
not constructible.

The SMTP adapter speaks to **Zoho**, in the `zoho.com` data centre: `smtp.zoho.com`, port 465 with
implicit TLS, `EMAIL_FROM=suporte@heronoa.com.br` and `CONTACT_NOTIFY_TO=suporte@heronoa.com.br` — one
address for both roles, by the owner's decision of 2026-10-16. Two things follow from Zoho, and they are
written here because they are the failures that cost an afternoon rather than the ones the tests catch:
`heronoa.com.br` has to be **verified as a domain** in the Zoho account, or every send is refused with a
message about the sender; and Zoho requires an **application-specific password** when the account has
two-factor authentication, so the password in the environment is not the account's own. Neither is code.
The log adapter is the default everywhere but production, so neither blocks the milestone.

**`GET /me`** grows one field, additively:

```ts
{ …, releaseEmails: { optedIn: boolean; consentedAt: string | null } }
```

`GET /me` is also where `privacy_version_seen` is written, on every sign-in, with the constant in
`src/privacy.ts`. No banner, no gate (owner's decision D7).

**The policy pages.** Two self-contained HTML documents, no JavaScript, no build step beyond Vite
copying `public/`: `privacidade.html` in Portuguese and `privacy.html` in English, each linking the
other with `hreflang` and `<link rel="alternate">`, each carrying the same "last updated" date from
`frontend/src/privacy/version.ts`. They are linked from the sign-in panel, from the contact form and
from the title's footer.

**The policy's content**, from the owner's answers of 2026-10-16 — the values the six placeholders in
`.ia_context/inputs/privacy-terms.input.md` become. All six are answered; the table is the whole list,
and the integration step has nothing to wait for:

| Placeholder | Value |
|---|---|
| `[DATA]` | The day the pages ship, written when the integration step is merged |
| `[NOME OU RAZÃO SOCIAL]` | `Heron Oliveira Amaral`, the owner's answer of 2026-10-16. It is an individual registration, so the razão social *is* the holder's name, which is how the Receita Federal publishes the CNPJ as well. § 1 then reads "mantido por **Heron Oliveira Amaral**, CNPJ 58.978.216/0001-06, com sede em Belém, Pará, Brasil" — and it stays at the city, deliberately: the full registered address is not published and this plan does not add it |
| `[CPF/CNPJ, se quiser informar]` | `CNPJ 58.978.216/0001-06` (check digits verified on 2026-10-16) |
| `[E-MAIL DE PRIVACIDADE]` | `suporte@heronoa.com.br`, in § 1 and in § 7 |
| `[servidor próprio no Brasil; Amazon Web Services, região [REGIÃO]]` | `Amazon Web Services, região us-east-1 (Norte da Virgínia)` |
| `[NOME DO PROVEDOR]` | `Zoho`, and § 5's transfer paragraph names the United States |

The English page is a faithful translation of these sentences, not a rewrite: this is the one document
in the repository whose wording is normative, which puts it outside the rule the catalogs follow, where
the title's and the onboarding's copy was written again in English rather than carried over.

**What this layer does not do.** No account deletion endpoint and no data export — the policy says both
are e-mail requests in this delivery, and the plan keeps that promise by not building them. No
marketing automation, no segments, no campaign tooling: opting in is a boolean and a date, and the
release e-mail is composed elsewhere until there is a release. No analytics, which the policy's section
on cookies would have to be rewritten for.

## 5. Tests planned

**Backend — contact (`contact.controller.test.ts`, `contact.service.test.ts`)**
- [ ] A valid body with a token the fake Turnstile accepts is `201`, stores one row, and sends one
      notification to `CONTACT_NOTIFY_TO`.
- [ ] No `turnstileToken`, an empty one, and one the verifier refuses are `403`, and store nothing.
- [ ] A Turnstile that cannot be reached is `403` and stores nothing — failing closed, not open.
- [ ] One request past the limit is `429`, stores nothing, and does not call Turnstile.
- [ ] The limit is per IP hash: one address that has spent its own limit does not spend another's.
- [ ] The window resets: the count recorded has a TTL, asserted on the fake Redis.
- [ ] What is stored carries `ip_hash` and no column carries the raw address; two requests from the same
      address share a hash, and the same address with a different salt does not.
- [ ] A signed-in sender stores `user_id`; a guest stores `null`.
- [ ] A notification that fails still answers `201`, leaves the row, and logs the failure with the id.
- [ ] A missing field, an empty message and an over-long message are `400`, naming the field.

**Backend — release (`release.service.test.ts`, `release.controller.test.ts`)**
- [ ] Opting in sets `opted_in`, `consented_at` and a token; `GET /me` then reports it.
- [ ] Opting in twice keeps one row, one token, and moves `consented_at`.
- [ ] Opting out sets `opted_in = false` and keeps `consented_at`.
- [ ] Opting out and back in clears `unsubscribed_at` and keeps the same token.
- [ ] An unknown token on `/unsubscribe/:token` is `404` and writes nothing.
- [ ] A known token is `200`, sets `opted_in = false` and `unsubscribed_at`, and a second use is `200`
      as well and changes nothing further.
- [ ] `PATCH /me/release-emails` without a session is `401`.

**Backend — the mailer (`email.test.ts`)**
- [ ] A release e-mail to a subscription whose `opted_in` is false is refused by the port and nothing is
      sent — the test that keeps a bug in a future caller from mailing someone who opted out.
- [ ] Every release e-mail built carries an unsubscribe link pointing at the subscription's own token.
- [ ] The log adapter writes the whole message and sends nothing; it is what dev and tests use.

**Frontend — the form (`contact.test.ts`)**
- [ ] A valid form produces the request body the API expects, with the token.
- [ ] An empty field is refused before any request, and names the field.
- [ ] A `429` and a `403` are different kinds, each with its own sentence in both catalogs.
- [ ] The form's text and the Turnstile widget's language follow the client's locale.

**Frontend — the pages (`privacy/pages.test.ts`)**
- [ ] `privacidade.html` and `privacy.html` both exist in the build's output, carry the same date, and
      reference each other with `hreflang`.
- [ ] **No `[…]` placeholder survives in either page**, and the six values of section 3 are in them. The
      milestone cannot go green with a bracket in the text: if a future edit to the policy opens a new
      hole, this is the case that says so.
- [ ] Both pages render with JavaScript disabled, which is asserted by the test reading the files and
      finding no `<script>`.
- [ ] The three link sites (the sign-in panel, the contact form, the footer) point at the page of the
      locale the client is in, and the fixture in `index.html` carries the Portuguese one.

## 6. Dependencies

- **m4-01 and m4-02 approved.** m4-04 is needed only for the step-3 checkbox, which goes into the panel
  m4-04 builds, and for the design step's ordering.
- **Nothing is owed by the owner for the policy.** The six placeholders were all answered by 2026-10-16
  and are in section 3's table; the pages have no open input and no fallback path left to take.
- **The English text is a translation I write and the owner reviews**, like the catalogs: the normative
  sentences are translated faithfully, not rewritten.
- **A Redis** on the local flow, which the compose file already has for `platform-api`.
- **Zoho account setup, which is operational and not code** (section 4): `heronoa.com.br` verified as a
  sending domain, and an application-specific password if the account has two-factor authentication. The
  log adapter is the default everywhere but production, so nothing here waits on it — but the production
  deploy does, and it fails as a send error rather than as a boot error.

## 7. Decisions

**D1 · The rate limit is on the IP hash in Redis, and it comes before Turnstile.** The spec asks for
both. Redis is already in the platform's environment, and putting the count there rather than in memory
means it survives a restart and works when there is more than one instance — which M6's autoscaling
makes real.

**D2 · Turnstile fails closed.** A Cloudflare that cannot be reached refuses the message. The
alternative — accepting it when the verifier is down — turns an outage at Cloudflare into an open
contact form, and the contact form is the one unauthenticated write in the system.

**D3 · The message is stored, the notification is best-effort.** See section 4. The reverse — rolling
back the row when the e-mail fails — loses a message because a mail server was busy, and the message is
the thing the owner has to answer.

**D4 · The policy is a static document, not a screen.** Owner's decision D6. A document a person can
link to, read with JavaScript off, and bookmark; and the SPA fallback in `wrangler.jsonc` serves real
files by name, so two HTML files at the output root are enough. The alternative — an overlay inside the
title — reads well and stops being a policy.

**D5 · The policy's date is duplicated, on purpose, and tested on each side.** The page carries it as
text; the platform carries `PRIVACY_VERSION` because it is what `privacy_version_seen` stores. One
import is impossible (the client cannot read a backend package) and one shared file would need a fourth
workspace for one string. Each side has a test on its own constant, and the day they disagree is the day
someone edits the policy without bumping the version — which is exactly the mistake worth catching.

**D6 · The consent checkbox is unchecked by default, in markup and in the schema.** `opted_in` defaults
to false in the column, and the checkbox carries no `checked` attribute, so a page whose script never
runs cannot consent on anyone's behalf. The policy's legal basis for these e-mails is consent
(§ 3), which is only true if the default is off in both places.
