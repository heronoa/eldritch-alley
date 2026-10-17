# infra-03 · Data stores: RDS PostgreSQL and ElastiCache Redis (plan)

**Index:** [infra-aws-prod.index.md](./infra-aws-prod.index.md)
**Source spec:** [aws-terraform-deploy.spec.md](../inputs/aws-terraform-deploy.spec.md)
**Milestone:** 3 of 6
**Created:** 2026-10-17
**Status:** pending approval. **Nothing in this plan is written as code or applied to AWS.**

Written ahead of the index's usual gate (infra-02 applied) because Heron asked for it. The plan can be reviewed now; **its code must not be applied until infra-02 is applied**, because it reads the VPC and isolated subnets that infra-02 creates. **This is the first step with a recurring cost**: billing for the database and the cache starts at apply, and there is a teardown path through `destroyable`.

## 1. Objective

Add the two data stores to the `envs/prod` stack, reachable only from inside the VPC and only from the services that need them:

- an RDS PostgreSQL 17 instance with a master password that lives in a Secrets Manager secret RDS creates, never in state;
- one ElastiCache Redis 7 node, encrypted at rest and in transit;
- the security groups that make "only from the tasks" true.

What this step exposes to infra-04: the database endpoint, port, name, username and the ARN of the managed master secret; the Redis endpoint and port; and the ids of the two task security groups the ECS services will use.

## 2. Decisions carried in

| Item | Value | Source |
|---|---|---|
| Database | RDS PostgreSQL 17 (same major as Compose), `db.t4g.micro`, gp3, encrypted, single-AZ by default (variable `multi_az`), 7-day backups, TLS required, `manage_master_user_password = true`, `publicly_accessible = false` | spec |
| Cache | ElastiCache Redis 7.x, one `cache.t4g.micro` node, encryption at rest and in transit, `rediss://`, no auth token | spec |
| Placement | Both in the isolated subnets from infra-02 (no route to the internet) | spec, infra-02 |
| Teardown | `deletion_protection = !destroyable`, `skip_final_snapshot = destroyable`, a named final snapshot otherwise | spec |
| State | Same `prod/terraform.tfstate`; modules are added to the existing stack | index |
| Secrets | No password in code or state | spec |

## 3. Open questions, with a recommendation for each

Nothing below is decided; each default is what the plan assumes until Heron answers.

### Q1. One task security group or one per service

The spec says RDS and Redis accept traffic "from the ECS task security group", in the singular. But the two services need different things: platform-api (and the migrate task) needs PostgreSQL and Redis; the game-server needs only Redis (`DATABASE_URL` is read by platform-api and migrate only, per the spec's environment table).

| Option | Effect |
|---|---|
| **(a) Two security groups, `platform-api` and `game-server`, created in this step. RDS accepts only the first; Redis accepts both** | Least privilege: a compromised game-server cannot reach the database at the network level. The security groups are created now, before the services exist; infra-04's `ecs-service` module then takes a `security_group_id` input instead of creating its own. **Recommended.** |
| (b) One shared task security group, as the spec reads literally | Simpler, one rule per store. The game-server can reach PostgreSQL at the network level, even though it never needs to. |
| (c) The security groups are created in infra-04 and the data stores in infra-03 get no ingress until then | No chicken-and-egg problem, but the data stores would be unreachable by construction until infra-04, and infra-03 could not be tested end to end. |

Under (a), the groups carry **no inline rules**: infra-04 adds the ALB ingress with separate `aws_vpc_security_group_ingress_rule` resources, which is why this step also uses separate rule resources and never inline `ingress` blocks (mixing both on one group makes Terraform fight itself).

### Q2. Database name and master username

The spec asks the module to output both but gives no values. The only source in the repository is `docker-compose.yml` and `.env.example`: database `eldritch_alley`, user `eldritch`. Assumed defaults: `db_name = "eldritch_alley"`, `db_username = "eldritch"`, both variables. Confirm, because neither can be changed later without recreating the instance (the database name) or replacing the master user.

### Q3. Allocated storage

The spec says gp3 and gives no size. PostgreSQL on gp3 has a minimum of 20 GB, so the plan uses `allocated_storage = 20` as a variable. No storage autoscaling (`max_allocated_storage` unset), to keep cost predictable; a full disk becomes a CloudWatch alarm in infra-06, not an automatic bill increase. Confirm 20 GB is acceptable for a portfolio stack.

### Q4. Final snapshot name on teardown

With `destroyable = false` a final snapshot is taken on destroy, and its identifier must be a fixed string (a timestamp in the identifier makes the plan show a change on every run).

| Option | Effect |
|---|---|
| **(a) Fixed name `eldritch-prod-final`; the runbook says to delete the previous final snapshot before another teardown** | Plan stays clean. A second teardown fails loudly if the old snapshot was not deleted, instead of overwriting it. **Recommended.** |
| (b) A `final_snapshot_suffix` variable the teardown workflow sets to a date | No leftover to delete, but one more input for infra-05's `teardown.yml` to supply. |

### Q5. Engine version strings

"PostgreSQL 17" and "Redis 7.x" name majors only. Exact minor versions are not in the spec and I will not guess them. Assumed: `engine_version = "17"` on RDS (AWS selects the default minor of the major and `auto_minor_version_upgrade` stays on) and `engine_version = "7.1"` for ElastiCache, with the parameter group families `postgres17` and `redis7`. **The `7.1` string and both family names must be checked against the provider documentation at implementation time**, since the mock provider cannot validate them. If any is rejected, the implementation step says so instead of picking another silently.

### Q6. The first apply starts recurring billing

There is no way to test a managed database without creating it. Options for the apply order: **(a)** apply infra-03 in the same session as infra-02 and tear everything down with `destroyable` if the stack will sit idle; **(b)** apply it only when infra-04 is ready to use it. The plan is written to allow either; recommended is (b), because the stores have no consumer until infra-04. This is Heron's call; it changes nothing in the code.

## 4. Files created or modified

| Path | Operation | What changes |
|---|---|---|
| `infra/aws/modules/rds/{main,variables,outputs}.tf` + `README.md` | create | see section 5.1 |
| `infra/aws/modules/rds/tests/rds.tftest.hcl` | create | see section 7 |
| `infra/aws/modules/redis/{main,variables,outputs}.tf` + `README.md` | create | see section 5.2 |
| `infra/aws/modules/redis/tests/redis.tftest.hcl` | create | see section 7 |
| `infra/aws/envs/prod/main.tf` | modify | two task security groups, the `rds` and `redis` modules |
| `infra/aws/envs/prod/variables.tf` | modify | `multi_az`, `db_name`, `db_username`, `db_allocated_storage` |
| `infra/aws/envs/prod/outputs.tf` | modify | database and Redis outputs, task security group ids |
| `infra/aws/envs/prod/tests/prod.tftest.hcl` | modify | composition checks for the new modules (no `0.0.0.0/0` ingress, stores in isolated subnets) |
| `infra/aws/README.md` | modify | one line for the data stores |
| `.ia_context/plans/infra-aws-prod.index.md` | modify | link this plan in row 3 |

No change to `bootstrap/`, `envs/stg/`, the infra-02 modules or any workflow. The CI apply role (`PowerUserAccess` plus scoped IAM) already covers RDS, ElastiCache, Secrets Manager and security groups; this step creates no IAM role. The service-linked roles for RDS and ElastiCache are created by AWS on first use; whether `PowerUserAccess` allows that creation for the CI role is **believed but not verified**, so the first CI apply is the real check.

## 5. Module contracts

Each module has `variables.tf`, `outputs.tf` and a short README with its inputs and outputs.

### 5.1 `rds`

- **Inputs:** `name`, `vpc_id`, `subnet_ids` (the isolated subnets), `allowed_security_group_ids` (list), `db_name`, `db_username`, `instance_class` (default `db.t4g.micro`), `allocated_storage`, `engine_version`, `multi_az` (default `false`), `backup_retention_days` (default 7), `destroyable`, `final_snapshot_identifier`.
- **Resources:**
  - a subnet group over the isolated subnets;
  - a parameter group (family `postgres17`) with `rds.force_ssl = 1`;
  - a security group with **no inline rules**, and one separate ingress rule per allowed security group on 5432, and no egress rule at all (the data store initiates nothing);
  - the instance: gp3, `storage_encrypted = true`, `publicly_accessible = false`, `manage_master_user_password = true`, `copy_tags_to_snapshot = true`, `deletion_protection = !destroyable`, `skip_final_snapshot = destroyable`, `final_snapshot_identifier` set only when `destroyable` is false.
- **Outputs:** `endpoint` (address), `port`, `db_name`, `username`, `master_secret_arn`, `security_group_id`. **Never a password.**
- **Not done here:** a least-privilege application user (the application uses the master user in this delivery, a known limitation from the spec), RDS Proxy, read replicas, performance insights, enhanced monitoring, cross-region backups.

### 5.2 `redis`

- **Inputs:** `name`, `vpc_id`, `subnet_ids` (the isolated subnets), `allowed_security_group_ids`, `node_type` (default `cache.t4g.micro`), `engine_version`.
- **Resources:** a subnet group, a parameter group (family `redis7`), a security group with no inline rules and one ingress rule per allowed group on 6379, and no egress rule; a replication group with one node: `at_rest_encryption_enabled`, `transit_encryption_enabled`, `automatic_failover_enabled = false`, no auth token.
- **Outputs:** `primary_endpoint_address`, `port`, `security_group_id`. The `rediss://` URL is assembled in infra-04 from these two outputs, as the spec says; there is no secret in it because there is no auth token.
- **Known limitation, recorded:** no auth token, so access is controlled only by the security group. This goes into the README's known limitations in infra-06.

### 5.3 `envs/prod` composition

- Two security groups, `platform-api` and `game-server` (Q1 option a), in the VPC from infra-02, with no rules. Names `eldritch-prod-platform-api` and `eldritch-prod-game-server`.
- `rds` receives only the platform-api group. `redis` receives both.
- Outputs added, by these names: `db_endpoint`, `db_port`, `db_name`, `db_username`, `db_master_secret_arn`, `redis_endpoint`, `redis_port`, `platform_api_security_group_id`, `game_server_security_group_id`.

## 6. Contract toward infra-04

infra-04 builds the ECS services with `security_group_id` as an **input** (a change to the spec's description of `ecs-service`, which creates its own group; the spec's line is superseded by Q1 option a, and infra-04's plan will say so). infra-04 builds the environment maps from the outputs above:

- `DATABASE_URL` is **not** built here. How it is assembled is the spec's coordination item 1: option (a), the application accepts `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` and builds the URL, with `DB_PASSWORD` injected from the managed secret's `password` key; or option (b), Terraform stores an assembled URL in SSM, which puts the password in state. This step produces the pieces for either and chooses neither; it depends on the M4 platform-api work, which is still in progress on another branch.
- `REDIS_URL` is `rediss://<redis_endpoint>:<redis_port>`.
- The execution role of platform-api and migrate gets `secretsmanager:GetSecretValue` on `db_master_secret_arn` (and `kms:Decrypt` if the secret uses a customer-managed key; RDS uses the AWS managed key by default).

**This step does not:** create IAM roles, an ALB, DNS, ECS resources, alarms, or any change to the application. The application's TLS support for PostgreSQL and Redis (spec coordination item 2: `sslmode=require` is acceptable without certificate verification inside the VPC for now) is documented here and is not an infrastructure change.

## 7. Tests

Same conventions as infra-02: `mock_provider "aws" {}`, no credentials, run with `terraform test` from each module directory, `command = plan` where possible and `command = apply` when a policy or attribute is computed. Because the RDS managed master secret (`master_user_secret`) is a computed block, the `rds` tests use `override_resource` for `aws_db_instance.this` to give it a value; otherwise the `master_secret_arn` output cannot be asserted.

**`rds`**
- [ ] `publicly_accessible` is false and the subnet group uses exactly the subnets given.
- [ ] `storage_encrypted` is true and the storage type is `gp3`.
- [ ] `manage_master_user_password` is true and no `password` argument is set.
- [ ] The parameter group sets `rds.force_ssl = 1`.
- [ ] With `destroyable = false`: `deletion_protection` true, `skip_final_snapshot` false, a final snapshot identifier set.
- [ ] With `destroyable = true`: `deletion_protection` false, `skip_final_snapshot` true.
- [ ] The security group has one ingress rule per allowed group on port 5432, no CIDR source, and no `0.0.0.0/0` anywhere.
- [ ] The security group has no egress rule.
- [ ] `multi_az` and `backup_retention_period` follow their variables (defaults false and 7).
- [ ] No output is named or shaped like a password.

**`redis`**
- [ ] The replication group has exactly one node and `automatic_failover_enabled` false.
- [ ] `at_rest_encryption_enabled` and `transit_encryption_enabled` are true; no auth token is set.
- [ ] The subnet group uses exactly the subnets given.
- [ ] The security group has one ingress rule per allowed group on port 6379, no CIDR source, and no egress rule.

**`envs/prod` composition**
- [ ] The platform-api group is allowed into RDS, and the game-server group is not.
- [ ] Both groups are allowed into Redis.
- [ ] The stores sit in the isolated subnets (the same ids as `isolated_subnet_ids`), never in a public one.
- [ ] No security group in the composition has `0.0.0.0/0` ingress (the invariant from the spec's test list, now with real content).
- [ ] `terraform fmt -check`, `init -backend=false`, `validate` pass.

The CI `grep` for static keys and private key headers must stay green.

## 8. Dependencies

- **infra-02 applied** by Heron: this step reads `vpc_id` and `isolated_subnet_ids`. Without it, the code can be written and validated locally but not planned against the real account.
- **Heron's answers to Q1 to Q6**, or acceptance of the recommended defaults.
- **Provider documentation check** for the engine version strings and parameter group families (Q5), at implementation time.
- No application dependency to apply this step. The M4 platform-api work is needed only to finish the `DATABASE_URL` decision in infra-04.

## 9. Terraform permissions needed to apply

Heron applies this stack himself. The identity needs: RDS instance, subnet group and parameter group management; ElastiCache replication group, subnet group and parameter group management; EC2 security group and security group rule management; `secretsmanager` permissions that RDS needs to create its managed secret (the service creates it on the caller's behalf, which needs `secretsmanager:CreateSecret`, `secretsmanager:TagResource` and `kms` use of the AWS managed key); `iam:CreateServiceLinkedRole` for RDS and ElastiCache if they do not exist yet; `sts:GetCallerIdentity`. The exact permission list for the managed secret is **not verified**; if the first apply is refused, the denied action tells what to add.

## 10. Cost

First recurring cost in the delivery: one `db.t4g.micro` instance with 20 GB gp3 and 7 days of backups, and one `cache.t4g.micro` node. **Not computed in this plan.** The spec's order of magnitude (about US$ 80 a month for the whole stack left running, mostly the ALB, public IPv4 addresses, two Fargate tasks, RDS and ElastiCache) is a rough estimate to be replaced by infra-06's table, computed with the AWS Pricing Calculator or Infracost. Multi-AZ, if turned on, roughly doubles the database line. Teardown with `destroyable = true` stops all of it.

## 11. Out of scope

- IAM roles, the ALB, certificate, DNS, WAF, ECS cluster and services (infra-04); the pipelines (infra-05); alarms such as RDS free storage and CPU, the budget, the README diagram and ADRs (infra-06).
- A least-privilege database user, RDS Proxy, read replicas, cross-region backups, performance insights, an ElastiCache auth token (all listed as known limitations or out of scope by the spec).
- The `DATABASE_URL` assembly and the migrate command (M4 application work).
- TLS verification of the RDS certificate (needs the CA bundle in the image).
- Any change to `backend/Dockerfile` or application code.

## 12. Acceptance

1. `terraform fmt -check`, `init -backend=false`, `validate` and `terraform test` pass locally for `rds`, `redis` and `envs/prod`, with no credentials.
2. `git diff` shows nothing under `envs/stg`, `bootstrap/` or the infra-02 modules.
3. `infra-ci.yml` passes on a pull request touching `infra/**`, and the live `plan` step shows only the new resources.
4. After Heron's own `apply` (outside this plan): the database is not publicly accessible, sits in the isolated subnets, is encrypted, requires TLS (`rds.force_ssl`), and has deletion protection on; the master secret exists in Secrets Manager and its value is not in the state; Redis has one node with encryption at rest and in transit; the platform-api group reaches PostgreSQL and Redis, the game-server group reaches only Redis; a second `terraform plan` shows no changes.

## 13. Suggested commit split (when the code exists)

1. `feat(infra): add rds module` — `modules/rds` with its tests.
2. `feat(infra): add redis module` — `modules/redis` with its tests.
3. `feat(infra): wire data stores and task security groups into the prod stack` — `envs/prod/*` changes, README line, this plan's status.
