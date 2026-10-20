# infra-05 · Pipelines: infra-apply.yml, deploy.yml, teardown.yml (plan)

**Index:** [infra-aws-prod.index.md](./infra-aws-prod.index.md)
**Source spec:** [aws-terraform-deploy.spec.md](../inputs/aws-terraform-deploy.spec.md)
**Milestone:** 5 of 6
**Created:** 2026-10-20
**Status:** pending approval. **Nothing in this plan is written as code.**

Written ahead of the index's usual gate (infra-01 through infra-04 applied) because Heron asked for it on 2026-10-20 — the same exception infra-02 used. The workflows can be reviewed and merged now; **`infra-apply.yml` must not be run until infra-01 is applied** (no state bucket or CI roles otherwise), and **`deploy.yml` must not be run until infra-02 and infra-04 are both applied** (no ECR repositories, cluster or services to deploy into).

## 1. Objective

Add the three workflows that move prod from "infrastructure exists" to "an image runs behind it": `infra-apply.yml` (apply the Terraform stack with a required reviewer), `deploy.yml` (build, scan, push and roll out both services plus the one-off migration), and `teardown.yml` (destroy on a typed confirmation). No Terraform resource is created by this plan.

## 2. Decisions carried in (from the spec and earlier plans)

| Item | Value | Source |
|---|---|---|
| Environment gate | `prod` GitHub environment, required reviewer, used by `infra-apply.yml` and `deploy.yml`; `infra-ci.yml`'s PR `plan` job does **not** use it | spec, infra-01 |
| Roles | `AWS_PLAN_ROLE_ARN` (repo var, PRs); `AWS_APPLY_ROLE_ARN` / `AWS_DEPLOY_ROLE_ARN` (prod environment vars), from infra-01's bootstrap outputs | infra-01 |
| State | `infra-apply.yml` and `teardown.yml` read/write `prod/terraform.tfstate` in the infra-01 bucket, same `-backend-config` flags as `infra-ci.yml`'s `plan` job | infra-01, spec |
| Image tag | `sha-<short git sha>` of the ref `deploy.yml` is given | spec |
| ECR repositories | fixed names decided in infra-02 (Q1): `eldritch-alley/prod/game-server`, `eldritch-alley/prod/platform-api` | infra-02 |
| Cluster / service / family names | fixed and deterministic from `envs/prod`: cluster `eldritch-prod`; services and families `eldritch-prod-platform-api`, `eldritch-prod-game-server`; migrate family `eldritch-prod-migrate` (`local.name` plus the `ecs-service` module's `"${prefix}-${name}"`) | infra-04 code |
| Migrate command | `["node", "dist/migrate.js"]`, already the migrate task's container command (`envs/prod/variables.tf`'s `migrate_command`) | infra-04 code |
| Rollout order | migrate task first, fail the workflow on a non-zero exit; then both services. `ignore_changes = [task_definition]` is already in place, so this workflow — not Terraform — owns task definition revisions from here on | spec, infra-04 |
| Teardown | typed confirmation `destroy-prod`, then `apply -var destroyable=true` (lifts protections), then `destroy` | spec |
| Image scan | Trivy, `scan-type: image`, severity `CRITICAL,HIGH` — same tool and threshold as `infra-ci.yml`'s config scan; the severity filter alone passes DT-19's known low/moderate `npm audit` findings through, no allowlist needed | Heron, this round |
| App-side gaps | the `DATABASE_URL` assembly (infra-04 Q2) and the game-server HTTP health route (DT-69) are **not** closed yet; documented here as prerequisites for the *first real* `deploy.yml` dispatch, not for writing or merging this plan — the same framing infra-04 already used for the same two items | Heron, this round |
| Dockerfile hardening | left as a separate follow-up, not bundled into this plan | Heron, this round |

## 3. Findings that change earlier steps

- **`infra-ci.yml`'s `plan` job cannot actually plan `envs/prod` today.** `providers.tf` has `provider "cloudflare" {}` (empty — it reads `CLOUDFLARE_API_TOKEN` from the process environment), and `cloudflare_zone_id` is a required variable while `manage_cloudflare_dns` is true (the default). Neither is wired into `infra-ci.yml`. infra-04's own dependency notes (§9) flagged this as infra-05's job: *"infra-ci's live plan step will not work against envs/prod until it is given CLOUDFLARE_API_TOKEN and the zone id... infra-05 owns wiring both."* Fixed here as Part 0 — see Q1 below for the token's scope.
- The other four jobs in `infra-ci.yml` (`fmt-and-validate`, `test`, `tflint`, `scan`, `secret-grep`) already iterate every directory they find under `infra/aws`, so they need no change for anything this plan adds.

## 4. Open questions, with a recommendation for each

### Q1. Scope of the Cloudflare token given to the PR `plan` job

The `plan` job runs on every pull request touching `infra/**`, deliberately without the `prod` environment gate (a PR plan should not need a required-reviewer approval just to run). Handing it the same DNS-**edit** token `apply`/`deploy` use would give write access to the zone to any workflow run triggered by a PR.

| Option | Effect |
|---|---|
| **(a) A second, narrower repository secret `CLOUDFLARE_API_TOKEN_READONLY`** (Zone Settings Read + DNS Read only, no Edit, same zone), used only by the `plan` job. The prod-environment `CLOUDFLARE_API_TOKEN` (DNS Edit) stays reserved for `apply`/`deploy`. `cloudflare_zone_id` becomes a plain repository variable `CLOUDFLARE_ZONE_ID` (not a secret — zone ids are not sensitive), read by all three workflows. **Recommended.** | One more Cloudflare token for Heron to create and store, scoped down from the start. No PR-triggered run can ever write a DNS record. |
| (b) Reuse the prod-environment `CLOUDFLARE_API_TOKEN` for the `plan` job too, outside the `environment:` gate | Fewer tokens to manage, but a PR run gets a DNS-edit-capable credential merely to run `terraform plan`. |
| (c) Leave `infra-ci.yml`'s `plan` job inert for `envs/prod`'s Cloudflare resources, as it is today, and only ever plan it inside `infra-apply.yml` | Simplest, but a regression from how every earlier step behaves (a live plan comment on every PR touching `infra/**`), and it leaves open the exact gap infra-04 asked this plan to close. |

The rest of this plan assumes (a).

### Q2. Image build/push shape in `deploy.yml`

| Option | Effect |
|---|---|
| **(a) A `strategy: matrix` job over `[game-server, platform-api]`** builds, scans and pushes each image in parallel; a second job, `needs: [build]`, runs the migrate task and both rollouts once both images exist. **Recommended.** | Less duplicated YAML; the two builds run concurrently; a scan failure on either image stops the rollout job before anything touches ECS. |
| (b) Four sequential steps in one job (build, scan, push, build, scan, push) | Reads top-to-bottom without a matrix, but doubles wall-clock time and repeats near-identical blocks. |

The rest of this plan assumes (a).

## 5. Files created or modified

| Path | Operation | What changes |
|---|---|---|
| `.github/workflows/infra-ci.yml` | modify | Part 0: the `plan` job's prerequisite check and `terraform plan` step get `CLOUDFLARE_API_TOKEN` (from the new `CLOUDFLARE_API_TOKEN_READONLY` repo secret) and `TF_VAR_cloudflare_zone_id` (from the new `CLOUDFLARE_ZONE_ID` repo variable). |
| `.github/workflows/infra-apply.yml` | create | `workflow_dispatch`, `environment: prod`. `plan`, then, once the environment's required reviewer approves the job, `apply` with the OIDC apply role. |
| `.github/workflows/deploy.yml` | create | `workflow_dispatch` with a `ref` input, `environment: prod`. Build, scan and push both images (matrix); run the migrate task; roll out both services; smoke test. |
| `.github/workflows/teardown.yml` | create | `workflow_dispatch` with a `confirm` input that must equal `destroy-prod`, `environment: prod`. `apply -var destroyable=true`, then `destroy`. |
| `infra/aws/README.md` | modify | One line pointing at the three new workflows (the full runbook narrative is infra-06's job). |

## 6. Workflow contracts

### 6.1 `infra-ci.yml` (Part 0, modified)

- `plan` job gains: repo variable `CLOUDFLARE_ZONE_ID` → `TF_VAR_cloudflare_zone_id`; repo secret `CLOUDFLARE_API_TOKEN_READONLY` → `CLOUDFLARE_API_TOKEN`, scoped to that step only.
- The `Check prerequisites` step's `ready` flag gains a third condition: `if [ -z "${{ vars.CLOUDFLARE_ZONE_ID }}" ]; then ready=false`.
- No change to `fmt-and-validate`, `test`, `tflint`, `scan` or `secret-grep`.

### 6.2 `infra-apply.yml`

- Trigger: `workflow_dispatch`, no inputs — it always plans and, on approval, applies the one `prod` stack.
- `environment: prod` on the job: this is what makes the required reviewer gate fire before `apply` runs, the same GitHub mechanism already configured for the environment in infra-01.
- Steps: checkout → `hashicorp/setup-terraform` → `terraform init` with the same `-backend-config` flags `infra-ci.yml`'s `plan` job uses → `terraform plan -out=prod.tfplan` (OIDC apply role; `TF_VAR_cloudflare_zone_id` from `CLOUDFLARE_ZONE_ID`; `CLOUDFLARE_API_TOKEN` from the prod environment secret) → `terraform apply prod.tfplan`.
- Permissions: `id-token: write`, `contents: read`.
- Exposes nothing to later workflows: `deploy.yml` and `teardown.yml` depend on Heron having run this successfully, not on any workflow output or artifact.

### 6.3 `deploy.yml`

- Trigger: `workflow_dispatch` with input `ref` (branch, tag or sha to build and ship).
- `environment: prod`.
- Job `build` (matrix `service: [game-server, platform-api]`):
  1. Checkout `inputs.ref`.
  2. `aws-actions/configure-aws-credentials` with the deploy role.
  3. `aws-actions/amazon-ecr-login`.
  4. `docker/setup-buildx-action`, then `docker/build-push-action`: `context: .`, `file: backend/Dockerfile`, `build-args: SERVICE=${{ matrix.service }}`, `push: false`, `load: true`, tag `<registry>/eldritch-alley/prod/${{ matrix.service }}:sha-<short sha>`.
  5. Trivy image scan on the loaded tag (`scan-type: image`, severity `CRITICAL,HIGH`, `exit-code: 1`).
  6. `docker push` the same tag, now that the scan passed.
- Job `rollout` (`needs: build`):
  1. `configure-aws-credentials` with the deploy role.
  2. Render a new migrate task definition revision (`aws ecs register-task-definition`, family `eldritch-prod-migrate`, the new platform-api image) and `aws ecs run-task` with `--network-configuration awsvpcConfiguration={subnets=[$MIGRATE_TASK_SUBNET_IDS],securityGroups=[$MIGRATE_TASK_SECURITY_GROUP_ID],assignPublicIp=ENABLED}` — both environment-variable values copied by Heron from infra-04's outputs (`migrate_task_subnet_ids`, `migrate_task_security_group_id`) into `prod` environment variables after that apply, the same pattern already used for the bootstrap outputs. `aws ecs wait tasks-stopped`, then fail the job unless the container's exit code is `0`.
  3. Register new task definition revisions for `eldritch-prod-platform-api` and `eldritch-prod-game-server` (new image, same role/environment/secrets as the current revision — `ignore_changes = [task_definition]` in Terraform is exactly why this workflow owns revisions from here on) and `aws ecs update-service --force-new-deployment` on each.
  4. `aws ecs wait services-stable` on both services.
  5. Smoke test: `curl -fsS https://eldritch-aws-api.heronoa.com.br/health` through Cloudflare, expect `200`.
- Exposes nothing to `teardown.yml`: teardown only needs `infra-apply.yml`'s state, not anything `deploy.yml` produced.

### 6.4 `teardown.yml`

- Trigger: `workflow_dispatch` with input `confirm` (string).
- First step fails the job unless `inputs.confirm == 'destroy-prod'`.
- `environment: prod`.
- `terraform apply -var destroyable=true` (lifts deletion protection, `force_destroy`, `force_delete`), then `terraform destroy` — both with the apply role and the same backend config as `infra-apply.yml`.

## 7. Tests

`terraform test`'s mocked-provider pattern doesn't reach this layer — there's no mock runner for GitHub Actions YAML. What this plan checks locally without credentials, flagging the rest the same way infra-01 flagged its own unverifiable steps instead of hiding them:

- [ ] `actionlint` (falling back to `yamllint` if `actionlint` isn't available in the sandbox) passes on the three new workflow files and the modified `infra-ci.yml`.
- [ ] Every third-party action is pinned by commit SHA resolved from the real tag (`gh api repos/<owner>/<repo>/tags`), not typed from memory, the same check infra-01 ran.
- [ ] The `teardown.yml` confirmation guard is reviewed by reading the step's condition; there's no sandbox to actually dispatch the workflow.
- **Not verified by anything in this plan, flagged rather than hidden:** that `docker/build-push-action`'s `load: true` followed by a plain `docker push` actually publishes the loaded image to the registry the way the documented pattern claims. The first real dispatch of `deploy.yml` is the check.
- **Not verified:** whether the deploy role's existing IAM policy (infra-01, §9 below) is sufficient for the exact `RegisterTaskDefinition` / `RunTask` / `UpdateService` calls this workflow makes — the policy's own comment already notes ECS doesn't support fine resource-level scoping the way IAM does, so a denial on the first real run says what to widen, not something to guess here.

## 8. Dependencies

- **infra-01 applied**, so `infra-apply.yml` has a state bucket and an apply role to use.
- **infra-02 and infra-04 applied**, so `deploy.yml` has repositories, a cluster and services to deploy into — required to *run* `deploy.yml`, not to write or merge this plan.
- **Heron creates and stores:** `CLOUDFLARE_API_TOKEN_READONLY` (repo secret, Zone/DNS Read only) and `CLOUDFLARE_ZONE_ID` (repo variable) for Part 0; confirms the DNS-Edit `CLOUDFLARE_API_TOKEN` (prod environment secret) that infra-04 already depends on is set.
- **Heron copies, after infra-04's apply, into `prod` environment variables:** `MIGRATE_TASK_SUBNET_IDS` and `MIGRATE_TASK_SECURITY_GROUP_ID` — infra-04's outputs of the same names, the only two values this plan needs that aren't deterministic from the naming convention.
- **Before the first real `deploy.yml` dispatch, not before this plan is merged** (carried over from infra-04 §9, restated here because this is the step that actually exercises them): the `DATABASE_URL` application change, or Terraform assembling it instead (infra-04 Q2's alternative); and the game-server HTTP health route (DT-69), or a confirmed built-in equivalent.

## 9. Terraform permissions needed to apply

None beyond what infra-01 already created — this plan writes no new Terraform resource. `infra-apply.yml` uses the existing apply role (`PowerUserAccess` plus scoped IAM). `deploy.yml` uses the existing deploy role (ECR push/pull and ECS register/run/update, the `ecr-push-and-ecs-rollout` policy). If the first real `deploy.yml` run is refused on a specific action, that names the gap to add to the deploy role's policy; nothing here guesses it in advance.

## 10. Cost

GitHub Actions minutes only: two image builds, one migrate run, two service rollouts per deploy dispatch. No new AWS resource is created by this plan. Running `teardown.yml` removes everything infra-02 through infra-04 created; a destroyed RDS instance loses player data unless a snapshot was taken on purpose (spec, carried over).

## 11. Out of scope

- The Terraform code itself (infra-01 through infra-04, already written).
- Alarms, the budget, the README diagram, the known-limitations section and the ADRs (infra-06).
- The `DATABASE_URL` application change, the game-server health route (DT-69) and the `Dockerfile` hardening — tracked, not bundled into this plan (Heron's decision, this round).
- The frontend cutover to the AWS game hostname.
- Autoscaling, more than one game-server task, Fargate Spot.
- A staging counterpart to any of these three workflows — stg is operated by hand per `infra/RUNBOOK.md`.

## 12. Acceptance

1. `actionlint` (or `yamllint`) passes on the three new files and the modified `infra-ci.yml`.
2. Every third-party action's pinned SHA resolves to the tag named in its trailing comment.
3. Once Heron sets `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN_READONLY`, `infra-ci.yml`'s `plan` job posts a live plan comment on a PR touching `infra/**`, including one that only touches `envs/prod`'s Cloudflare-related resources.
4. After Heron's own dispatch of `infra-apply.yml` (outside this plan): the `prod` stack's plan and apply both complete without the Cloudflare provider failing for lack of credentials.
5. After Heron's own dispatch of `deploy.yml`, once infra-02/infra-04 are applied and the two application-side gaps (§8) are closed: the migrate task exits `0`, both services reach steady state, and the smoke test returns `200` through Cloudflare. A second dispatch with the same `ref` registers no task definition revision with different content.
6. `teardown.yml` refuses to run unless `confirm` is exactly `destroy-prod`.

## 13. Suggested commit and pull request split (when the code exists)

1. `fix(infra): wire Cloudflare credentials into the infra-ci plan job` — Part 0, `infra-ci.yml` only.
2. `feat(infra): add infra-apply workflow` — `infra-apply.yml`.
3. `feat(infra): add deploy workflow` — `deploy.yml`.
4. `feat(infra): add teardown workflow` — `teardown.yml`.
5. `docs(infra): point the README at the new workflows` — `infra/aws/README.md`, this plan's status.
