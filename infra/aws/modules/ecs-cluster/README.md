# ecs-cluster

An ECS cluster and one CloudWatch log group per service name, under `/eldritch-alley/<name>/<service>`, the prefix the CI deploy role may read for `run-task`.

Container Insights is off by default because it bills per metric. Retention is 14 days.

| Input | Description |
|---|---|
| `name` | Cluster name, and the log path segment |
| `service_names` | One log group each (the services and the one-off task families) |
| `container_insights` | Default `false` |
| `log_retention_days` | Default 14 |

| Output | Description |
|---|---|
| `cluster_name`, `cluster_arn` | The cluster |
| `log_group_names`, `log_group_arns` | Keyed by service name |

Tests: `terraform test` from this directory (mocked provider, no credentials).
