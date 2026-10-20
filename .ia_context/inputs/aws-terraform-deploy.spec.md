# Spec: AWS infrastructure with Terraform (ECS Fargate, ALB, RDS, ECR, S3)

Suggested location in the repository: `.ia_context/inputs/aws-terraform-deploy.spec.md`.

## Read first

- `CLAUDE.md`. Rule 4 (plan first, wait for approval) and the Git section (no commits; propose the commit split at the end) apply here.
- `ROADMAP.md`: M2-b (Cloudflare and TLS notes), M5 (Colyseus presence and driver on Redis) and M6 (ECR, ECS Fargate, ALB).
- `backend/Dockerfile`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`.
- `frontend/wrangler.jsonc` and `frontend/.env.production`.
- `.ia_context/inputs/m4-accounts-and-persistence.spec.md`, if present: it defines the migrate command, the match queue and the new environment variables this infrastructure has to provide.
- ADR 0008 (Colyseus 0.18) and `.ia_context/README.md` (plans, branch descriptions and pre-reviews are versioned).

## Goal

A public, reviewable Infrastructure as Code repository folder that deploys the backend to AWS: two containers on ECS Fargate behind an Application Load Balancer, PostgreSQL on RDS, Redis on ElastiCache, images in ECR, and a private S3 bucket for user assets. It is a portfolio piece as much as a deployment, so the quality of the decisions and of their documentation counts as much as the resources.

## Ground rules for this task

1. **Write code, never create cloud resources.** Allowed: `terraform fmt`, `terraform init -backend=false`, `terraform validate`, `terraform test` with mocked providers, `tflint`, and the security scanner. **Forbidden:** `terraform apply`, `destroy`, `import`, any `aws` or `gcloud` command that changes anything, and `terraform plan` against a real account unless Heron provides credentials and approves that run. Heron runs the bootstrap and every apply himself (ROADMAP M2-b: every cloud resource needs its own approval).
2. No secret values anywhere in the repository or in the Terraform state (see Secrets).
3. English only in the repository. Small diffs, one subject per plan.
4. Everything below marked "default" is a decision already taken, exposed as a variable so Heron can change it without touching the modules.

## Decisions already taken

| Area | Decision | Why |
|---|---|---|
| Region | `us-east-1` (variable `region`) | Cheaper than `sa-east-1`; the game is turn-based and Cloudflare sits in front. The privacy policy already covers international transfer. |
| Runtime | ECS on Fargate, `awsvpc` | Matches ROADMAP M6. The ADR explains why not EKS or EC2. |
| Network | VPC across 2 AZs. **Public subnets** for the ALB and the Fargate tasks. **Isolated subnets** (no route to the internet) for RDS and ElastiCache. **No NAT gateway.** A free S3 gateway endpoint. | A NAT gateway costs more than the rest of a small stack. Tasks get a public IP and accept traffic only from the ALB security group. No interface endpoints (they bill per hour). |
| Edge | Cloudflare proxies two first-level hostnames to the ALB. SSL mode Full (strict), ACM certificate on the ALB, ALB security group open only to Cloudflare's IP ranges, HTTPS listener only. | Reuses the existing Cloudflare setup. First-level names stay inside Universal SSL (ROADMAP M2-b). |
| Hostnames | `eldritch-aws-api.heronoa.com.br` and `eldritch-aws-game.heronoa.com.br` (variables). The existing `eldritch-game.heronoa.com.br` is the homelab and is not touched. | Hyphenated first-level names, never `a.b.heronoa.com.br`. |
| Database | RDS PostgreSQL 17 (same major as Compose), `db.t4g.micro`, gp3, encrypted, single-AZ by default (`multi_az` variable), 7-day backups, TLS required, `manage_master_user_password = true` (the password lives in a Secrets Manager secret that RDS creates, not in state). | Same engine as local; no password in state. |
| Cache | ElastiCache Redis 7.x, one `cache.t4g.micro` node, encryption at rest and in transit, reachable only from the task security group. | Both services receive `REDIS_URL`; the M4 rate limit and M5 presence need it. |
| Queue | SQS queue `match-ended` plus a dead-letter queue (redrive after 5 receives), SSE-SQS. | Required by the M4 spec. If M4 drops SQS, drop this module. |
| Assets | One private S3 bucket (see the S3 section). | Requested. |
| Images | Two ECR repositories, immutable tags, scan on push, lifecycle policy. Tag = `sha-<short git sha>`. | Reproducible rollouts. |
| Secrets | SSM Parameter Store `SecureString` for application secrets, created by Terraform with a placeholder value and `ignore_changes` on the value. Real values are put by hand with the AWS CLI. | Free tier, no real value in state. |
| State | S3 backend with versioning and encryption, native locking (`use_lockfile`, needs Terraform 1.11 or newer; confirm in the docs). No DynamoDB. | Current recommended locking. |
| CI to AWS | GitHub OIDC, three roles (plan, apply, deploy). No static keys, anywhere. | Same pattern as Workload Identity Federation on GCP. |
| Rollout | Terraform owns the infrastructure. The deploy workflow owns the image in the task definition (`ignore_changes` on the service's `task_definition`). Migrations run as a one-off task before each rollout. | Infrastructure changes and application releases have different cadences and approvals. |
| Scaling | **One game-server task** (`desired_count = 1`, variable). Platform-api: one task, may scale later. | Colyseus needs a shared presence and driver to run more than one process (ROADMAP M5). Document the limit instead of hiding it. |
| Teardown | One variable `destroyable` (default `false`). When `true`: no deletion protection, no final snapshot, `force_destroy` on S3, `force_delete` on ECR. | The production stack is meant to be created and destroyed on demand for demonstrations. |
| Architecture | `X86_64` by default (`cpu_architecture` variable). | ARM is cheaper but needs arm64 image builds; decide later. |

## Layout

```
infra/
  aws/
    bootstrap/        state bucket, GitHub OIDC provider and roles (local state, applied once)
    modules/
      network/        VPC, subnets, route tables, S3 gateway endpoint
      ecr/            repositories and lifecycle policies
      rds/             subnet group, parameter group, instance, security group
      redis/          subnet group, replication group (one node), security group
      sqs/            queue, dead-letter queue, queue policies
      assets-bucket/  private S3 bucket
      alb/            load balancer, listener, ACM certificate, target groups, rules, security group
      edge-dns/       Cloudflare records and the Cloudflare IP ranges
      ecs-cluster/    cluster, log groups
      ecs-service/    reusable: task definition, service, roles, security group (used twice)
      ci-oidc/        GitHub OIDC roles and policies
      alarms/         SNS topic, CloudWatch alarms, budget
    envs/
      prod/           composition of the modules, backend config, variables, outputs
    README.md         architecture diagram (Mermaid), runbook, cost, known limitations
  gcp/                reserved for the later multi-cloud step; empty now
```

Every module has `variables.tf`, `outputs.tf` and a short README with its inputs and outputs. Pin `required_version` and the provider versions (check the registry for the current major of each provider), commit `.terraform.lock.hcl` with hashes for the platforms in use (`terraform providers lock`).

The `aws` provider block sets `allowed_account_ids` (a variable), so Terraform refuses to run against the wrong account, and it never names a `profile`: locally the profile comes from `AWS_PROFILE`, in CI from OIDC. Extend `.gitignore` with `.terraform/`, `*.tfstate`, `*.tfstate.*`, `*.tfplan`, `crash.log` and `backend.hcl`; `.terraform.lock.hcl` stays committed.

Backend configuration is partial. Each stack has a `backend.tf` that declares `backend "s3" {}`, and receives the bucket, key, region, `encrypt` and `use_lockfile` from `backend.hcl` (gitignored; commit a `backend.hcl.example`) or from `-backend-config` flags in CI. State keys: `bootstrap/terraform.tfstate` and `prod/terraform.tfstate`. The bootstrap stack ships **without** a `backend.tf` (local state on its first apply); Heron adds it after the state bucket exists, following his local setup runbook, and commits it. The bootstrap outputs `state_bucket_name`, `plan_role_arn`, `apply_role_arn` and `deploy_role_arn` (that runbook uses these exact names).

Default tags on every resource: `Project=eldritch-alley`, `Environment`, `ManagedBy=terraform`, `Repository`. Names follow `eldritch-<env>-<thing>`.

## Module requirements

### network
- 2 AZs from a data source, not hard-coded. One public and one isolated subnet per AZ.
- The isolated subnets have no route to an internet or NAT gateway.
- Gateway endpoint for S3 on the public route tables (ECR image layers come from S3).
- Outputs the subnet ids and the VPC id. No NAT gateway, ever, in this module.

### ecr
- Repositories `eldritch-alley/game-server` and `eldritch-alley/platform-api`. The one-off migration uses the platform-api image.
- `IMMUTABLE` tags, `scan_on_push`, AES-256 encryption, lifecycle policy: keep the 20 most recent tagged images, expire untagged images after 7 days.

### rds
- Instance in the isolated subnets, `publicly_accessible = false`.
- Security group: ingress 5432 only from the ECS task security group.
- Parameter group with `rds.force_ssl = 1`.
- `deletion_protection = !destroyable`, `skip_final_snapshot = destroyable`, a named final snapshot otherwise.
- Output the endpoint, port, database name, username and the ARN of the managed master secret. Never output a password.

### redis
- Isolated subnets, TLS on (`rediss://`), security group ingress 6379 only from the task security group.
- No auth token in this delivery. Record it in the README as a known limitation (access is limited by security group).

### sqs
- Standard queue plus dead-letter queue. Visibility timeout longer than the consumer's processing time. 14-day retention on the dead-letter queue.
- Output the queue URLs and ARNs. Permissions are granted in the task roles, not with wide queue policies.

### assets-bucket
- Name includes the account id for uniqueness. Block all public access, object ownership "bucket owner enforced", default encryption, versioning on, non-current versions expire after 30 days, incomplete multipart uploads abort after 7 days.
- Bucket policy denies any request without TLS.
- CORS allows only `https://eldritch.heronoa.com.br` (variable) for `GET`, `PUT` and `HEAD`, so a browser can use presigned URLs.
- Key convention for the future application code, written into the module README: `users/<user-uuid>/<kind>/<object-id>`. Only the platform-api task role may read or write, and only under `users/*`.
- **Nothing in the application uses this bucket yet.** The M4 delivery takes avatars from the login provider. This module creates the bucket, the permissions and the `ASSETS_BUCKET` variable; the upload and download endpoints are a later application delivery. Serving through CloudFront is also later.

### alb and edge-dns
- Internet-facing ALB in the public subnets, IPv4 only, `idle_timeout = 120` (Colyseus pings every 3 s; Cloudflare closes idle connections at about 125 s, see ROADMAP M2-b).
- One ACM certificate with both hostnames, DNS validation, the validation records created in Cloudflare as DNS-only.
- One HTTPS listener on 443 with TLS policy `ELBSecurityPolicy-TLS13-1-2-2021-06`. No port 80 listener. Default action: fixed 403 response. Rules by host header to the two target groups.
- Security group: ingress 443 only from Cloudflare's published IPv4 and IPv6 ranges (use the provider's data source if the pinned version has one, or fetch `https://www.cloudflare.com/ips-v4` and `ips-v6`). Keep the rules tidy with a customer-managed prefix list. Egress to the task security group only.
- Target groups: `ip` target type. Platform-api on 3000 with health check `GET /health` (200). Game-server on 2567, deregistration delay 120 s.
- **Game-server health check:** it is not confirmed that the game server answers any HTTP health path. Check the installed Colyseus 0.18 package. If there is none, adding a minimal one is a prerequisite and a separate small change in the application, proposed in the plan. Do not use a catch-all success matcher to hide it.
- Cloudflare records are proxied CNAMEs to the ALB name. Cloudflare SSL mode is Full (strict); set it with Terraform if the pinned provider allows, otherwise list it as a manual step in the runbook.
- Variable `manage_cloudflare_dns` (default `true`). The Cloudflare API token is scoped to DNS edit on the one zone and kept as a GitHub environment secret, never in code.

### ecs-cluster and ecs-service
- One cluster, Container Insights off by default (variable). One log group per service, 14-day retention.
- `ecs-service` is reusable and takes: image, port, CPU and memory (default 256 and 512), environment map, secrets map, target group, security group rules, task-role policy document.
- Tasks run in the public subnets with a public IP. Task security group: ingress only from the ALB security group on the container port.
- Service: deployment circuit breaker with rollback, `minimum_healthy_percent = 100`, `maximum_percent = 200`, health check grace period 60 s, `ignore_changes = [task_definition]` plus `desired_count` managed by the variable.
- `stopTimeout` 120 s on the game-server container.
- **Separate roles per service.** Execution role: pull from ECR, write logs, read only that service's SSM parameters and the RDS secret it needs. Task role: only what the service uses at runtime (platform-api: S3 on `users/*`, SQS receive and delete; game-server: SQS send).
- A third task definition family, `eldritch-<env>-migrate`: platform-api image, platform-api task role and secrets, command from a variable (the M4 migrate command), no service. It is run by the deploy workflow, never on a schedule.
- Optional ECS Exec behind a variable, off by default.
- Services are created with `desired_count = 0` by default (variable `services_enabled`), because the repositories are empty at first apply (see Delivery order).

### ci-oidc (inside `bootstrap`)
- GitHub OIDC provider and three roles. Trust policies check `aud` and the `sub` claim of `heronoa/eldritch-alley`:
  - **plan:** pull requests. Read-only access plus read and lock on the state bucket.
  - **apply:** only `environment:prod`. Creates the infrastructure.
  - **deploy:** only `environment:prod`. ECR push, register task definitions, run the migrate task, update services, `iam:PassRole` limited to the task and execution role ARNs.
- The apply role has to create IAM roles. Scope it to the `eldritch-*` name prefix where possible and put a permissions boundary on the roles it creates. If that takes too long, accept a broader policy for the first version and list the gap under known limitations in the README.

### alarms (lowest priority; can be cut)
- SNS topic with an email subscription. Alarms: ALB target 5xx, unhealthy host count per target group, RDS free storage low, RDS CPU high.
- A monthly AWS Budget (default US$ 50) with an email at 80% and 100%.

## Service contract: environment and secrets

Use `docker-compose.yml`, `.env.example` and the M4 spec as the source of truth for what each service reads, and keep the tables in the module README in sync.

| Variable | Service | Source |
|---|---|---|
| `PLATFORM_API_PORT=3000`, `GAME_SERVER_PORT=2567`, `GAME_SERVER_MAX_MATCHES` | each | plain environment |
| `AWS_REGION` | both | plain environment |
| `REDIS_URL` (`rediss://…`) | both | built from the redis module output |
| `DATABASE_URL` | platform-api and migrate | see Coordination |
| `MATCH_ENDED_QUEUE_URL` | both | sqs module output |
| `ASSETS_BUCKET` | platform-api | assets-bucket output |
| `CLIENT_ORIGIN`, `OAUTH_REDIRECT_BASE_URL` | platform-api | variables (`https://eldritch.heronoa.com.br`, `https://eldritch-aws-api.heronoa.com.br`) |
| `GAME_TICKET_PUBLIC_KEY` | game-server | SSM parameter (a public key, but kept with the rest) |
| `SESSION_SECRET`, `GAME_TICKET_PRIVATE_KEY`, OAuth client secrets, `TURNSTILE_SECRET`, email credentials | platform-api | SSM `SecureString` |
| `JWT_SECRET` | both, **only until the M4 asymmetric tickets land** | SSM `SecureString` |

**Must be absent in AWS:** `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. The SDK uses the task role.

Generate the ticket key pair offline (for example `openssl genpkey -algorithm ed25519`) and put it with `aws ssm put-parameter`. Do not use `tls_private_key`: it would write the private key to the state.

## Coordination with the application (decide in the plan, note the choice in an ADR or the README)

1. **`DATABASE_URL`.** RDS keeps the master password in its own secret as JSON. Two options: **(a) recommended:** the platform-api config accepts `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` and builds the URL when `DATABASE_URL` is not set (a small change in the M4 delivery; ECS injects `DB_PASSWORD` with `valueFrom` the secret's `password` key). **(b)** Terraform assembles the URL and stores it as an SSM parameter, which puts the password in state; only acceptable because the state is private and encrypted. Under (a), the application uses the RDS master user in this delivery; a separate least-privilege database user is a follow-up.
2. **TLS to PostgreSQL and Redis.** The clients must connect with TLS. Verifying the RDS certificate needs the CA bundle inside the image; `sslmode=require` without verification is acceptable inside the VPC for now, documented.
3. **Image.** `backend/Dockerfile` runs as root and copies the whole build stage (dev dependencies included) into the runtime stage. Propose, in the plan, adding `USER node` and pruning dev dependencies, and check `.dockerignore`. Keep it a separate small change.
4. **Migrations.** The migrate command must be idempotent and take the advisory lock (M4 spec). The deploy workflow fails the rollout if the migrate task exits non-zero.
5. **Frontend.** `VITE_GAME_SERVER` is baked into the bundle at build time and points to the homelab hostname. Switching the client to the AWS game hostname is a separate, explicit cutover, not part of this delivery. Nothing here changes where players connect today.
6. **OAuth.** The GitHub and Google OAuth apps need the new callback URL on the AWS API hostname (a runbook step).
7. **Cookie scope.** The session cookie must be host-only (no `Domain` attribute), so it reaches only the API hostname and not the other subdomains of `heronoa.com.br`. The client and the API are same-site, so a cross-origin call with credentials works.

## Pipelines (`.github/workflows/`)

Pin third-party actions by commit SHA. Use the `prod` GitHub environment with a required reviewer for apply and deploy. Workflows read `AWS_REGION` and `AWS_PLAN_ROLE_ARN` from repository variables (pull requests do not use the environment), `AWS_APPLY_ROLE_ARN` and `AWS_DEPLOY_ROLE_ARN` from `prod` environment variables, and `CLOUDFLARE_API_TOKEN` from a `prod` environment secret.

1. **`infra-ci.yml` (pull requests touching `infra/**`):** `terraform fmt -check`, `validate` and `terraform test` per module with mocked providers, `tflint`, a configuration scanner (Trivy config or Checkov, every suppression with a written reason), then `plan` with the OIDC plan role, posted as a PR comment. Optional: an Infracost estimate on the plan.
2. **`infra-apply.yml` (manual, environment `prod`):** `plan`, approval, `apply` with the OIDC apply role.
3. **`deploy.yml` (manual with a git ref, environment `prod`):**
   1. Build the two images from `backend/Dockerfile` with `SERVICE` as the build argument, cache in the GitHub Actions cache.
   2. Scan the images and fail on fixable high or critical findings (the known low and moderate advisories in DT-19 do not block).
   3. Push as `sha-<short sha>` to ECR.
   4. Render a new task definition for the migrate family with the new image, run it once with `aws ecs run-task`, wait, and fail the workflow if the exit code is not 0.
   5. Render and deploy the new task definition revisions for both services and wait for service stability.
   6. Smoke test: `GET https://eldritch-aws-api.heronoa.com.br/health` returns 200 through Cloudflare.
4. **`teardown.yml` (manual, requires typing `destroy-prod`):** `apply -var destroyable=true` first (to lift protections), then `destroy`. Document that player data in a destroyed RDS is lost unless a snapshot was taken on purpose.

## Tests and checks

Native `terraform test` with `mock_provider` (no credentials), `command = plan`, asserting the security invariants:
- RDS and ElastiCache are not publicly reachable and sit in the isolated subnets.
- No security group has `0.0.0.0/0` ingress; the ALB group allows 443 only.
- The ALB has no listener other than HTTPS 443.
- The assets bucket has all four public-access blocks and a TLS-only policy.
- ECR repositories are immutable and scan on push.
- No resource of type `aws_nat_gateway` exists.
- The assets bucket and the state bucket deny unencrypted transport.
- The GitHub OIDC trust policies pin `aud` and the exact `sub` values; none uses a wildcard on the repository.
- Variables with `destroyable = false` keep deletion protection on for RDS and `force_destroy` off for S3 and ECR.

Also: `grep` the repository and the plan output for `AKIA`, `aws_access_key` and private key headers as a CI step.

## ADRs

Take the next free numbers in `docs/adr/` at the time of writing. The M4 spec reserves 0018 to 0020, so these start after it if it is merged first.

1. **AWS runtime:** ECS Fargate, not EKS and not EC2, and the single game-server task until shared presence exists (link to ROADMAP M5).
2. **Network without NAT:** public subnets for tasks with security-group-only ingress, isolated subnets for data stores, and what it costs in exposure.
3. **Cloudflare in front of the ALB:** proxied first-level hostnames, Full (strict), origin restricted to Cloudflare ranges.
4. **Infrastructure and rollout are separate:** Terraform owns the stack, the deploy workflow owns the image, migrations as a one-off task before each rollout.
5. **GitHub OIDC with three roles and no static keys.**

Update `ROADMAP.md` M6 with links to these ADRs. Propose, and do not apply, any change to M2-b about the homelab, for Heron to confirm.

## README (`infra/aws/README.md`)

- Mermaid diagram: Cloudflare, ALB, the two services, RDS, ElastiCache, SQS, S3, ECR, and the GitHub OIDC path.
- Runbook: bootstrap, migrate the bootstrap state into the S3 backend, put the secrets, first apply with services at zero, first deploy, scale up, teardown, and how to restore RDS from a snapshot.
- Monthly cost table computed with the AWS Pricing Calculator or Infracost, not guessed. My rough order of magnitude, to be replaced: about US$ 80 a month if left running, mostly the ALB, public IPv4 addresses, two Fargate tasks, RDS and ElastiCache.
- **Known limitations**, written plainly: one game-server task; a game-server rollout ends live matches (clients reconnect, but a room does not survive the process); the application uses the RDS master user; no WAF; Redis without an auth token; single-AZ database by default; the apply role is broader than ideal (if it is).

## Delivery order

One plan per step in `.ia_context/plans/` with an index. Each step leaves CI green and ends with a PR description and a pre-review.

1. **infra-01 bootstrap and CI skeleton:** state bucket, OIDC provider and roles, `infra-ci.yml`, the `terraform test` setup.
2. **infra-02 foundations:** network, ECR, assets bucket, SQS, SSM parameters.
3. **infra-03 data stores:** RDS and ElastiCache.
4. **infra-04 edge and compute:** ALB, ACM, Cloudflare records, cluster, the two services and the migrate family, all at zero tasks.
5. **infra-05 pipelines:** `infra-apply.yml`, `deploy.yml`, `teardown.yml`.
6. **infra-06 observability, budget, README, ADRs.**

## Out of scope

- Switching players to AWS (the frontend cutover) and DNS for the existing hostnames.
- The multi-cloud (GCP) version.
- WAF, CloudFront, ALB access logs, interface VPC endpoints, autoscaling policies, Fargate Spot.
- Running more than one game-server task (M5).
- A least-privilege database user, RDS Proxy, read replicas, cross-region backups.
- The application code for uploads to the assets bucket.
- Terraform for the homelab.

## Done when

- From an empty account: bootstrap, apply, put the secrets, push images through `deploy.yml`, and `https://eldritch-aws-api.heronoa.com.br/health` returns 200 through Cloudflare.
- A WebSocket connection to the game hostname succeeds and a full match against the bot is played on AWS.
- The migrate task ran once before the rollout, and a second deploy applies nothing new.
- A destroy leaves no billable resource, and a second apply from scratch works.
- `infra-ci.yml` is green: format, validate, tests, lint and scan.
- No static AWS key exists anywhere, no secret value is in the repository, and no security group allows `0.0.0.0/0` except as stated.
- The README, the module READMEs and the ADRs are written, and the commit split is proposed for Heron.
