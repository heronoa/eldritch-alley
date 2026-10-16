# Index — M4 · Accounts and persistence (first delivery)

**Created:** 2026-10-16
**Roadmap:** [ROADMAP.md](../../ROADMAP.md) § M4. Accounts and persistence
**Spec:** [m4-accounts-and-persistence.spec.md](../inputs/m4-accounts-and-persistence.spec.md)
**Status:** in progress — m4-01 approved (2026-10-16), m4-02 in progress

## What this delivery covers

Signing in with GitHub and Google, a session cookie, a persistent squad and a battle history. The
project gets a real database with migrations, so the planned AWS deploy (ECS, ALB, RDS) has data to
store. Three smaller pieces the spec pairs with it close the same delivery: the contact form, the
release-email opt-in and the privacy policy page.

What the roadmap's M4 lists and this delivery does **not** do: the replay screen, choosing which
agents go into a match, agent death and level-up. They stay in M4 as a later delivery, and `ROADMAP.md`
§ M4 is rewritten by m4-01 to say exactly that (the spec's last section asks for the split).

## Milestones

| # | Plan | Status | PR |
|---|------|--------|----|
| 0 | Index correction (M3 and M3.5) — first commit of m4-01 | [x] delivered | — |
| 1 | [m4-01-persistence.plan.md](./m4-01-persistence.plan.md) | [x] approved (2026-10-16) | — |
| 2 | [m4-02-auth.plan.md](./m4-02-auth.plan.md) | [~] in progress | — |
| 3 | [m4-03-match-recording.plan.md](./m4-03-match-recording.plan.md) | [ ] pending | — |
| 4 | [m4-04-client.plan.md](./m4-04-client.plan.md) | [ ] pending | — |
| 5 | [m4-05-contact-release-privacy.plan.md](./m4-05-contact-release-privacy.plan.md) | [ ] pending | — |

The PR column is filled when the pull request opens. Milestone 0 is the first commit of m4-01's branch
and not a PR of its own, as the gate below decided.

Milestones 4 and 5 are frontend work, and each is delivered in three steps — **logic → integration →
design** — as the onboarding delivery was (`.ia_context/plans/onboarding.index.md`): three commits,
three PRs, each reviewed on its own. The plan of each milestone carries the split.

## Milestone gate, checked on 2026-10-16

The gate the planning workflow asks for, run against the repository rather than against the indexes —
because the indexes are the thing that is out of date.

| Milestone | Index says | Repository says | Verdict |
|---|---|---|---|
| M2-b | the tunnel reconnection test is pending | owner approved M2 on 2026-10-07 and carried the item into M3's acceptance; M3 was played on a published build | not blocking |
| M3 | `awaiting approval`, all five plans `[ ] pending` | m3-01 to m3-03 merged (`cover.ts`, `facing.ts`, `height.ts`, `abilities.ts`, mana per turn; ADRs 0012–0017 accepted); m3-04 closed on the owner's manual signal (DT-15, 2026-10-14); the playtest happened (`docs/plans/m4-correcoes-playtest.md`, PR #22) | delivered, index stale |
| M3.5 | design `[ ] implemented, awaiting review` | merged in PR #23 (`4b06f15`) | delivered, index stale |

**Outcome (owner, 2026-10-16):** the M4 is planned now, and the two stale indexes plus the M2-b line
are corrected by the first commit of the m4-01 branch. A reviewer who wants `CLAUDE.md` rule 5 kept
strictly can lift that commit into a PR of its own before m4-01 opens; it touches nothing the
persistence work touches.

## Dependency notes

- **m4-01 depends on nothing.** It is the first because every later milestone needs a database and a
  migration path. It also carries the index correction above.
- **m4-02 depends on m4-01**: it needs the `EntityManager`, the entities and the migration runner. It
  can be *reviewed* before m4-01 is merged, because nothing in it changes m4-01's files.
- **m4-03 depends on m4-01** (its three tables) **and on m4-02** (the game ticket it verifies, and the
  users the matches point at). The dependency on m4-02 is a real one, not a bookkeeping one: without a
  ticket there is no way to know which player a match belongs to.
- **m4-04 depends on m4-02 and m4-03**: it calls `/me`, `/auth/game-ticket` and `/me/matches`. Its
  logic step can start once m4-02's contract is frozen, with a fake API, in the same way the match
  client was built against a mocked server.
- **m4-05 depends on m4-01 and m4-02.** It is independent of m4-03 and m4-04 except for the profile
  panel, which m4-04 builds; the checkbox goes into that panel, so m4-05's design step lands after
  m4-04's.
- Each milestone is one branch and one PR (m4-04 and m4-05: three each), in the order above.

## Decisions taken (owner, 2026-10-16)

| # | Question | Answer |
|---|---|---|
| D1 | The stale M3/M3.5 indexes and the pending M2-b item | Correct them in m4-01's first commit and proceed |
| D2 | Shape of the plans | One index, five vertical milestones, as the spec proposes; m4-04 and m4-05 split into logic → integration → design |
| D3 | Where the session state lives | A signed cookie carrying its own state (no Redis, no `sessions` table). Written into ADR 0018 with the consequence: nothing is revocable on the server side in this delivery |
| D4 | Is the database self-sufficient to rebuild a match? | `seed` + `map_id` + `protocol_version`, as the spec has it, **plus** `matches.final_state_hash`, recorded by the match server. The setup is still rebuilt from the code; the hash turns a silent drift into a visible one |
| D5 | Content of the privacy policy | Closed by the owner on 2026-10-16: **Heron Oliveira Amaral** as the controller (an individual registration, so the razão social is the holder's name), CNPJ 58.978.216/0001-06 (check digits verified), AWS region `us-east-1`, mail through Zoho in the `zoho.com` data centre, and `suporte@heronoa.com.br` as the privacy contact, the contact form's destination and the sender. All six placeholders are answered |
| D6 | Where the privacy page lives | Two static HTML pages, one per locale, with no JavaScript and `hreflang` between them |
| D7 | `privacy_version_seen` | Written on every sign-in with the current policy version. No notice, no gate |
| D8 | What counts as a stored match | Every match with a signed-in player that ends, including the one that ends because the player left. `result` is read from that player's side, so leaving is `lost` |
| D9 | Which agent played which unit | The `match-ended` message carries `user_id` and the `unit_id`s; **the consumer** resolves `agent_id` by class. The match server never learns what an agent is |
| D10 | MikroORM entities | Decorators with an explicit type on every property. The `platform-api` `tsconfig` already turns decorators on for Nest |
| D11 | Production hosts | `api.eldritch.heronoa.com.br`, `COOKIE_DOMAIN=.eldritch.heronoa.com.br`, `CLIENT_ORIGIN=https://eldritch.heronoa.com.br`. Config only, read from the environment; no production default is written into the code |

Other decisions the owner took while the plan was prepared, recorded here because they are visible in
the code of more than one milestone: OAuth through `openid-client` and JWTs through `jose`; Turnstile
verified on every request with Cloudflare's official always-passing test keys in development and a fake
adapter in tests; the queue and the mailer behind ports with a fake and a log adapter in tests; only
additive migrations in this delivery.

## Inputs the owner supplied

**D5 — the privacy policy's placeholders, closed on 2026-10-16.** The attached Portuguese text carried
six, and all six are decided:

| Placeholder | Value |
|---|---|
| `[NOME OU RAZÃO SOCIAL]` | `Heron Oliveira Amaral`. It is an individual registration, so the razão social is the holder's own name — which is also how the Receita Federal publishes the CNPJ. Nothing else is needed to write § 1 |
| `[CPF/CNPJ, se quiser informar]` | `CNPJ 58.978.216/0001-06`. The check digits were verified on 2026-10-16 |
| `[E-MAIL DE PRIVACIDADE]` | `suporte@heronoa.com.br` — one address for the privacy contact of § 1 and § 7, and the contact form's destination |
| `[servidor próprio no Brasil; Amazon Web Services, região [REGIÃO]]` | `Amazon Web Services, região us-east-1 (Norte da Virgínia)`. This is the region `docker-compose.yml` and the LocalStack already assume, and it is what makes § 5's transfer sentence concrete |
| `[NOME DO PROVEDOR]` | Zoho, in the `zoho.com` data centre — so `smtp.zoho.com`, and the United States named as the destination in § 5 |
| `[DATA]` | The day the page ships. It is written at the moment m4-05's integration step is merged, and the same date goes into `PRIVACY_VERSION` on the platform side (decision D5 of the m4-05 plan) |

**Belém, Pará, Brasil** as the seat is the owner's own text in the policy, kept as written. The
registered address behind the CNPJ was not checked against it, and the policy stays at the city on
purpose: the street and number of an individual registration are not published here, and m4-05 is not to
add them. The CNPJ and the name beside it are public data at the Receita Federal, which is why § 1 can
carry them.

**OAuth applications.** m4-02 needs a GitHub OAuth app and a Google OAuth client, with
`http://localhost:3000/auth/{provider}/callback` and the production callback registered. The automated
tests use a fake provider and do not need them; the manual run of the milestone does.

## Documentation debt found while planning

All four items are settled by m4-01. Recorded here as they were found, with what closed each one.

- `.ia_context/plans/m3-rules-and-content.index.md` and `.ia_context/plans/onboarding.index.md` were
  corrected by m4-01's first commit (see the gate above). The M3 index gained a § How the milestone
  closed and its ADR table was corrected — it planned five records, six were written, and the numbering
  had drifted by one.
- `ROADMAP.md` § M4 described JWT sign-up/login, squad choice before the match and a replay endpoint in
  this milestone. m4-01 rewrote it into "this delivery" and "the rest of M4", added the ADR rows
  0018–0020 to § Decisions (which stopped at 0006), marked M3 and M3.5 done, and corrected § Current
  state, which still said there were no combat rules and no CI.
- The spec file sat at `.ia_context/inputs/accounts-and-persistance.spec.md`. It is now
  [m4-accounts-and-persistence.spec.md](../inputs/m4-accounts-and-persistence.spec.md), the name the
  spec itself suggests.
- `docs/adr/README.md` listed 0001–0017 and now carries the 0019 row. 0018 and 0020 come with m4-02.

One thing m4-01 did **not** correct, because it is not its subject: `.env.example` still has a
Portuguese section header (`# Portas locais`) in an English repository. One line, worth taking with any
later change to that file.

## ADRs this index opens

| ADR | Decision | Milestone | State |
|---|---|---|---|
| 0018 | Sign-in with GitHub and Google only: OAuth, a session cookie, and a short game ticket signed with an asymmetric key | m4-02 | to write |
| 0019 | MikroORM migrations as a single step before the services start, under a PostgreSQL advisory lock | m4-01 | Accepted ([written](../../docs/adr/0019-migrations-as-a-single-step.md)) |
| 0020 | A persistent squad with a starter set; death and level-up deferred (links ADR 0003's addendum) | m4-02 | to write |

No ADR for m4-03, m4-04 or m4-05. The queue between the two backends and the client screens are
mechanism, not a decision that constrains the future; the pieces of m4-03 that do constrain it (the
message carries everything a replay needs, the database is the one that decides idempotence) are
recorded in ADR 0019 and in the plan.

## Test strategy of the delivery

The spec's list, with where each case lives, because two of them cannot live where the spec implies:

| Case | Where | Why there |
|---|---|---|
| Determinism from storage | `backend/game-server` | The setup a replay needs (`createMatchSetup(seed)`) lives in the match server, and the platform cannot import it without depending on the match server. The server proves the **message** carries enough to rebuild; m4-03's storage round-trip proves the database holds that message unaltered. Together they give the spec's property |
| Account linking | `backend/platform-api` | — |
| Starter squad, once | `backend/platform-api` | — |
| Game ticket (expired, bad signature, absent) | `backend/game-server` for the refusal, `backend/platform-api` for the issuing | The verification is the match server's |
| Idempotent consumer, guests, contact, unsubscribe, migrations | `backend/platform-api` | — |

The gap this leaves — rebuilding a match *from the database* with the engine in the same process — is
opened as a backlog item for the replay delivery, whose plan has to solve it anyway (it needs the map
and class data shared between the two backends). Recording it here rather than pretending the test
exists.
