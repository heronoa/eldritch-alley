# infra-01 · Bootstrap and CI skeleton (plan)

**Index:** [infra-aws-prod.index.md](./infra-aws-prod.index.md)
**Source spec:** [aws-terraform-deploy.spec.md](../inputs/aws-terraform-deploy.spec.md)
**Status:** code written and locally validated (`fmt`, `init -backend=false`, `validate`, `terraform test` with a mocked provider — no credentials used anywhere). Pending Heron's review and `apply`. **Nothing in this plan has been applied to AWS.**

Scope: move the existing Terraform tree under `infra/aws/` (so the `aws/` vs `gcp/` split exists from the start, per the spec), then add the `bootstrap` stack (state bucket + GitHub OIDC + three roles), the `infra-ci.yml` skeleton, and the `terraform test` harness, demonstrated on the bootstrap module. Out of scope: network, ECR, RDS, ALB, ECS — those are infra-02 through infra-04, written and applied only after this step is approved and applied (CLAUDE.md rule 4; same per-resource-group approval discipline as `infra/RUNBOOK.md`).

## Decisions

| Item | Value | Source |
|---|---|---|
| AWS account | `510915414773`, same as stg | Heron, 2026-10-16 |
| Region | `us-east-1` | spec |
| Repository layout | `infra/terraform/` → `infra/aws/`; `infra/gcp/` created empty with a one-line `README.md` ("reserved for a later multi-cloud step") | Heron, 2026-10-16 |
| State bucket scope | Serves `bootstrap/terraform.tfstate` and `prod/terraform.tfstate` only. Stg keeps its local `terraform.tfstate` under `infra/aws/envs/stg/` (unchanged content, new path) | Heron, 2026-10-16 |
| Locking | Native S3 locking (`use_lockfile`), no DynamoDB table | spec |
| GitHub repository | `heronoa/eldritch-alley` | existing OIDC convention would need this confirmed — **open question below** |

## Open question before apply (not blocking the plan, blocking the apply)

The OIDC trust policies need the exact GitHub repository slug (`owner/repo`) to pin the `sub` claim. This plan assumes `heronoa/eldritch-alley` (matching the account owner and project name); if the actual GitHub remote differs, the trust policies must be corrected before `apply`, not after — a wrong `sub` either refuses every CI run or (worse, if left wildcarded) trusts tokens from any fork. Will confirm against `git remote -v` / the GitHub repo settings at implementation time.

## Step 0: repository layout migration (no cloud resources touched)

This is a file move, not an infrastructure change, but it touches the already-applied stg stack's source tree, so it is listed as its own step with its own check.

- `git mv infra/terraform infra/aws` (preserves history). Verify afterward:
  - `infra/aws/envs/stg/main.tf`'s `file("${path.module}/../../../../deploy/stg/docker-compose.yml")` still resolves — the path depth from `infra/<x>/envs/stg/` to the repo root is unchanged whether `<x>` is `terraform` or `aws`, so this reference needs no edit. Confirmed by counting: `envs/stg` → `<x>` → `infra` → repo root is 4 levels either way.
  - `module "network"` / `module "ecr"` / `module "ec2"` sources (`../../modules/...`) are relative to `envs/stg/`, so they resolve the same way after the move.
  - `infra/RUNBOOK.md` line 3 ("Terraform code is in `terraform/`") is updated to `infra/aws/terraform/`... actually to `infra/aws/` directly (the `terraform/` segment is dropped in the new layout — confirm final path below).
- Decide and apply one naming convention consistently: either `infra/aws/<modules|envs>/...` (dropping the `terraform/` segment, matching the spec's literal layout) — this plan uses this form.
- `mkdir -p infra/gcp` with a placeholder `README.md`: "Reserved for a later multi-cloud step (see `aws-terraform-deploy.spec.md`). Empty by design."
- Update every relative path reference that breaks: `infra/RUNBOOK.md`, and a repo-wide `grep -rn "infra/terraform"` to catch any other mention (checked so far: only `infra/RUNBOOK.md` and this plan's own index reference it; `ROADMAP.md` and `README.md` do not name the path).
- No `.gitignore` change needed: the existing Terraform ignore rules (`*.tfstate`, `*.tfstate.*`, `.terraform/`, `*.tfvars`) are path-independent globs.

**Check:** `cd infra/aws/envs/stg && terraform init -backend=false && terraform validate` succeeds from the new path, with no code change to `.tf` files (only the move). Heron re-points his local `AWS_PROFILE=eldritch-stg` shell session at the new directory; the local `terraform.tfstate` file (gitignored) is moved by hand together with the directory, since it is not tracked by git.

## Step 1: bootstrap stack (`infra/aws/bootstrap/`)

Local state on this first apply (no `backend.tf` yet, per the spec: Heron adds it once the bucket exists, following the layout's own convention, then commits it).

Resources, in apply order:

1. **State bucket** (`aws_s3_bucket`, name convention `eldritch-tfstate-510915414773`, no per-env suffix since it holds both `bootstrap/` and `prod/` keys): versioning on, default encryption (SSE-S3 or SSE-KMS — decide at implementation; SSE-S3 is simpler and sufficient here), all four public-access-block settings on, bucket policy denying any request where `aws:SecureTransport` is false.
2. **GitHub OIDC provider** (`aws_iam_openid_connect_provider`, `token.actions.githubusercontent.com`). Confirm at implementation time whether the pinned `hashicorp/aws` provider version still requires an explicit `thumbprint_list` or validates it automatically (recent provider majors stopped requiring it); document whichever applies.
3. **Three IAM roles**, each with a web-identity trust policy restricted to this one OIDC provider, condition on `aud = sts.amazonaws.com` and the exact `sub`:
   - `eldritch-prod-ci-plan`: `sub = repo:heronoa/eldritch-alley:pull_request`. Permissions: read-only on the resources the prod stacks will create (deferred to a managed policy added incrementally as later steps introduce new resource types — see Follow-ups), plus `s3:GetObject`/`s3:PutObject` on the state bucket's lock mechanism (read + lock, no write to the real state key) and `dynamodb:none` (no DynamoDB in this design).
   - `eldritch-prod-ci-apply`: `sub = repo:heronoa/eldritch-alley:environment:prod`. Broad enough to create the infrastructure from infra-02 onward; scoped to resources tagged `Project=eldritch-alley` and `Environment=prod` where the AWS API supports resource-level tag conditions, with a documented exception for IAM role/policy creation (tags cannot gate IAM creation the same way — scope by `eldritch-*` name prefix instead, as the spec allows as a fallback).
   - `eldritch-prod-ci-deploy`: `sub = repo:heronoa/eldritch-alley:environment:prod`. ECR push/pull, `ecs:RegisterTaskDefinition`, `ecs:RunTask`, `ecs:UpdateService`, `iam:PassRole` limited to the (not-yet-existing) task and execution role ARNs — this role's policy will need a follow-up edit once infra-04 creates those roles and their ARNs are known; note this as a forward dependency, not a gap to fix now.
4. **Outputs:** `state_bucket_name`, `plan_role_arn`, `apply_role_arn`, `deploy_role_arn` — these exact names, because `infra/aws/README.md`'s runbook (written in infra-06, but the names are fixed now) and the GitHub repository/environment variables read them verbatim.

## Step 2: CI skeleton (`.github/workflows/infra-ci.yml`)

Triggered on pull requests touching `infra/**`. Jobs, each independent so a failure in one does not hide the others:

1. `terraform fmt -check` across every stack and module under `infra/aws/`.
2. `terraform validate` per stack (`bootstrap`, `envs/stg`, `envs/prod` once it exists).
3. `terraform test` per module with `mock_provider` (see Step 3).
4. `tflint`.
5. A configuration scanner (Trivy config, to reuse the scanner family already used for image scanning in the spec's `deploy.yml`, unless Checkov proves a better fit at implementation time — decide and record the choice, not both).
6. `grep` the diff and the plan output for `AKIA`, `aws_access_key`, and PEM/private-key headers — fails the job on a match.
7. A real `terraform plan` against AWS using the OIDC plan role, posted as a PR comment — **wired into the workflow file now, but inert until Heron applies this bootstrap stack and sets `AWS_REGION` / `AWS_PLAN_ROLE_ARN` as repository variables.** Until then this job step is expected to fail or be skipped; call that out explicitly in the PR description for this step so it is not mistaken for a broken pipeline.

The existing `.github/workflows/ci.yml` (app typecheck/test/build) is untouched; `infra-ci.yml` is a new, separate workflow file, scoped by its `paths: ['infra/**']` trigger so it never runs on application-only PRs.

## Step 3: `terraform test` harness

Establish the pattern once, on the `bootstrap` module, for infra-02 onward to reuse:

- `infra/aws/bootstrap/tests/bootstrap.tftest.hcl`, `command = plan`, `mock_provider "aws" {}` (no real credentials, no network access).
- Assertions for this module specifically: the three IAM role trust policies each pin an exact `sub` string (no wildcard), and the state bucket's policy denies non-TLS requests.
- Document the convention in a short `infra/aws/README.md` stub (the full README with the architecture diagram and runbook is infra-06's job; this stub only states "`terraform test` lives under `<module>/tests/*.tftest.hcl`, run via `terraform test` from the module directory, mocked provider, no credentials needed").

## Repository changes (on approval)

| Path | Operation | What changes |
|---|---|---|
| `infra/terraform/` → `infra/aws/` | move | `git mv`, no content change to the moved `.tf` files |
| `infra/gcp/README.md` | create | one-line placeholder |
| `infra/RUNBOOK.md` | modify | update the one path reference to the new layout |
| `infra/aws/bootstrap/{main,variables,outputs,versions,providers}.tf` | create | state bucket, OIDC provider, three roles |
| `infra/aws/bootstrap/tests/bootstrap.tftest.hcl` | create | the assertions above |
| `infra/aws/README.md` | create | stub only (full version in infra-06) |
| `.github/workflows/infra-ci.yml` | create | the six jobs above |

No change to `.gitignore` in this step (the existing Terraform globs already cover the new path).

## Terraform permissions needed to apply this plan

The existing `terraform-eldritch-stg` IAM user's policy (see `infra/RUNBOOK.md` step 2) does **not** cover this: it has no S3-bucket-creation, no `iam:CreateOpenIDConnectProvider`, no `iam:CreateRole` beyond the single `eldritch-stg-ec2` role. Heron needs to either extend that user's policy or create a separate `terraform-eldritch-bootstrap` identity (recommended, since bootstrap is a one-time, higher-privilege apply distinct from the recurring stg/prod applies) with:

- `s3:CreateBucket`, `s3:PutBucketVersioning`, `s3:PutBucketPolicy`, `s3:PutBucketPublicAccessBlock`, `s3:PutEncryptionConfiguration` on the one named bucket.
- `iam:CreateOpenIDConnectProvider`, `iam:GetOpenIDConnectProvider`, `iam:TagOpenIDConnectProvider`.
- `iam:CreateRole`, `iam:PutRolePolicy`, `iam:AttachRolePolicy`, `iam:TagRole`, scoped to the `eldritch-prod-ci-*` name prefix.
- `sts:GetCallerIdentity`.

This is a bootstrap-only identity; it is not reused by the recurring plan/apply/deploy OIDC roles, which are scoped much tighter per the spec.

## Cost

Negligible for this step: an S3 bucket with a handful of small state objects, an IAM OIDC provider, and three IAM roles cost nothing by themselves. No compute, network, or data-store resource is created here.

## Acceptance

1. `infra/aws/envs/stg/` validates from its new path with no behavior change to the already-applied stg stack.
2. `terraform fmt -check`, `validate`, and `terraform test` pass locally for `infra/aws/bootstrap/` with a mocked provider — no credentials used.
3. `infra-ci.yml` runs on a PR touching `infra/**` and all jobs except the live `plan` step (expected inert, see Step 2) pass.
4. After Heron's own `apply` (outside this plan, with his credentials and explicit approval): the three IAM roles exist with the exact `sub` conditions above, the bucket exists with versioning and the TLS-only policy, and `terraform plan` run a second time shows no changes.
5. Heron sets the GitHub repository variables (`AWS_REGION`, `AWS_PLAN_ROLE_ARN`, `TF_STATE_BUCKET`) and the `prod` environment variables/secrets (`AWS_APPLY_ROLE_ARN`, `AWS_DEPLOY_ROLE_ARN`, `CLOUDFLARE_API_TOKEN`) from the bootstrap outputs, with a required reviewer configured on the `prod` environment. `TF_STATE_BUCKET` is an addition beyond the spec's named variables, needed by `infra-ci.yml`'s `plan` job to build its `-backend-config`; it is simply `state_bucket_name` copied into a repository variable.

## Implementation notes (what actually happened, 2026-10-16)

- `thumbprint_list` is **omitted** on `aws_iam_openid_connect_provider.github`: checked the `hashicorp/aws` 6.67.0 resource schema directly (`terraform providers schema -json`) and the attribute is optional+computed, so AWS fetches and verifies GitHub's certificate chain itself. Typing a thumbprint by hand (a 40-hex-char SHA-1) risked pinning a wrong or stale value with no local way to verify it; the schema check is the safer path.
- The `terraform test` runs in `bootstrap/tests/bootstrap.tftest.hcl` use `command = apply`, not `command = plan` as the spec's "Tests and checks" section implies by default. Reason, found while running the suite locally: the trust policies embed `aws_iam_openid_connect_provider.github.arn`, a computed value, inside a single `jsonencode(...)` string. Any unknown input makes the whole encoded string unknown during `plan`, so the `sub`/`aud` assertions cannot evaluate until `apply` — still fully mocked, never touching AWS. This pattern is written into `infra/aws/README.md`'s stub for infra-02 onward to reuse without re-discovering it.
- Every third-party action SHA in `infra-ci.yml` was resolved from the real tag through `gh api repos/<owner>/<repo>/tags` (or `/git/refs/tags/<tag>`, checking `object.type == "commit"` to avoid pinning an annotated tag's own object id by mistake), not typed from memory.
- `tflint` and the Trivy config scanner could not be installed or run locally in this sandbox (no piping installer scripts to a shell, by policy), so their job definitions in `infra-ci.yml` follow each tool's documented usage but are **unverified by a real run** — flagged here the same way the live `plan` step is flagged as inert, so the first real PR against `infra/**` is the actual check, not this plan.
- `deploy/stg/docker-compose.yml`'s comment referencing `infra/terraform/modules/ec2` was updated to `infra/aws/modules/ec2` as part of the layout move (one more reference than the plan's repository-changes table listed).
- The game-server health-check gap is tracked as [DT-69](../inputs/technical-debt.md) in the technical-debt list, per Heron's instruction, rather than only as a note inside this plan — Heron confirmed the MikroORM/persistence work this spec assumes is in progress on a separate branch, so DT-69 is scoped strictly to the missing HTTP route, not to the broader M4 gap already covered in the index.

## Rollback

- Before apply: nothing exists in AWS; the file move can be reverted with `git mv infra/aws infra/terraform` (or `git revert`).
- After apply: `terraform destroy` in `infra/aws/bootstrap`, after Heron's approval. The state bucket must be emptied of objects first if it already holds `prod/terraform.tfstate` (destroying infra-01 before any later step exists is the only safe order).
- The file move itself has no AWS-side rollback concern — it is pure source control.

## Follow-ups (not in this plan)

- The `plan` and `apply` roles' permission policies are written incrementally: infra-01 can only scope them to "what bootstrap itself needs to read/lock," and each later step (infra-02 network/ECR, infra-03 RDS/Redis, infra-04 ALB/ECS) adds its own resource types to these policies as a small diff on top of this one. Call this out in each later plan rather than guessing the full policy now.
- The `deploy` role's `iam:PassRole` resource list is a placeholder until infra-04 creates the task/execution roles; it is not functional until then.
- Migrating stg's state from local to this S3 bucket is explicitly deferred (Heron's decision, 2026-10-16); revisit after prod exists, as a small, separate plan.
- Confirming the GitHub repository slug used in the trust policies, if it turns out not to be `heronoa/eldritch-alley`.
