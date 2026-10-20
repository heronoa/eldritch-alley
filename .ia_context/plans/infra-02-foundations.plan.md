# infra-02 · Foundations: network, ECR, assets bucket, SQS, SSM parameters (plan)

**Index:** [infra-aws-prod.index.md](./infra-aws-prod.index.md)
**Source spec:** [aws-terraform-deploy.spec.md](../inputs/aws-terraform-deploy.spec.md)
**Milestone:** 2 of 6
**Created:** 2026-10-17
**Status:** pending approval. **Nothing in this plan is written as code or applied to AWS.**

Written ahead of the index's usual gate (infra-01 applied) because Heron asked for it on 2026-10-17. The plan can be reviewed now; **its code must not be applied until infra-01 is applied**, because every stack here reads the state bucket and the CI roles that infra-01 creates.

## 1. Objective

Create the `envs/prod` stack and the five foundation resource groups that every later step builds on, all without compute, load balancer or data stores. What this step exposes to infra-03 and infra-04:

- a 2-AZ VPC with public and isolated subnets, and no NAT gateway;
- two ECR repositories;
- one private assets bucket;
- the `match-ended` queue and its dead-letter queue;
- the SSM parameter namespace `/eldritch-alley/prod/`, with placeholder values.

## 2. Decisions carried in (from the spec and the index)

| Item | Value | Source |
|---|---|---|
| Region | `us-east-1` (variable `region`) | spec |
| Account | `510915414773`, enforced by `allowed_account_ids` | index |
| Provider | no `profile` argument; `AWS_PROFILE` locally, OIDC in CI | spec |
| State | `prod/terraform.tfstate` in the infra-01 bucket, native locking | spec, infra-01 |
| Naming | `eldritch-prod-<thing>` | spec |
| Tags | `Project=eldritch-alley`, `Environment=prod`, `ManagedBy=terraform`, `Repository` | spec |
| Teardown | variable `destroyable` (default `false`) wired into S3 `force_destroy` and ECR `force_delete` now; RDS part arrives in infra-03 | spec |
| Cost | about US$ 0 per month: no NAT, no interface endpoints, no compute; S3, SQS, SSM standard parameters and ECR storage are cents at this size | spec, to be confirmed by infra-06's table |

## 3. Open questions, with a recommendation for each

These came up while reading the code against the spec. Nothing below is decided; each default is what the plan assumes until Heron answers.

### Q1. ECR repository names collide with stg

The stg stack already owns `eldritch-alley/game-server` in this same account (`infra/aws/envs/stg/main.tf`, module `ecr`). The spec names the prod repositories `eldritch-alley/game-server` and `eldritch-alley/platform-api`. ECR names are unique per account and region, so prod cannot create the first one.

| Option | Effect |
|---|---|
| **(a) Prod repositories get an environment segment**: `eldritch-alley/prod/game-server`, `eldritch-alley/prod/platform-api` | Independent lifecycle and teardown per environment. Departs from the spec's literal names. The deploy role's resource pattern `repository/eldritch-alley/*` already matches, so infra-01 needs no change. **Recommended.** |
| (b) Prod reads stg's `game-server` repository through a data source and creates only `platform-api` | Keeps the spec names. `destroyable` could not clean the shared repository, and stg and prod share one lifecycle policy (stg keeps 10 images, the spec wants 20). |
| (c) Rename stg's repository | Touches an applied stack and its running instance's image reference. Highest risk. |

### Q2. Reuse or leave alone the stg `network` and `ecr` modules

`modules/network` (one AZ, one public subnet, no isolated subnets) and `modules/ecr` (one repository, keeps 10 images) are used by the applied stg stack. The spec's prod versions need 2 AZs, isolated subnets, two repositories and a different lifecycle. Rewriting the shared modules changes resource addresses in stg's state, and I cannot verify a "no changes" plan against the real account (spec ground rule 1).

| Option | Effect |
|---|---|
| **(a) New modules `vpc` and `ecr-repos`; the stg modules stay untouched** | Zero risk to stg. Some duplicated code until stg is retired or migrated. **Recommended.** |
| (b) Extend the existing modules with new variables and `moved` blocks | One module set, but the stg plan can only be verified by Heron against the real account. |
| (c) Rewrite and re-apply stg | Replaces the running staging instance's network. Not proposed. |

The rest of this plan assumes (a) and (a) of Q1.

### Q3. SSM parameter list is incomplete in the sources

The spec's environment table names `SESSION_SECRET`, `GAME_TICKET_PRIVATE_KEY`, `GAME_TICKET_PUBLIC_KEY`, `JWT_SECRET`, `TURNSTILE_SECRET`, "OAuth client secrets" and "email credentials". Of these, only `JWT_SECRET` exists in the repository today (`.env.example`). The M4 spec that would define the rest (`m4-accounts-and-persistence.spec.md`) is not in the repository, so the exact variable names for the OAuth secrets (GitHub and Google are mentioned by the spec's OAuth item) and for the email credentials are **unknown**. I will not invent them.

| Option | Effect |
|---|---|
| **(a) Create now the parameters whose names the spec gives; leave the OAuth and email ones out, as a map variable with one entry per line to add later** | Useful immediately, no guessing. Adding a parameter later is a one-line change plus an apply. **Recommended.** |
| (b) Defer every SSM parameter to infra-04, when the task definitions reference them | No parameter is created before it is needed. Loses the early place for Heron to put values. |
| (c) Create the OAuth and email ones with provisional names | Risks renaming (destroy and create) when the M4 spec lands. |

### Q4. SQS visibility timeout depends on a consumer that does not exist yet

The spec asks for a visibility timeout "longer than the consumer's processing time". The consumer is part of the unfinished platform-api work. Default assumed: variable `visibility_timeout_seconds`, default 30 (the AWS default), to be raised in infra-04 or when the consumer lands. The value is a placeholder, not a measurement.

### Q5. `envs/prod` activates the live `plan` job in CI

`.github/workflows/infra-ci.yml` skips its live `plan` step while `infra/aws/envs/prod` does not exist, and its comments say the directory "arrives in infra-04". This step creates it. After infra-01 is applied and Heron sets the repository variables, that job will start planning against the real state on every pull request touching `infra/**`. That is the intended behavior, and only the stale comments need editing (see section 4). Confirm you want it to start at infra-02 and not at infra-04.

## 4. Files created or modified

| Path | Operation | What changes |
|---|---|---|
| `infra/aws/envs/prod/versions.tf` | create | `required_version` and provider pin, same as infra-01's stacks |
| `infra/aws/envs/prod/providers.tf` | create | `aws` provider with `allowed_account_ids`, no `profile`, default tags |
| `infra/aws/envs/prod/backend.tf` | create | `backend "s3" {}` (partial configuration) |
| `infra/aws/envs/prod/backend.hcl.example` | create | bucket, key `prod/terraform.tfstate`, region, `encrypt`, `use_lockfile` |
| `infra/aws/envs/prod/variables.tf` | create | `region`, `allowed_account_ids`, `destroyable`, `vpc_cidr`, `assets_cors_origin`, `visibility_timeout_seconds`, SSM parameter map |
| `infra/aws/envs/prod/main.tf` | create | composition of the five modules below |
| `infra/aws/envs/prod/outputs.tf` | create | VPC id, subnet ids, repository URLs, bucket name and ARN, queue URLs and ARNs, SSM prefix |
| `infra/aws/envs/prod/.terraform.lock.hcl` | create | generated by `terraform providers lock` for the platforms in use |
| `infra/aws/modules/vpc/{main,variables,outputs}.tf` + `README.md` | create | see section 5.1 |
| `infra/aws/modules/ecr-repos/{main,variables,outputs}.tf` + `README.md` | create | see section 5.2 |
| `infra/aws/modules/assets-bucket/{main,variables,outputs}.tf` + `README.md` | create | see section 5.3 |
| `infra/aws/modules/sqs/{main,variables,outputs}.tf` + `README.md` | create | see section 5.4 |
| `infra/aws/modules/ssm-parameters/{main,variables,outputs}.tf` + `README.md` | create | see section 5.5. Not in the spec's layout list; added because the spec assigns the parameters to this step and gives them no module |
| `infra/aws/modules/*/tests/*.tftest.hcl` | create | one file per module, plus `envs/prod/tests/` for composition checks (section 7) |
| `.gitignore` | modify | add `*.tfplan`, `crash.log`, `backend.hcl`, as the spec requires. infra-01 left it unchanged because no `backend.hcl` existed yet |
| `.github/workflows/infra-ci.yml` | modify | edit the stale "arrives in infra-04" comments and notice text; no behavior change (Q5). Optional, one added step: fail if `aws_nat_gateway` appears under `infra/aws/modules` or `infra/aws/envs/prod` |
| `infra/aws/README.md` | modify | update the stack list line for `envs/prod` |
| `.ia_context/plans/infra-aws-prod.index.md` | modify | link this plan in row 2 |

No change to `infra/aws/bootstrap/`, `infra/aws/envs/stg/`, `modules/network`, `modules/ecr` or `modules/ec2`.

## 5. Module contracts

Each module has `variables.tf`, `outputs.tf` and a short README with its inputs and outputs.

### 5.1 `vpc`

- **Inputs:** `name`, `vpc_cidr` (default `10.1.0.0/16`, chosen not to overlap stg's `10.0.0.0/16`), `tags`.
- **Resources:** one VPC (DNS support and hostnames on), one internet gateway, two availability zones taken from `aws_availability_zones` (not hard-coded), one public and one isolated subnet per zone with CIDRs derived by `cidrsubnet`, one public route table (default route to the internet gateway) shared by the public subnets, one isolated route table with only the local route, one S3 gateway endpoint attached to the **public** route tables.
- **Outputs:** `vpc_id`, `public_subnet_ids`, `isolated_subnet_ids`, `availability_zones`, `s3_gateway_endpoint_id`.
- **Never:** a NAT gateway, an interface endpoint, or a route from an isolated subnet to the internet or NAT.
- **Security groups are not created here.** They belong to the modules that own the workload (infra-03, infra-04).

### 5.2 `ecr-repos`

- **Inputs:** `repository_names` (set of strings; default for prod are the two names from Q1 option a), `destroyable`.
- **Resources:** per repository, `IMMUTABLE` tags, `scan_on_push`, AES-256 encryption, `force_delete = destroyable`, lifecycle policy: keep the 20 most recent tagged images, expire untagged images after 7 days.
- **Outputs:** `repository_urls` and `repository_arns`, both maps keyed by name.

### 5.3 `assets-bucket`

- **Inputs:** `name` (the stack passes a name that includes the account id), `cors_allowed_origin` (default `https://eldritch.heronoa.com.br`), `destroyable`.
- **Resources:** a private bucket with all four public-access blocks, object ownership `BucketOwnerEnforced`, default SSE-S3 encryption, versioning on, a lifecycle rule that expires non-current versions after 30 days and aborts incomplete multipart uploads after 7 days, a bucket policy that denies requests without TLS, CORS allowing only the one origin for `GET`, `PUT` and `HEAD`, `force_destroy = destroyable`.
- **Outputs:** `bucket_name`, `bucket_arn`.
- **Does not grant access to any role.** The platform-api task role (read and write under `users/*` only) does not exist until infra-04, which attaches that permission on the role side. The key convention `users/<user-uuid>/<kind>/<object-id>` is written in the module README.
- **Nothing in the application uses this bucket yet** (spec). Upload endpoints and CloudFront are later work.

### 5.4 `sqs`

- **Inputs:** `name`, `visibility_timeout_seconds` (Q4), `max_receive_count` (default 5), `destroyable` is not needed.
- **Resources:** the `match-ended` standard queue, its dead-letter queue (14-day retention), a redrive policy after 5 receives, SSE-SQS on both.
- **Outputs:** `queue_url`, `queue_arn`, `dlq_url`, `dlq_arn`.
- **Does not attach queue policies.** Send and receive permissions are granted in the task roles (infra-04).

### 5.5 `ssm-parameters`

- **Inputs:** `prefix` (`/eldritch-alley/prod`), `parameters` (map of name to `{ type, description }`).
- **Resources:** one `aws_ssm_parameter` per entry, value a fixed non-empty placeholder (SSM rejects empty values), `lifecycle { ignore_changes = [value] }` so a value Heron puts by hand is never overwritten.
- **Default entries (Q3 option a):** `SESSION_SECRET`, `GAME_TICKET_PRIVATE_KEY`, `JWT_SECRET` as `SecureString`; `GAME_TICKET_PUBLIC_KEY` as `SecureString` too (the spec says it is kept with the rest). `TURNSTILE_SECRET` is named by the spec and also created. OAuth and email entries are absent until their names are known.
- **Outputs:** `parameter_arns` (map), `prefix`.
- **Secrets policy:** no real value in code or state. The ticket key pair is generated offline and put with `aws ssm put-parameter` (the spec forbids `tls_private_key`). The module README lists the exact commands, with prompts, never with a value on the command line.

## 6. Contract of `envs/prod` toward infra-03 and infra-04

Exposes as outputs, by these names: `vpc_id`, `public_subnet_ids`, `isolated_subnet_ids`, `repository_urls`, `repository_arns`, `assets_bucket_name`, `assets_bucket_arn`, `match_ended_queue_url`, `match_ended_queue_arn`, `match_ended_dlq_arn`, `ssm_prefix`, `ssm_parameter_arns`. infra-03 and infra-04 add their modules to this same stack (one `prod` state, key `prod/terraform.tfstate`) and read these values as module references, not through remote state.

**This step does not:** create security groups, IAM roles, an ALB, a certificate, DNS records, a database, a cache, any compute, any alarm or budget, or any workflow other than editing comments in `infra-ci.yml`.

## 7. Tests

All with `mock_provider "aws" {}`, no credentials, run with `terraform test` from each module directory. Following infra-01's finding, assertions on policy documents that embed computed ARNs use `command = apply`; the rest use `command = plan`. The `vpc` tests use `override_data` for `aws_availability_zones`, because a mocked data source would otherwise return no zones.

**`vpc`**
- [ ] Two public and two isolated subnets, in two distinct zones.
- [ ] No isolated route table has a route to `0.0.0.0/0`.
- [ ] The public route table's default route targets the internet gateway, never a NAT gateway.
- [ ] The S3 gateway endpoint is attached to the public route tables and not to the isolated one.
- [ ] Subnet CIDRs lie inside `vpc_cidr` and do not overlap.

**`ecr-repos`**
- [ ] Every repository is `IMMUTABLE` with `scan_on_push` on.
- [ ] `force_delete` follows `destroyable` (false by default, true when set).
- [ ] The lifecycle policy keeps 20 tagged images and expires untagged ones after 7 days.

**`assets-bucket`**
- [ ] All four public-access-block settings are true.
- [ ] The bucket policy denies `aws:SecureTransport = false`.
- [ ] Versioning is enabled; non-current versions expire after 30 days; multipart uploads abort after 7.
- [ ] CORS has exactly one origin and exactly the methods `GET`, `PUT`, `HEAD`.
- [ ] `force_destroy` follows `destroyable`.

**`sqs`**
- [ ] The main queue's redrive policy points to the dead-letter queue with `maxReceiveCount = 5`.
- [ ] The dead-letter queue retains messages for 14 days.
- [ ] Both queues have server-side encryption on.

**`ssm-parameters`**
- [ ] Every parameter is under the given prefix and is `SecureString` for the default entries.
- [ ] No parameter value is anything other than the fixed placeholder.
- [ ] `ignore_changes` covers `value` (asserted by checking the resource is not replaced when the value changes in a second run, or, if the test framework cannot express that, by a code review item and a README note).

**`envs/prod` composition**
- [ ] No resource in the composed plan has `0.0.0.0/0` ingress (trivially true here, kept so infra-03 and infra-04 cannot break it).
- [ ] `terraform fmt -check`, `init -backend=false`, `validate` pass.

Also: the CI `grep` for `AKIA`, `aws_access_key` and private key headers must stay green.

## 8. Dependencies

- **infra-01 applied** by Heron: the state bucket must exist before `init`, and the three OIDC roles before the CI `plan` job can run. Without it, everything in this plan can be written and validated locally, but not planned against the real account.
- **`backend.hcl`** created by Heron from `backend.hcl.example`, with the bucket name from infra-01's output `state_bucket_name`.
- **Heron's answers to Q1 to Q5**, or acceptance of the recommended defaults.
- No application dependency. The M4 spec is needed only to complete Q3 and Q4, not to apply this step.

## 9. Terraform permissions needed to apply

Heron applies this stack himself (spec ground rule 1). The identity needs: S3 bucket creation and configuration on the one named assets bucket; EC2 VPC, subnet, route table, internet gateway and VPC endpoint management; ECR repository creation and lifecycle policy on `eldritch-alley/prod/*`; SQS queue creation; `ssm:PutParameter`, `ssm:GetParameter`, `ssm:DeleteParameter` and tagging on `/eldritch-alley/prod/*`; read and write on `prod/*` in the state bucket; `sts:GetCallerIdentity`. The CI apply role from infra-01 (`PowerUserAccess` plus scoped IAM) already covers all of this; this step creates no IAM resource.

## 10. Out of scope

- Security groups, IAM roles for tasks, the ALB, ACM, Cloudflare records and the WAF (infra-04); RDS and ElastiCache (infra-03); alarms, budget, README diagram and ADRs (infra-06); the three workflows beyond comment edits (infra-05).
- OAuth and email SSM parameters (Q3), until the M4 spec defines their names.
- Application changes: the SQS consumer, the assets upload endpoints, the `DATABASE_URL` assembly, the game-server health route (DT-69, needed before infra-04).
- Migrating stg to the S3 backend, or retiring the stg modules.
- Any change to the `backend/Dockerfile` (a separate small change proposed in infra-04's plan).

## 11. Acceptance

1. `terraform fmt -check`, `init -backend=false`, `validate` and `terraform test` pass locally for every new module and for `envs/prod`, with no credentials.
2. The stg stack's files are byte-for-byte unchanged (`git diff` shows nothing under `infra/aws/envs/stg`, `modules/network`, `modules/ecr`, `modules/ec2`).
3. `infra-ci.yml` passes on a pull request touching `infra/**`; the live `plan` step behaves as described in Q5.
4. After Heron's own `apply` (outside this plan): the VPC has two public and two isolated subnets and no NAT gateway; both repositories exist, immutable and scanning; the bucket exists with the four blocks and the TLS-only policy; both queues exist; every default SSM parameter exists with the placeholder; a second `terraform plan` shows no changes.
5. Heron puts the real values of the default SSM parameters by hand, and a second `plan` still shows no changes (this is what `ignore_changes` is for).

## 12. Suggested commit split (when the code exists)

1. `feat(infra): add prod stack scaffold and vpc module` — `envs/prod/*` scaffold, `modules/vpc`, `.gitignore`.
2. `feat(infra): add ecr-repos, assets-bucket, sqs and ssm-parameters modules` — the four modules with their tests.
3. `docs(infra): update CI comments and README for the prod stack` — `infra-ci.yml` comments, `infra/aws/README.md`, this plan's status.
