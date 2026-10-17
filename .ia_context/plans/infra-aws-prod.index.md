# Index — AWS prod infrastructure (ECS Fargate, ALB, RDS, ECR, S3)

**Created:** 2026-10-16
**Source:** [aws-terraform-deploy.spec.md](../inputs/aws-terraform-deploy.spec.md)

## Decisions carried into every plan below

Resolved with Heron on 2026-10-16, before infra-01 was written:

| Decision | Choice | Why it matters here |
|---|---|---|
| Repository layout | Move `infra/terraform/` (stg, already applied) to `infra/aws/`, alongside the new prod modules. `infra/gcp/` stays reserved and empty. | The spec's layout assumes an `aws/` vs `gcp/` split from the start. Moving stg now, instead of leaving two parallel layouts, is part of infra-01. |
| State bucket scope | The bootstrap's S3 state bucket serves **prod only**. Stg keeps local state for now; migrating it is a separate, later item. | Keeps infra-01 scoped to what this spec needs. No change to how stg is operated. |
| AWS account | Prod uses the same account as stg, `510915414773` (see [infra/RUNBOOK.md](../../infra/RUNBOOK.md)). | `allowed_account_ids` in the prod provider block is fixed, not a placeholder. Stg and prod share account-level limits (budget, IAM, service quotas); flagged as a known limitation in infra-06. |
| WAF | Prod gets an AWS WAFv2 web ACL associated with the ALB, with a per-IP rate-based rule. Added on 2026-10-17; it supersedes the spec's "WAF out of scope" line. | The ALB only accepts Cloudflare ranges, so the rate rule must key on the client IP forwarded by Cloudflare (`CF-Connecting-IP`), not on the connection IP, or every client shares one counter. WAF is billed per web ACL, per rule and per request; infra-06's cost table must include it. |

## Steps

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [infra-01-bootstrap-and-ci.plan.md](./infra-01-bootstrap-and-ci.plan.md) | [x] code written, pending Heron's review and apply | — |
| 2 | [infra-02-foundations.plan.md](./infra-02-foundations.plan.md) (network, ECR, assets bucket, SQS, SSM parameters) | [ ] plan written, pending Heron's answers to its open questions and approval; code not written | — |
| 3 | [infra-03-data-stores.plan.md](./infra-03-data-stores.plan.md) (RDS, ElastiCache) | [x] code written and validated locally (mocked provider), pending Heron's review and apply (Q6, apply timing, still open) | — |
| 4 | infra-04-edge-and-compute.plan.md (ALB, ACM, WAF web ACL, Cloudflare records, ECS cluster, the two services, migrate family, at zero tasks) | [ ] not written | — |
| 5 | infra-05-pipelines.plan.md (infra-apply.yml, deploy.yml, teardown.yml) | [ ] not written | — |
| 6 | infra-06-observability-and-docs.plan.md (alarms, budget, README, ADRs) | [ ] not written | — |

## Dependency notes

- Each step is written only after the previous one is **approved and applied by Heron** (CLAUDE.md rule 4; `infra/RUNBOOK.md`-style approval per resource group, same discipline as the stg plan).
- infra-02 needs infra-01's bootstrap outputs (`state_bucket_name`, the three OIDC role ARNs) to configure its backend and CI.
- infra-03 needs infra-02's network module (isolated subnets) and SSM prefix.
- infra-04 needs infra-02 (network, ECR images must exist — see infra-02's own note on `services_enabled`) and infra-03 (RDS/Redis endpoints for the service environment maps). infra-04 also depends on a **small, separate application change**, tracked as [DT-69](../inputs/technical-debt.md): the game-server has no HTTP health endpoint today (confirmed: `backend/game-server/src/main.ts` only opens a raw Colyseus `WebSocketTransport`, no Express app attached). That change is proposed inside infra-04's plan, not bundled into this Terraform work.
- infra-04 owns the WAF module. The source spec ([aws-terraform-deploy.spec.md](../inputs/aws-terraform-deploy.spec.md)) still lists WAF under "Out of scope" and "Known limitations"; this index overrides it, and the spec text is left as written until Heron decides whether to update it. infra-06 drops "no WAF" from the known limitations.
- infra-05 needs working images in ECR (infra-02) and services defined but at zero tasks (infra-04).
- infra-06 is written last on purpose, per the spec's own delivery order, even though some of its ADRs document decisions already baked into infra-01–04.

## Application state (corrected 2026-10-17)

The first version of this index said `platform-api` had no persistence. That described the `feat/init-terraform` branch, which is behind `develop`. Checked on `develop` (read-only) on 2026-10-17, confirmed by Heron:

- `platform-api` has MikroORM, entities, a migrate command (`npm run migrate`, `src/migrate.ts`, advisory lock per the M4 spec), accounts, OAuth and the SQS consumer.
- `.ia_context/inputs/m4-accounts-and-persistence.spec.md` exists on `develop`. It names the environment variables the infrastructure has to provide, including `OAUTH_GITHUB_CLIENT_SECRET`, `OAUTH_GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `COOKIE_DOMAIN`, `TURNSTILE_SECRET`, `EMAIL_FROM` and `CONTACT_NOTIFY_TO`. The email provider's own settings are still undecided there ("the provider is chosen later").

What this changes:

- infra-02's SSM parameter list (its Q3) is **incomplete**: the two OAuth client secrets now have known names and can be added as one line each to `ssm_parameters`. The email credentials stay out until the provider is chosen. Not applied to infra-02's code; that is a small follow-up.
- `DATABASE_URL` is still a decision for infra-04. `platform-api` reads only `DATABASE_URL`, a `postgres://` string; it does not accept `DB_HOST` and `DB_PASSWORD`. The spec's option (a) therefore needs a small application change that does not exist yet, and option (b) puts the password in state.
- The M4 spec says the session cookie is "scoped to the parent domain", while the AWS spec asks for a host-only cookie (coordination item 7). infra-04 must pick one and say so.
- infra-03 (RDS) and the SQS part of infra-02 are no longer built ahead of the application; the application work they serve already exists. `ecs-service` still starts at `desired_count = 0`, because the images are not in ECR yet.
