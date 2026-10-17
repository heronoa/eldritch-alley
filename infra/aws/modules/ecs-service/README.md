# ecs-service

A Fargate task definition, its execution role and task role, and (unless `create_service = false`) a service. Used for platform-api, for the game-server and, without a service, for the one-off migration.

- **Two roles, never one.** The execution role (`<prefix>-<name>-execution`) is what ECS needs to start the task: pull from this service's repository, write this service's log group, read only the SSM parameters and Secrets Manager secrets it is given, and `kms:Decrypt` only through those services. The task role (`<prefix>-<name>-task`) is what the running application may do: exactly the policy passed in, plus the ECS Exec channel actions when that is on. The names match what the CI deploy role may pass.
- **Starts at zero.** `services_enabled = false` sets the desired count to 0, which a stack with empty repositories needs. Rollout uses the deployment circuit breaker with rollback, `minimum_healthy_percent = 100`, `maximum_percent = 200` and a 60 s health check grace period.
- **The image is never `latest` and must carry a tag.** The task definition points at a placeholder tag until the deploy workflow registers real revisions.
- **The deploy workflow owns the image.** The service ignores changes to `task_definition`. The consequence: a change here to the environment or the secrets only registers a new revision of the family, and it reaches the running service at the next deploy, which must render from the family's latest revision, not from a stored copy.
- Tasks run in the public subnets with a public IP, because there is no NAT. Their security group is created elsewhere and carries the stack's rules.
- Secrets are references by ARN, never values. A Secrets Manager reference may end in `:<json key>::`, for example `:password::` for an RDS managed secret.
- ECS Exec is off by default.
- Not covered by `terraform test`: `ignore_changes = [task_definition]`. It is covered by review.

| Input | Description |
|---|---|
| `prefix`, `name`, `region`, `cluster_arn` | Identity |
| `image`, `container_port`, `command`, `stop_timeout` | The container; no port and a command for a one-off task |
| `environment`, `secrets` | Plain variables and secret references |
| `ssm_parameter_arns`, `secrets_manager_arns` | The only things the execution role may read |
| `ecr_repository_arn`, `log_group_name`, `log_group_arn` | The repository and log group of this service |
| `security_group_id`, `subnet_ids`, `target_group_arn` | Network position |
| `create_service`, `services_enabled`, `desired_count` | Whether it is kept running |
| `cpu`, `memory`, `cpu_architecture` | Defaults 256, 512, `X86_64` |
| `task_role_policy_json`, `enable_execute_command` | The task role |

| Output | Description |
|---|---|
| `service_name`, `desired_count` | Null for a one-off task family |
| `task_definition_family` | What the deploy workflow renders revisions from |
| `execution_role_arn`, `task_role_arn` | Passed by the deploy role |
| `environment`, `secrets` | What the container was given |

Tests: `terraform test` from this directory (mocked provider, no credentials).
