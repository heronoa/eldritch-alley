# No credentials, no network access. Run from infra/aws/modules/ecs-cluster/ with `terraform test`.

mock_provider "aws" {}

variables {
  name          = "eldritch-prod"
  service_names = ["platform-api", "game-server", "migrate"]
}

run "container_insights_is_off_by_default" {
  command = plan

  assert {
    condition     = one([for s in aws_ecs_cluster.this.setting : s.value if s.name == "containerInsights"]) == "disabled"
    error_message = "Container Insights must be off by default (it bills per metric)"
  }
}

run "container_insights_follows_its_variable" {
  command = plan

  variables {
    container_insights = true
  }

  assert {
    condition     = one([for s in aws_ecs_cluster.this.setting : s.value if s.name == "containerInsights"]) == "enabled"
    error_message = "Container Insights must follow the variable"
  }
}

run "one_log_group_per_service_with_fourteen_day_retention" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_log_group.service) == 3
    error_message = "one log group per service name"
  }

  assert {
    condition     = alltrue([for g in aws_cloudwatch_log_group.service : g.retention_in_days == 14])
    error_message = "retention must be 14 days"
  }

  assert {
    condition     = aws_cloudwatch_log_group.service["platform-api"].name == "/eldritch-alley/eldritch-prod/platform-api"
    error_message = "log groups live under /eldritch-alley/, the prefix the deploy role may read"
  }
}

run "retention_follows_its_variable" {
  command = plan

  variables {
    log_retention_days = 30
  }

  assert {
    condition     = alltrue([for g in aws_cloudwatch_log_group.service : g.retention_in_days == 30])
    error_message = "retention must follow the variable"
  }
}

run "outputs_name_the_cluster_and_the_log_groups" {
  command = apply

  assert {
    condition     = output.cluster_name == "eldritch-prod"
    error_message = "the cluster is named after the stack"
  }

  assert {
    condition     = toset(keys(output.log_group_names)) == toset(["platform-api", "game-server", "migrate"]) && toset(keys(output.log_group_arns)) == toset(["platform-api", "game-server", "migrate"])
    error_message = "log group names and ARNs must be keyed by service"
  }
}
