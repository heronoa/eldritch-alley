locals {
  assume_ecs_tasks = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })

  # The statements passed in, plus the channel actions ECS Exec needs when it is on.
  # Built with for-expressions because a conditional between differently shaped tuples
  # is a type error in Terraform.
  task_statements = concat(
    flatten([for p in [var.task_role_policy_json] : jsondecode(p).Statement if p != null]),
    flatten([for _ in range(var.enable_execute_command ? 1 : 0) : [{
      Sid    = "EcsExec"
      Effect = "Allow"
      Action = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel",
      ]
      Resource = "*"
    }]]),
  )

  container = merge(
    {
      name      = var.name
      image     = var.image
      essential = true

      environment = [for k in sort(keys(var.environment)) : { name = k, value = var.environment[k] }]
      secrets     = [for k in sort(keys(var.secrets)) : { name = k, valueFrom = var.secrets[k] }]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = var.name
        }
      }
    },
    { for k, v in { portMappings = [{ containerPort = var.container_port, protocol = "tcp" }] } : k => v if var.container_port != null },
    { for k, v in { command = var.command } : k => v if var.command != null },
    { for k, v in { stopTimeout = var.stop_timeout } : k => v if var.stop_timeout != null },
  )
}

# --- Execution role: what ECS itself needs to start the task ----------------
# Scoped to this service: its repository, its log group, its parameters and secrets.

resource "aws_iam_role" "execution" {
  name               = "${var.prefix}-${var.name}-execution"
  assume_role_policy = local.assume_ecs_tasks
}

resource "aws_iam_role_policy" "execution" {
  name = "start-${var.name}"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid      = "EcrAuth"
          Effect   = "Allow"
          Action   = ["ecr:GetAuthorizationToken"]
          Resource = "*"
        },
        {
          Sid    = "EcrPull"
          Effect = "Allow"
          Action = [
            "ecr:BatchCheckLayerAvailability",
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage",
          ]
          Resource = var.ecr_repository_arn
        },
        {
          Sid      = "WriteLogs"
          Effect   = "Allow"
          Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
          Resource = "${var.log_group_arn}:*"
        },
      ],
      flatten([for _ in range(length(var.ssm_parameter_arns) == 0 ? 0 : 1) : [
        {
          Sid      = "ReadSsmParameters"
          Effect   = "Allow"
          Action   = ["ssm:GetParameters"]
          Resource = var.ssm_parameter_arns
        },
        {
          # SecureString values use the AWS managed key; only SSM may use it for this role.
          Sid      = "DecryptSsmParameters"
          Effect   = "Allow"
          Action   = ["kms:Decrypt"]
          Resource = "*"
          Condition = {
            StringEquals = { "kms:ViaService" = "ssm.${var.region}.amazonaws.com" }
          }
        },
      ]]),
      flatten([for _ in range(length(var.secrets_manager_arns) == 0 ? 0 : 1) : [
        {
          Sid      = "ReadSecrets"
          Effect   = "Allow"
          Action   = ["secretsmanager:GetSecretValue"]
          Resource = var.secrets_manager_arns
        },
        {
          Sid      = "DecryptSecrets"
          Effect   = "Allow"
          Action   = ["kms:Decrypt"]
          Resource = "*"
          Condition = {
            StringEquals = { "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com" }
          }
        },
      ]]),
    )
  })
}

# --- Task role: what the running application may do -------------------------

resource "aws_iam_role" "task" {
  name               = "${var.prefix}-${var.name}-task"
  assume_role_policy = local.assume_ecs_tasks
}

resource "aws_iam_role_policy" "task" {
  # Decided from the inputs, never from the statements: the caller's policy document
  # embeds ARNs that exist only after apply, and a count cannot depend on those.
  count = var.task_role_policy_json != null || var.enable_execute_command ? 1 : 0

  name = "run-${var.name}"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = local.task_statements
  })
}

# --- Task definition and service ---------------------------------------------

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.prefix}-${var.name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = var.cpu_architecture
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([local.container])
}

resource "aws_ecs_service" "this" {
  count = var.create_service ? 1 : 0

  name            = "${var.prefix}-${var.name}"
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn
  launch_type     = "FARGATE"
  desired_count   = var.services_enabled ? var.desired_count : 0

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = var.target_group_arn == null ? null : var.health_check_grace_period_seconds
  enable_execute_command             = var.enable_execute_command

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.security_group_id]
    assign_public_ip = true
  }

  dynamic "load_balancer" {
    for_each = var.target_group_arn == null ? [] : [1]

    content {
      target_group_arn = var.target_group_arn
      container_name   = var.name
      container_port   = var.container_port
    }
  }

  # The deploy workflow owns the image: it registers new revisions of the family and
  # updates the service. Terraform must not roll them back. The cost is that a change
  # here to the environment or secrets only registers a new revision, and reaches the
  # running service at the next deploy.
  lifecycle {
    ignore_changes = [task_definition]
  }
}
