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

## Steps

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [infra-01-bootstrap-and-ci.plan.md](./infra-01-bootstrap-and-ci.plan.md) | [x] code written, pending Heron's review and apply | — |
| 2 | infra-02-foundations.plan.md (network, ECR, assets bucket, SQS, SSM parameters) | [ ] not written | — |
| 3 | infra-03-data-stores.plan.md (RDS, ElastiCache) | [ ] not written | — |
| 4 | infra-04-edge-and-compute.plan.md (ALB, ACM, Cloudflare records, ECS cluster, the two services, migrate family, at zero tasks) | [ ] not written | — |
| 5 | infra-05-pipelines.plan.md (infra-apply.yml, deploy.yml, teardown.yml) | [ ] not written | — |
| 6 | infra-06-observability-and-docs.plan.md (alarms, budget, README, ADRs) | [ ] not written | — |

## Dependency notes

- Each step is written only after the previous one is **approved and applied by Heron** (CLAUDE.md rule 4; `infra/RUNBOOK.md`-style approval per resource group, same discipline as the stg plan).
- infra-02 needs infra-01's bootstrap outputs (`state_bucket_name`, the three OIDC role ARNs) to configure its backend and CI.
- infra-03 needs infra-02's network module (isolated subnets) and SSM prefix.
- infra-04 needs infra-02 (network, ECR images must exist — see infra-02's own note on `services_enabled`) and infra-03 (RDS/Redis endpoints for the service environment maps). infra-04 also depends on a **small, separate application change**, tracked as [DT-69](../inputs/technical-debt.md): the game-server has no HTTP health endpoint today (confirmed: `backend/game-server/src/main.ts` only opens a raw Colyseus `WebSocketTransport`, no Express app attached). That change is proposed inside infra-04's plan, not bundled into this Terraform work.
- infra-05 needs working images in ECR (infra-02) and services defined but at zero tasks (infra-04).
- infra-06 is written last on purpose, per the spec's own delivery order, even though some of its ADRs document decisions already baked into infra-01–04.

## Known gap carried from the spec

`platform-api` on `develop` currently has no MikroORM, no `DATABASE_URL` consumption, no migrate command and no SQS consumer (checked: only a `HealthController` exists). Heron confirmed (2026-10-16) this work is in progress on a separate branch, not abandoned. `.ia_context/inputs/m4-accounts-and-persistence.spec.md` does not exist in this repo yet. This means:

- infra-03 (RDS) and the SQS part of infra-02 are being built **ahead of** the application code that will use them. That is consistent with the spec ("If M4 drops SQS, drop this module") and with `ecs-service` starting at `desired_count = 0`.
- The "Coordination with the application" items in the spec (how `DATABASE_URL` is assembled, the migrate command itself) cannot be finalized until the M4 application plan exists. infra-03 and infra-04 will state this as an open dependency rather than guess at a command.
