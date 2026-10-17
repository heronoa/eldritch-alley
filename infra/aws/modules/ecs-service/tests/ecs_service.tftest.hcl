# No credentials, no network access. Run from infra/aws/modules/ecs-service/ with `terraform test`.
# `ignore_changes = [task_definition]` on the service cannot be asserted by terraform
# test; it is covered by review.

mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock"
    }
  }

  mock_resource "aws_ecs_task_definition" {
    defaults = {
      arn = "arn:aws:ecs:us-east-1:123456789012:task-definition/mock:1"
    }
  }
}

variables {
  prefix = "eldritch-prod"
  name   = "platform-api"
  region = "us-east-1"

  cluster_arn = "arn:aws:ecs:us-east-1:123456789012:cluster/eldritch-prod"
  image       = "123456789012.dkr.ecr.us-east-1.amazonaws.com/eldritch-alley/prod/platform-api:sha-pending"

  container_port = 3000
  environment = {
    PLATFORM_API_PORT = "3000"
    AWS_REGION        = "us-east-1"
  }
  secrets = {
    SESSION_SECRET = "arn:aws:ssm:us-east-1:123456789012:parameter/eldritch-alley/prod/SESSION_SECRET"
    DB_PASSWORD    = "arn:aws:secretsmanager:us-east-1:123456789012:secret:rds!db-mock:password::"
  }
  ssm_parameter_arns   = ["arn:aws:ssm:us-east-1:123456789012:parameter/eldritch-alley/prod/SESSION_SECRET"]
  secrets_manager_arns = ["arn:aws:secretsmanager:us-east-1:123456789012:secret:rds!db-mock"]

  ecr_repository_arn = "arn:aws:ecr:us-east-1:123456789012:repository/eldritch-alley/prod/platform-api"
  log_group_name     = "/eldritch-alley/eldritch-prod/platform-api"
  log_group_arn      = "arn:aws:logs:us-east-1:123456789012:log-group:/eldritch-alley/eldritch-prod/platform-api"

  security_group_id = "sg-0aaa"
  subnet_ids        = ["subnet-0aaa", "subnet-0bbb"]
  target_group_arn  = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/platform-api/0123456789abcdef"

  task_role_policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:SendMessage"]
      Resource = "arn:aws:sqs:us-east-1:123456789012:eldritch-prod-match-ended.fifo"
    }]
  })
}

run "service_starts_at_zero_tasks_unless_enabled" {
  command = plan

  assert {
    condition     = one(aws_ecs_service.this).desired_count == 0
    error_message = "the service must start with no tasks, because the repositories are empty at first apply"
  }
}

run "enabled_service_runs_the_desired_count" {
  command = plan

  variables {
    services_enabled = true
    desired_count    = 1
  }

  assert {
    condition     = one(aws_ecs_service.this).desired_count == 1
    error_message = "an enabled service must run the desired count"
  }
}

run "rollout_rolls_back_and_never_drops_below_full_capacity" {
  command = plan

  assert {
    condition     = one(one(aws_ecs_service.this).deployment_circuit_breaker).enable == true && one(one(aws_ecs_service.this).deployment_circuit_breaker).rollback == true
    error_message = "the deployment circuit breaker must roll back"
  }

  assert {
    condition     = one(aws_ecs_service.this).deployment_minimum_healthy_percent == 100 && one(aws_ecs_service.this).deployment_maximum_percent == 200
    error_message = "a rollout starts the new task before stopping the old one"
  }

  assert {
    condition     = one(aws_ecs_service.this).health_check_grace_period_seconds == 60
    error_message = "the health check grace period must be 60 seconds"
  }

  assert {
    condition     = one(aws_ecs_service.this).launch_type == "FARGATE"
    error_message = "tasks run on Fargate"
  }
}

run "tasks_sit_in_the_given_subnets_with_the_given_group_and_a_public_ip" {
  command = plan

  assert {
    condition     = one(one(aws_ecs_service.this).network_configuration).assign_public_ip == true
    error_message = "tasks get a public IP: there is no NAT"
  }

  assert {
    condition     = one(one(aws_ecs_service.this).network_configuration).security_groups == toset(["sg-0aaa"]) && one(one(aws_ecs_service.this).network_configuration).subnets == toset(["subnet-0aaa", "subnet-0bbb"])
    error_message = "the service must use exactly the group and subnets given"
  }

  assert {
    condition     = one(one(aws_ecs_service.this).load_balancer).container_port == 3000 && one(one(aws_ecs_service.this).load_balancer).container_name == "platform-api"
    error_message = "the service must register its container with the target group"
  }
}

run "task_definition_is_a_small_fargate_awsvpc_task" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.this.network_mode == "awsvpc" && aws_ecs_task_definition.this.requires_compatibilities == toset(["FARGATE"])
    error_message = "awsvpc on Fargate"
  }

  assert {
    condition     = aws_ecs_task_definition.this.cpu == "256" && aws_ecs_task_definition.this.memory == "512"
    error_message = "defaults are 256 CPU units and 512 MiB"
  }

  assert {
    condition     = one(aws_ecs_task_definition.this.runtime_platform).cpu_architecture == "X86_64"
    error_message = "the default architecture is X86_64"
  }

  assert {
    condition     = aws_ecs_task_definition.this.family == "eldritch-prod-platform-api"
    error_message = "the family is <prefix>-<name>, which the deploy workflow renders from"
  }
}

run "container_definition_carries_env_secrets_port_and_logs" {
  command = plan

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].image == var.image
    error_message = "the container must run the given image"
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].portMappings[0].containerPort == 3000
    error_message = "the container must expose its port"
  }

  assert {
    condition     = toset([for e in jsondecode(aws_ecs_task_definition.this.container_definitions)[0].environment : e.name]) == toset(["PLATFORM_API_PORT", "AWS_REGION"])
    error_message = "the environment must be exactly the map given"
  }

  assert {
    condition = (
      toset([for s in jsondecode(aws_ecs_task_definition.this.container_definitions)[0].secrets : s.name]) == toset(["SESSION_SECRET", "DB_PASSWORD"])
      && alltrue([for s in jsondecode(aws_ecs_task_definition.this.container_definitions)[0].secrets : startswith(s.valueFrom, "arn:")])
    )
    error_message = "secrets must be references by ARN, never values"
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.this.container_definitions)[0].logConfiguration.logDriver == "awslogs"
      && jsondecode(aws_ecs_task_definition.this.container_definitions)[0].logConfiguration.options["awslogs-group"] == "/eldritch-alley/eldritch-prod/platform-api"
      && jsondecode(aws_ecs_task_definition.this.container_definitions)[0].logConfiguration.options["awslogs-region"] == "us-east-1"
    )
    error_message = "the container must log to its own log group"
  }
}

run "stop_timeout_follows_its_variable" {
  command = plan

  variables {
    stop_timeout = 120
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].stopTimeout == 120
    error_message = "stopTimeout must follow the variable (the game-server needs 120 s to end its rooms)"
  }
}

run "a_latest_tag_is_refused" {
  command = plan

  variables {
    image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/eldritch-alley/prod/platform-api:latest"
  }

  expect_failures = [var.image]
}

run "an_image_without_a_tag_is_refused" {
  command = plan

  variables {
    image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/eldritch-alley/prod/platform-api"
  }

  expect_failures = [var.image]
}

run "execution_and_task_roles_are_different_roles_for_ecs_tasks_only" {
  command = plan

  assert {
    condition     = aws_iam_role.execution.name == "eldritch-prod-platform-api-execution" && aws_iam_role.task.name == "eldritch-prod-platform-api-task"
    error_message = "role names must match the patterns the deploy role may pass"
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.execution.assume_role_policy).Statement[0].Principal.Service == "ecs-tasks.amazonaws.com"
      && jsondecode(aws_iam_role.task.assume_role_policy).Statement[0].Principal.Service == "ecs-tasks.amazonaws.com"
    )
    error_message = "only ECS tasks may assume these roles"
  }
}

run "task_role_carries_exactly_the_policy_passed_in" {
  command = plan

  assert {
    condition     = jsondecode(one(aws_iam_role_policy.task).policy).Statement == jsondecode(var.task_role_policy_json).Statement
    error_message = "the task role must carry the given statements and nothing more"
  }
}

run "execution_role_reads_only_the_given_parameters_and_secrets" {
  command = plan

  assert {
    condition = toset(flatten([
      for s in jsondecode(aws_iam_role_policy.execution.policy).Statement : flatten([s.Resource]) if s.Sid == "ReadSsmParameters"
    ])) == toset(var.ssm_parameter_arns)
    error_message = "the execution role may read only the given SSM parameters"
  }

  assert {
    condition = toset(flatten([
      for s in jsondecode(aws_iam_role_policy.execution.policy).Statement : flatten([s.Resource]) if s.Sid == "ReadSecrets"
    ])) == toset(var.secrets_manager_arns)
    error_message = "the execution role may read only the given Secrets Manager secrets"
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.execution.policy).Statement :
      !contains(flatten([s.Resource]), "*") || s.Sid == "EcrAuth" || can(s.Condition)
    ])
    error_message = "the only unconditioned wildcard is ECR's authorization token"
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.execution.policy).Statement :
      contains(flatten([s.Action]), "kms:Decrypt") && s.Condition.StringEquals["kms:ViaService"] == "ssm.us-east-1.amazonaws.com"
    ])
    error_message = "kms:Decrypt must be limited to use through the SSM service"
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.execution.policy).Statement :
      contains(flatten([s.Action]), "logs:PutLogEvents") && contains(flatten([s.Resource]), "${var.log_group_arn}:*")
    ])
    error_message = "the execution role may write only its own log group"
  }
}

run "ecs_exec_is_off_by_default_and_adds_the_ssm_channel_actions_when_on" {
  command = plan

  assert {
    condition     = one(aws_ecs_service.this).enable_execute_command == false
    error_message = "ECS Exec must be off by default"
  }

  assert {
    condition     = !anytrue([for s in jsondecode(one(aws_iam_role_policy.task).policy).Statement : contains(flatten([s.Action]), "ssmmessages:CreateDataChannel")])
    error_message = "no ssmmessages permission while ECS Exec is off"
  }
}

run "ecs_exec_on_grants_the_channel_actions" {
  command = plan

  variables {
    enable_execute_command = true
  }

  assert {
    condition     = one(aws_ecs_service.this).enable_execute_command == true
    error_message = "ECS Exec must follow the variable"
  }

  assert {
    condition     = anytrue([for s in jsondecode(one(aws_iam_role_policy.task).policy).Statement : contains(flatten([s.Action]), "ssmmessages:CreateDataChannel")])
    error_message = "ECS Exec needs the ssmmessages channel actions on the task role"
  }
}

# The migrate family: the same module, with no service, no port and no load balancer.
run "a_one_off_task_has_no_service_no_port_and_runs_its_command" {
  command = plan

  variables {
    create_service        = false
    container_port        = null
    target_group_arn      = null
    command               = ["node", "dist/migrate.js"]
    task_role_policy_json = null
  }

  assert {
    condition     = length(aws_ecs_service.this) == 0
    error_message = "a one-off task must have no service"
  }

  assert {
    condition     = !can(jsondecode(aws_ecs_task_definition.this.container_definitions)[0].portMappings)
    error_message = "a one-off task exposes no port"
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].command == ["node", "dist/migrate.js"]
    error_message = "the container must run the given command"
  }

  assert {
    condition     = length(aws_iam_role_policy.task) == 0
    error_message = "a task role with no policy given must carry none"
  }
}

run "outputs_name_what_the_deploy_workflow_needs" {
  command = apply

  assert {
    condition     = output.task_definition_family == "eldritch-prod-platform-api" && output.service_name == "eldritch-prod-platform-api"
    error_message = "the family and the service name are part of the contract toward the deploy workflow"
  }

  assert {
    condition     = output.desired_count == 0
    error_message = "the desired count must be readable"
  }

  assert {
    condition     = output.environment == var.environment && toset(keys(output.secrets)) == toset(keys(var.secrets))
    error_message = "the environment and the secret names must be readable"
  }

  assert {
    condition     = startswith(output.execution_role_arn, "arn:") && startswith(output.task_role_arn, "arn:")
    error_message = "both role ARNs must be outputs"
  }
}
