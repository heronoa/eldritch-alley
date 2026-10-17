# infra-04 · Edge and compute: ALB, ACM, WAF, Cloudflare, ECS (plan)

**Index:** [infra-aws-prod.index.md](./infra-aws-prod.index.md)
**Source spec:** [aws-terraform-deploy.spec.md](../inputs/aws-terraform-deploy.spec.md)
**Milestone:** 4 of 6
**Created:** 2026-10-17
**Status:** pending approval. **Nothing in this plan is written as code or applied to AWS.**

Written ahead of the index's usual gate (infra-02 and infra-03 applied) because Heron asked for it. The plan can be reviewed now; **its code must not be applied until infra-02 and infra-03 are applied**, because it reads the VPC, the data stores and the task security groups they create.

This is the largest step of the delivery. It is one plan with three parts that ship as three pull requests (see Q1): **Part 0** corrects earlier steps (section 3 explains why it cannot wait), **Part A** is the edge, **Part B** is the compute.

## 1. Objective

Put the application behind a public, protected entrypoint and define how it runs, with every service at zero tasks:

- an internet-facing ALB that only Cloudflare can reach, with an ACM certificate and a WAF web ACL;
- the two Cloudflare records, proxied, plus the certificate validation records;
- an ECS cluster, two services (platform-api and game-server) and a one-off migrate task family, each service with its own execution and task role.

What this step exposes to infra-05: the cluster and service names, the task definition family names, the migrate family, the security group ids, the log groups and the hostnames, so the deploy workflow can build images, run the migration and roll out without guessing.

## 2. Decisions carried in

| Item | Value | Source |
|---|---|---|
| Runtime | ECS Fargate, `awsvpc`, `X86_64` by default (variable `cpu_architecture`) | spec |
| Edge | Cloudflare proxies two first-level hostnames to the ALB; SSL mode Full (strict); ACM certificate; ALB open only to Cloudflare; HTTPS listener only | spec |
| Hostnames | `eldritch-aws-api.heronoa.com.br` and `eldritch-aws-game.heronoa.com.br` (variables). The existing homelab hostname is not touched | spec |
| ALB | IPv4 only, `idle_timeout = 120`, TLS policy `ELBSecurityPolicy-TLS13-1-2-2021-06`, default action a fixed 403, rules by host header | spec |
| WAF | A WAFv2 web ACL on the ALB with a per-IP rate rule keyed on `CF-Connecting-IP` | index, 2026-10-17 |
| Security groups | One per service, created in infra-03; this step adds their rules. The `ecs-service` module takes `security_group_id` as an input | infra-03 plan, Q1 |
| Tasks | Public subnets, public IP, ingress only from the ALB group; no NAT, no interface endpoints | spec |
| Rollout | Terraform owns the infrastructure, the deploy workflow owns the image (`ignore_changes` on the service's `task_definition`); migrations are a one-off task before each rollout | spec |
| Scaling | One game-server task (`desired_count = 1` once enabled), one platform-api task; every service starts at 0 (`services_enabled = false`) | spec |
| Circuit breaker | Enabled with rollback; `minimum_healthy_percent = 100`, `maximum_percent = 200`, health check grace 60 s | spec |
| Logs | One log group per service, 14-day retention; Container Insights off by default | spec |
| ECS Exec | Behind a variable, off by default | spec |
| Teardown | `destroyable` already wired through the stack; nothing new here needs it except ensuring the ALB has no deletion protection when it is `true` | spec |

## 3. Findings that change earlier steps

Found while checking the spec against `develop` (read-only) on 2026-10-17. Each one is a fact, not a guess; the "so what" is proposed in Part 0.

1. **The match queue must be FIFO, and infra-02 created a standard one.** `backend/game-server/src/queue.ts` on `develop` sends with `MessageGroupId` and `MessageDeduplicationId` and its comment says "the match queue, which is a FIFO one". `docker/localstack/init/01-queues.sh` creates `match-ended.fifo` and `match-ended-dlq.fifo` (`FifoQueue=true`, `ContentBasedDeduplication=false`, visibility 30, redrive after 5). The spec said "standard queue" and infra-02 followed it. A standard queue rejects `MessageGroupId`, so the game-server could not publish a finished match. **A queue cannot change type; it has to be replaced, and a FIFO name must end in `.fifo`.** The visibility timeout of 30 chosen as a placeholder in infra-02 matches the local one.
2. **The task security groups from infra-03 have no egress.** A Terraform-managed security group created without rules loses AWS's default allow-all egress. With no NAT and no endpoints, a task can pull nothing (ECR, SSM, Secrets Manager, SQS, S3, the OAuth providers all need outbound HTTPS). This step adds the egress rules explicitly.
3. **The CI roles from infra-01 do not match the roles this step creates.**
   - The deploy role's `PassRole` allows only `arn:aws:iam::*:role/eldritch-prod-*-task`. Registering a task definition also passes the **execution** role, whose name would not end in `-task`.
   - The apply role's scoped IAM list lacks actions the provider needs when it creates and reads roles (for example `iam:UpdateAssumeRolePolicy`, `iam:ListRoleTags`, `iam:ListInstanceProfilesForRole`, `iam:GetInstanceProfile`). This is a reading of the code, not a tested failure.
   - The apply role may edit any role named `eldritch-*`, which includes `eldritch-prod-ci-apply` itself, so it can widen its own permissions. The `prod` environment's required reviewer is the only brake today.
4. **`JWT_SECRET` is not read by the code on `develop`.** No `process.env.JWT_SECRET` remains in `backend/*/src`; `docker-compose.yml` still lists it as required. Likewise `REDIS_URL` and `ASSETS_BUCKET` are not read yet (the spec asks for them anyway).
5. **The SSM parameter list from infra-02 is incomplete.** The OAuth client secrets and the SMTP password now have names (`OAUTH_GITHUB_CLIENT_SECRET`, `OAUTH_GOOGLE_CLIENT_SECRET`, `EMAIL_SMTP_PASSWORD`).
6. **The session cookie always carries a `Domain` attribute.** `backend/platform-api/src/auth/session.ts` builds `Domain=${COOKIE_DOMAIN}` and `COOKIE_DOMAIN` is required. The spec's "host-only cookie" is therefore not reachable by omission; it is reachable by choosing the value (Q3).
7. **The game-server still has no HTTP health route on `develop`**, and the technical-debt item DT-69 exists only on this branch, not on `develop`. Whether Colyseus 0.18 answers a health path itself is **not verified**: its package is not installed in this worktree (Q4).

## 4. Open questions, with a recommendation for each

Nothing below is decided; each default is what the plan assumes until Heron answers.

### Q1. One plan or more

| Option | Effect |
|---|---|
| **(a) One plan, three pull requests: Part 0 (corrections), Part A (edge), Part B (compute)** | One place for the cross-cutting decisions; each PR is reviewable alone. **Recommended.** |
| (b) Split into `infra-04a` and `infra-04b` plans | Cleaner status in the index, but the decisions in section 4 are shared and would be written twice. |

### Q2. How `DATABASE_URL` reaches the containers

`platform-api` reads only `DATABASE_URL`, a `postgres://` string (`readDatabaseUrl` in `config.ts`). RDS keeps the password in a separate secret.

| Option | Effect |
|---|---|
| **(a) A small application change: build the URL from `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` when `DATABASE_URL` is not set; ECS injects `DB_PASSWORD` from the managed secret's `password` key** | No password in state, no shell tricks, and the URL is encoded correctly in one place. Needs a separate application PR before the first rollout; the task definitions can be written now. **Recommended.** |
| (b) Terraform assembles the URL and stores it as an SSM parameter | Works today with no app change, but the password enters the state (private and encrypted, still a leak surface). |
| (c) A `command` wrapper in the task definition builds the URL from `DB_*` at start | No app change, no password in state; fragile quoting, and the password needs URL-encoding in shell. Applies to both the service and the migrate task. |

### Q3. `COOKIE_DOMAIN`

| Option | Effect |
|---|---|
| **(a) The API hostname itself, `eldritch-aws-api.heronoa.com.br`** | The browser sends the cookie only to that host (and its subdomains). It satisfies the spec's intent (no exposure to the other `heronoa.com.br` hosts, including the homelab) with no code change. The client calls the API cross-origin with credentials; client and API are same-site, so `SameSite=Lax` works. **Recommended.** |
| (b) The parent domain, as the M4 spec says | Every `heronoa.com.br` host receives the session cookie. |
| (c) An application change to omit `Domain` | Truly host-only, but touches auth code for no gain over (a). |

### Q4. Game-server health check (DT-69)

The ALB target group needs a real HTTP check. Do not use a catch-all success matcher or a TCP-only check to hide it.

| Option | Effect |
|---|---|
| **(a) Check the installed Colyseus 0.18 package first; use its built-in route if it has one** | No application change. The path must be confirmed by reading the package, not from memory. |
| **(b) Otherwise, a minimal HTTP route in the game-server (`GET /health` returning 200)** | A small separate application PR, as the spec asks. **Recommended fallback.** |

Either way the target group's health check path comes from a variable, and infra-04 cannot be applied before one of the two exists. DT-69 should also be added to `develop`'s technical-debt list, since it only exists on this branch.

### Q5. Cloudflare IP ranges: IPv4 only or both families

The spec asks for both families, but the ALB is IPv4-only, so Cloudflare reaches the origin over IPv4 and an IPv6 prefix list would never match.

| Option | Effect |
|---|---|
| **(a) IPv4 prefix list only** | Fewer rules, nothing unreachable in the group. A dual-stack ALB later adds the IPv6 list. **Recommended.** |
| (b) Both lists, as the spec reads literally | Dead weight today, and a security group rule quota cost (a prefix list counts its `max_entries` toward the group's rule limit). |

Cloudflare's ranges change rarely; refreshing the prefix list needs an apply. Recorded as a known limitation.

### Q6. WAF rate limit

There is no traffic data to size it. A game client is chatty (matchmaking, a WebSocket upgrade, API calls), and players behind one shared network address (a school, an office) share a counter.

| Option | Effect |
|---|---|
| **(a) Block mode with a generous placeholder: 1000 requests per 300 s per client IP, as variables (`waf_rate_limit`, `waf_rate_window_seconds`)** | Visible protection from day one; easy to tune; the number is a starting guess, not a measurement. **Recommended.** |
| (b) Count mode first | Emits metrics only, no blocking; safer against false positives, but protects nothing until switched. |

The rule keys on the `CF-Connecting-IP` header (`forwarded_ip_config`, with a fallback behavior chosen at implementation), because the connection IP is always a Cloudflare one.

### Q7. Cloudflare provider details are not known

The provider's current major, its resource names (they changed between majors), whether it has an IP-range data source, and whether it can set the zone's SSL mode all need to be read from the registry at implementation time. **I will not pin any of them from memory.** If the provider cannot set Full (strict), it becomes a manual runbook step, as the spec allows. The `http` provider fetching `https://www.cloudflare.com/ips-v4` is the fallback for the ranges.

Two behaviors to expect: with `manage_cloudflare_dns = true`, the certificate validation records are created in the same apply and the apply waits for validation; with `false`, the validation records must be created by hand before the apply can finish.

### Q8. IAM prerequisites in the bootstrap

| Option | Effect |
|---|---|
| **(a) Part 0 edits the bootstrap policies: deploy role `PassRole` also covers the execution roles; apply role gets the missing IAM read and update actions; the apply role can no longer modify `eldritch-prod-ci-*`** | The CI roles can do what infra-04 needs, and the self-escalation closes. Heron applies the bootstrap again (local state, bootstrap identity). **Recommended.** |
| (b) Name the execution roles to fit the existing `*-task` pattern and leave the bootstrap alone | Fixes the `PassRole` mismatch only; the missing IAM actions and the self-edit remain. |

A permissions boundary on the roles the apply role creates (the spec's ideal) stays out; it is listed as a known limitation, as the spec allows.

### Q9. Defaults for sign-in and mail

OAuth is optional per provider and mail is "all five or none" (`EMAIL_SMTP_HOST`, `_PORT`, `_USER`, `_PASSWORD`, `EMAIL_FROM`). No OAuth app is registered against the AWS hostname yet and no mail provider is chosen. Default: `oauth_github_enabled`, `oauth_google_enabled` and `email_enabled` are all `false`, so those variables are not injected and the platform logs mail instead of sending it. Turning one on is a variable plus an apply, after the OAuth app's callback URL (`https://eldritch-aws-api.heronoa.com.br/...`) is registered.

## 5. Files created or modified

### Part 0 · corrections to earlier steps

| Path | Operation | What changes |
|---|---|---|
| `infra/aws/modules/sqs/{main,variables,outputs}.tf`, `README.md`, `tests/sqs.tftest.hcl` | modify | FIFO queue and FIFO dead-letter queue: names end in `.fifo`, `fifo_queue = true`, `content_based_deduplication = false`, `sqs_managed_sse_enabled`, same redrive and retention. The queue is **replaced**, not edited in place |
| `infra/aws/envs/prod/main.tf`, `outputs.tf`, `tests/prod.tftest.hcl` | modify | the queue name is passed without `.fifo`; the module adds it |
| `infra/aws/envs/prod/variables.tf` | modify | add `OAUTH_GITHUB_CLIENT_SECRET`, `OAUTH_GOOGLE_CLIENT_SECRET`, `EMAIL_SMTP_PASSWORD` to the SSM defaults; drop `JWT_SECRET` (finding 4, to confirm) |
| `infra/aws/bootstrap/main.tf`, `tests/bootstrap.tftest.hcl` | modify | Q8 option (a) |

If infra-02 has already been applied when Part 0 lands, the queue replacement and the removal of the `JWT_SECRET` parameter show up in the plan as destroy and create; both are harmless while no consumer exists.

### Part A · edge

| Path | Operation | What changes |
|---|---|---|
| `infra/aws/modules/alb/{main,variables,outputs}.tf` + `README.md` + `tests/` | create | load balancer, listener, target groups, host rules, ALB security group, Cloudflare prefix list, ACM certificate |
| `infra/aws/modules/waf/{main,variables,outputs}.tf` + `README.md` + `tests/` | create | web ACL, rate rule, association with the ALB |
| `infra/aws/modules/edge-dns/{main,variables,outputs}.tf` + `README.md` + `tests/` | create | proxied CNAMEs, validation records, optional SSL mode |
| `infra/aws/envs/prod/versions.tf`, `providers.tf` | modify | add the Cloudflare provider (and `http` if needed), token from the environment |
| `infra/aws/envs/prod/main.tf`, `variables.tf`, `outputs.tf`, `tests/prod.tftest.hcl` | modify | the three modules, hostnames, `manage_cloudflare_dns`, WAF variables |
| `infra/aws/envs/prod/.terraform.lock.hcl` | modify | new provider hashes |

### Part B · compute

| Path | Operation | What changes |
|---|---|---|
| `infra/aws/modules/ecs-cluster/{main,variables,outputs}.tf` + `README.md` + `tests/` | create | cluster, Container Insights switch, log groups |
| `infra/aws/modules/ecs-service/{main,variables,outputs}.tf` + `README.md` + `tests/` | create | reusable: task definition, service, execution role, task role, log wiring |
| `infra/aws/envs/prod/main.tf`, `variables.tf`, `outputs.tf`, `tests/prod.tftest.hcl` | modify | the cluster, both services, the migrate family, the task security group rules |
| `infra/aws/README.md` | modify | one line for the edge and compute |
| `.ia_context/plans/infra-aws-prod.index.md` | modify | link this plan in row 4 |

**Not in any part, proposed only (Q2 and the spec's coordination item 3):** the application changes (build `DATABASE_URL` from `DB_*`; a health route if Q4 needs it; `USER node` and pruned dev dependencies in `backend/Dockerfile`, which today runs as root and copies the whole build stage, dev dependencies included). Each is a separate small application PR.

## 6. Module contracts

Each module has `variables.tf`, `outputs.tf` and a short README with its inputs, outputs and known limitations.

### 6.1 `alb`

- **Inputs:** `name`, `vpc_id`, `public_subnet_ids`, `hostnames` (api and game), `cloudflare_ipv4_cidrs` (the module does not fetch; the stack passes them), `task_security_group_ids` (map by service), `target_groups` (port, health check path, deregistration delay per service), `idle_timeout` (default 120), `destroyable`.
- **Resources:**
  - the ALB: internet-facing, IPv4 only, `idle_timeout = 120`, `enable_deletion_protection = !destroyable`;
  - a customer-managed prefix list of the Cloudflare IPv4 ranges (Q5);
  - the ALB security group, with no inline rules: ingress is one separate rule on 443 from the prefix list, egress is one separate rule per task group on that service's container port, and nothing else;
  - one ACM certificate with both hostnames, DNS validation, and the `aws_acm_certificate_validation` that waits for it;
  - one HTTPS listener on 443 with `ELBSecurityPolicy-TLS13-1-2-2021-06` and a fixed 403 default action; **no port 80 listener**;
  - two target groups of type `ip` (platform-api on 3000 with `GET /health` expecting 200; game-server on 2567, deregistration delay 120 s, health path from Q4) and one host-header rule for each.
- **Outputs:** `alb_arn`, `alb_dns_name`, `alb_zone_id`, `alb_security_group_id`, `target_group_arns` (map), `certificate_arn`, `certificate_validation_options` (what edge-dns needs to create the records).

### 6.2 `waf`

- **Inputs:** `name`, `alb_arn`, `rate_limit`, `rate_window_seconds`, `rate_limit_action`.
- **Resources:** a regional `aws_wafv2_web_acl` with `default_action = allow`, one rate-based rule aggregating on the forwarded IP from `CF-Connecting-IP`, CloudWatch metrics on, and the association with the ALB. No AWS-managed rule groups in this delivery (each is billed per rule); that is a known limitation and a later option.
- **Outputs:** `web_acl_arn`.
- WAF inspects the WebSocket upgrade request only; frames on an open connection are not inspected. Recorded in the README.

### 6.3 `edge-dns`

- **Inputs:** `zone_id`, `hostnames`, `alb_dns_name`, `certificate_validation_options`, `manage_cloudflare_dns` (default `true`).
- **Resources:** when managing DNS: one proxied CNAME per hostname to the ALB, and one DNS-only CNAME per certificate validation record. Whether the zone's SSL mode is set here depends on Q7; otherwise a runbook step.
- **Outputs:** the record names. With `manage_cloudflare_dns = false` it creates nothing and outputs what to create by hand.
- **The Cloudflare token** is scoped to DNS edit on the one zone and comes from the environment locally and from the `prod` GitHub environment secret `CLOUDFLARE_API_TOKEN` in CI. Never in code or state.

### 6.4 `ecs-cluster`

- **Inputs:** `name`, `container_insights` (default off), `log_retention_days` (default 14), `service_names`.
- **Resources:** the cluster and one log group per service name.
- **Outputs:** `cluster_name`, `cluster_arn`, `log_group_names` (map).

### 6.5 `ecs-service` (used twice, plus the migrate family)

- **Inputs:** `name`, `cluster_arn`, `image` (a placeholder tag until the first deploy, never `latest`), `container_port`, `cpu` and `memory` (default 256 and 512), `cpu_architecture`, `environment` (map), `secrets` (map name to SSM parameter ARN or secret ARN with JSON key), `security_group_id`, `subnet_ids`, `target_group_arn` (null for migrate), `desired_count`, `services_enabled`, `stop_timeout`, `task_role_policy_json`, `execution_extra_secret_arns`, `enable_execute_command` (default off), `log_group_name`, `command` (null by default).
- **Resources:**
  - a task definition (`awsvpc`, public IP assigned at the service);
  - the **execution role** `eldritch-prod-<name>-execution`: pull from ECR, write its log group, read only this service's SSM parameters and the RDS secret it needs, with `kms:Decrypt` through the SSM service only;
  - the **task role** `eldritch-prod-<name>-task`: only the policy passed in;
  - a service with `desired_count = 0` unless `services_enabled`, the deployment circuit breaker with rollback, `minimum_healthy_percent = 100`, `maximum_percent = 200`, health check grace 60 s, and `ignore_changes = [task_definition]`.
- **Outputs:** `service_name`, `task_definition_family`, `execution_role_arn`, `task_role_arn`.
- **Consequence to document:** because the service ignores `task_definition`, a Terraform change to the environment or secrets only registers a new revision of the family. It reaches the running service at the next deploy, which must render from the family's latest revision, not from a stored copy. infra-05 owns that rule.
- The migrate family is the same module with no target group, no service, `desired_count = 0` and `command = ["node", "dist/migrate.js"]` (the command `docker-compose.yml` uses) as a variable. It is run by the deploy workflow, never on a schedule.

### 6.6 `envs/prod` composition

- **Task security group rules** (separate rule resources, on the groups from infra-03):
  - platform-api group: ingress on 3000 from the ALB group only; egress 443 to anywhere (ECR, SSM, Secrets Manager, SQS, S3, OAuth providers), 5432 to the RDS group, 6379 to the Redis group, and the SMTP port only when `email_enabled`.
  - game-server group: ingress on 2567 from the ALB group only; egress 443 to anywhere (ECR, SSM, SQS), 6379 to the Redis group.
- **Environment maps** from `docker-compose.yml` and the M4 spec:

| Variable | Service | Source |
|---|---|---|
| `PLATFORM_API_PORT=3000`, `GAME_SERVER_PORT=2567`, `GAME_SERVER_MAX_MATCHES` | each | plain |
| `AWS_REGION` | both | plain |
| `MATCH_ENDED_QUEUE_URL` | both | the `sqs` output (FIFO queue URL) |
| `REDIS_URL` = `rediss://<endpoint>:<port>` | both | the `redis` outputs (not read by the application yet) |
| `ASSETS_BUCKET` | platform-api | the `assets-bucket` output (not read by the application yet) |
| `CLIENT_ORIGIN`, `OAUTH_REDIRECT_BASE_URL`, `COOKIE_DOMAIN` | platform-api | variables (Q3) |
| `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_ID` | platform-api | variables, only when that provider is enabled (Q9) |
| `EMAIL_SMTP_HOST`, `_PORT`, `_USER`, `EMAIL_FROM` | platform-api | variables, only when `email_enabled` (Q9) |
| `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` + `DB_PASSWORD` | platform-api, migrate | Q2 |
| `SESSION_SECRET`, `GAME_TICKET_PRIVATE_KEY` | platform-api | SSM parameter |
| `OAUTH_GITHUB_CLIENT_SECRET`, `OAUTH_GOOGLE_CLIENT_SECRET`, `EMAIL_SMTP_PASSWORD` | platform-api | SSM parameter, only when enabled |
| `GAME_TICKET_PUBLIC_KEY` | game-server | SSM parameter |

- **Must be absent in AWS:** `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. `JWT_SECRET` is omitted (finding 4).
- **Task role policies:** platform-api: S3 `GetObject` and `PutObject` on `<assets bucket>/users/*` only, and SQS `ReceiveMessage`, `DeleteMessage` and `GetQueueAttributes` on the match queue; game-server: SQS `SendMessage` on the match queue only. Nothing with `*` as a resource.
- `services_enabled` defaults to `false`: the repositories are empty at first apply. The task definitions point at a placeholder tag nothing pulls while the count is 0.

## 7. Contract toward infra-05

The outputs infra-05 reads by these names: `cluster_name`, `platform_api_service_name`, `game_server_service_name`, `platform_api_task_family`, `game_server_task_family`, `migrate_task_family`, `migrate_task_subnet_ids`, `migrate_task_security_group_id`, `repository_urls`, `api_hostname`, `game_hostname`. The migrate task runs in the public subnets with the platform-api security group, the same network position as the service.

**This step does not:** write or change any workflow, build or push any image, run any migration, change the frontend's game-server address (the cutover is separate), create alarms or the budget (infra-06), or change the application.

## 8. Tests

`mock_provider "aws" {}` and `mock_provider "cloudflare" {}`, no credentials, `terraform test` from each module directory; `command = apply` where a policy embeds a computed ARN. Mocked data sources get `override_data`. Provider-specific names are checked against the real provider documentation at implementation (Q7); the mock accepts anything.

**`sqs` (Part 0)**
- [ ] Both queues are FIFO, their names end in `.fifo`, and content-based deduplication is off.
- [ ] The redrive policy still moves a message after 5 receives; the dead-letter queue still keeps 14 days; both are encrypted.

**`alb`**
- [ ] Internet-facing, IPv4 only, `idle_timeout` 120, deletion protection follows `destroyable`.
- [ ] Exactly one listener, on 443, HTTPS, with the TLS 1.3 policy; the default action is a fixed 403; no listener on 80.
- [ ] The ALB group has one ingress rule, on 443, from the prefix list only (no CIDR), and egress only to the task groups on their container ports.
- [ ] No security group in the module has `0.0.0.0/0` ingress.
- [ ] Target groups are type `ip`, with the configured ports, health check paths, and a game-server deregistration delay of 120 s; each hostname has a host-header rule.
- [ ] The certificate covers both hostnames with DNS validation.

**`waf`**
- [ ] Regional web ACL, default action allow, one rate-based rule, aggregation on the forwarded IP with header `CF-Connecting-IP`, limit and window from the variables, association with the ALB.

**`edge-dns`**
- [ ] The two hostname records are proxied CNAMEs to the ALB; the validation records are not proxied.
- [ ] With `manage_cloudflare_dns = false`, no record resource exists.

**`ecs-cluster`**
- [ ] Container Insights is off by default; one log group per service with 14-day retention.

**`ecs-service`**
- [ ] `desired_count` is 0 unless `services_enabled`.
- [ ] The circuit breaker has rollback on; `minimum_healthy_percent` 100, `maximum_percent` 200, grace 60 s.
- [ ] The execution role and the task role are different roles with different policies; the task role carries exactly the policy passed in.
- [ ] The execution role reads only the given parameter and secret ARNs, and its `kms:Decrypt` is conditioned on the SSM service.
- [ ] The image tag is never `latest`.
- [ ] The game-server container has `stopTimeout` 120.
- [ ] ECS Exec is off by default.
- [ ] The migrate family has no service and no load balancer.

**`bootstrap` (Part 0)**
- [ ] The deploy role's `PassRole` covers the execution roles as well as the task roles.
- [ ] The apply role's IAM statement does not match `eldritch-prod-ci-*` roles.

**`envs/prod` composition**
- [ ] The platform-api group is allowed into RDS and Redis; the game-server group only into Redis (carried over from infra-03).
- [ ] Each task group admits ingress only from the ALB group, on its container port.
- [ ] No task or ALB security group has `0.0.0.0/0` ingress; the only `0.0.0.0/0` rules are egress on 443.
- [ ] No environment map or secret map contains `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` or `JWT_SECRET`.
- [ ] No secret value appears in any environment map; secrets are ARNs.
- [ ] `terraform fmt -check`, `init -backend=false`, `validate` pass.

The CI `grep` for static keys and private key headers must stay green. `ignore_changes = [task_definition]` and the "no password in any output" rule are covered by review, as `terraform test` cannot assert them.

## 9. Dependencies

- **infra-02 and infra-03 applied** by Heron.
- **Part 0 applied before Part A and Part B**, including a second apply of the bootstrap stack (Q8).
- **Heron's answers to Q1 to Q9**, or acceptance of the recommended defaults.
- **Before the first rollout (infra-05), not before this plan applies:** the application change for Q2 (or its alternative), the health route or confirmed built-in for Q4, and the OAuth apps' callback URLs for any provider enabled in Q9.
- **Credentials:** a Cloudflare API token with DNS edit on the one zone (and, if Q7 allows it, the permission to edit zone settings), kept out of the repository.

## 10. Terraform permissions needed to apply

Heron applies this stack himself. The identity needs: ELB (load balancer, listener, target group, rule), ACM, WAFv2, ECS, CloudWatch Logs, EC2 security group, rule and prefix list management, and IAM creation and reading of roles named `eldritch-prod-*`, with `iam:PassRole` for them. The CI apply role covers most of this through `PowerUserAccess`; its IAM part is the gap Part 0 closes. The Cloudflare token is separate. Which exact ELB and WAF actions a first apply is refused on is **not verified**; the denied action names what to add.

## 11. Cost

First step with the ALB, the public IPv4 addresses and the WAF. **Not computed in this plan.** The ALB bills hourly plus capacity units; public IPv4 addresses bill per hour (the ALB's two zones, and each task's address once tasks run); the WAF bills per web ACL, per rule and per million requests; Fargate bills only when a task runs, so the services at zero cost nothing yet. The spec's order of magnitude for the whole stack is a rough estimate that infra-06 replaces with the AWS Pricing Calculator or Infracost. Teardown with `destroyable = true` removes all of it.

## 12. Out of scope

- The three workflows and the first image build (infra-05); alarms, the budget, the README diagram, the ADRs and the known-limitations section (infra-06).
- The application changes listed in section 5 (separate PRs), including the `Dockerfile` hardening.
- The frontend cutover and the homelab hostname.
- AWS-managed WAF rule groups, CloudFront, ALB access logs, interface VPC endpoints, autoscaling policies, Fargate Spot, more than one game-server task.
- A permissions boundary on the roles the apply role creates.
- An ElastiCache auth token and a least-privilege database user (infra-03's known limitations).

## 13. Acceptance

1. `terraform fmt -check`, `init -backend=false`, `validate` and `terraform test` pass locally for every new or changed module and for `envs/prod` and `bootstrap`, with no credentials.
2. `git diff` shows nothing under `envs/stg`, `modules/network`, `modules/ecr`, `modules/ec2`, nor under the infra-02 and infra-03 modules other than the `sqs` change in Part 0.
3. `infra-ci.yml` passes on each pull request, and the live `plan` step shows only the new resources (plus the queue replacement in Part 0).
4. After Heron's own applies: the match queue is FIFO; the ALB answers only through Cloudflare (a direct request to the ALB's DNS name is refused by the security group); an unknown host gets the fixed 403; the certificate is issued; the WAF is associated; both services exist at zero tasks; the migrate family is registered; no security group has `0.0.0.0/0` ingress; a second `terraform plan` shows no changes.
5. Heron puts the real values of the SSM parameters by hand; a second `plan` still shows no changes.

## 14. Suggested commit and pull request split (when the code exists)

1. **Part 0:** `fix(infra): make the match queue FIFO and add the missing SSM parameters`; `fix(infra): let the CI roles manage and pass the ECS roles`.
2. **Part A:** `feat(infra): add alb module`; `feat(infra): add waf module`; `feat(infra): add edge-dns module and wire the edge into the prod stack`.
3. **Part B:** `feat(infra): add ecs-cluster and ecs-service modules`; `feat(infra): wire the cluster, services and migrate family into the prod stack`; `docs(infra): update README and index for infra-04`.
