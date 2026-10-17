data "aws_caller_identity" "current" {}

locals {
  name       = "eldritch-prod"
  ssm_prefix = "/eldritch-alley/prod"
}

module "vpc" {
  source = "../../modules/vpc"

  name     = local.name
  vpc_cidr = var.vpc_cidr
  region   = var.region
}

module "ecr" {
  source = "../../modules/ecr-repos"

  repository_names = [
    "eldritch-alley/prod/game-server",
    "eldritch-alley/prod/platform-api",
  ]
  destroyable = var.destroyable
}

module "assets_bucket" {
  source = "../../modules/assets-bucket"

  name                = "${local.name}-assets-${data.aws_caller_identity.current.account_id}"
  cors_allowed_origin = var.assets_cors_origin
  destroyable         = var.destroyable
}

module "match_ended_queue" {
  source = "../../modules/sqs"

  name                       = "${local.name}-match-ended"
  visibility_timeout_seconds = var.visibility_timeout_seconds
}

module "ssm_parameters" {
  source = "../../modules/ssm-parameters"

  prefix     = local.ssm_prefix
  parameters = var.ssm_parameters
}

# One group per service, with no rules: the services that use them add their own
# ingress with separate rule resources (infra-04). platform-api (and the migrate
# task) may reach PostgreSQL and Redis; the game-server may reach only Redis.
resource "aws_security_group" "platform_api" {
  name        = "${local.name}-platform-api"
  description = "platform-api and migrate tasks"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group" "game_server" {
  name        = "${local.name}-game-server"
  description = "game-server tasks"
  vpc_id      = module.vpc.vpc_id
}

module "rds" {
  source = "../../modules/rds"

  name                       = local.name
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.isolated_subnet_ids
  allowed_security_group_ids = [aws_security_group.platform_api.id]

  db_name                   = var.db_name
  db_username               = var.db_username
  allocated_storage         = var.db_allocated_storage
  multi_az                  = var.multi_az
  destroyable               = var.destroyable
  final_snapshot_identifier = "${local.name}-final"
}

module "redis" {
  source = "../../modules/redis"

  name       = local.name
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.isolated_subnet_ids
  allowed_security_group_ids = [
    aws_security_group.platform_api.id,
    aws_security_group.game_server.id,
  ]
}

# --- Edge: Cloudflare, ALB, certificate, WAF ---------------------------------

# Cloudflare's published ranges, the only sources the ALB admits. Refreshing the list
# needs an apply; they change rarely. IPv4 only, because the ALB is IPv4 only.
data "cloudflare_ip_ranges" "cloudflare" {}

module "alb" {
  source = "../../modules/alb"

  name                  = local.name
  vpc_id                = module.vpc.vpc_id
  public_subnet_ids     = module.vpc.public_subnet_ids
  cloudflare_ipv4_cidrs = data.cloudflare_ip_ranges.cloudflare.ipv4_cidrs

  services = {
    "platform-api" = {
      hostname          = var.api_hostname
      port              = 3000
      health_check_path = "/health"
      security_group_id = aws_security_group.platform_api.id
    }
    "game-server" = {
      hostname             = var.game_hostname
      port                 = 2567
      health_check_path    = var.game_server_health_check_path
      deregistration_delay = 120
      security_group_id    = aws_security_group.game_server.id
    }
  }

  validation_record_fqdns = var.manage_cloudflare_dns ? module.edge_dns.validation_fqdns : null
  destroyable             = var.destroyable
}

module "waf" {
  source = "../../modules/waf"

  name                = local.name
  alb_arn             = module.alb.alb_arn
  rate_limit          = var.waf_rate_limit
  rate_window_seconds = var.waf_rate_window_seconds
  rate_limit_action   = var.waf_rate_limit_action
}

module "edge_dns" {
  source = "../../modules/edge-dns"

  zone_id = var.cloudflare_zone_id
  hostnames = {
    "platform-api" = var.api_hostname
    "game-server"  = var.game_hostname
  }
  alb_dns_name                   = module.alb.alb_dns_name
  certificate_validation_options = module.alb.certificate_validation_options
  manage_cloudflare_dns          = var.manage_cloudflare_dns
  manage_zone_ssl_mode           = var.manage_zone_ssl_mode
}

# --- Compute: security group rules, cluster, services, migrate -----------------

# The groups themselves come from infra-03 and carry no rules. Everything below is a
# separate rule resource, never an inline block.

resource "aws_vpc_security_group_ingress_rule" "platform_api_from_alb" {
  security_group_id            = aws_security_group.platform_api.id
  referenced_security_group_id = module.alb.alb_security_group_id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  description                  = "From the ALB"
}

resource "aws_vpc_security_group_ingress_rule" "game_server_from_alb" {
  security_group_id            = aws_security_group.game_server.id
  referenced_security_group_id = module.alb.alb_security_group_id
  from_port                    = 2567
  to_port                      = 2567
  ip_protocol                  = "tcp"
  description                  = "From the ALB"
}

# There is no NAT gateway and no interface endpoint, so a task reaches ECR, SSM,
# Secrets Manager, SQS, S3 and the OAuth providers over the internet, on 443 only.
resource "aws_vpc_security_group_egress_rule" "https" {
  for_each = {
    "platform-api" = aws_security_group.platform_api.id
    "game-server"  = aws_security_group.game_server.id
  }

  security_group_id = each.value
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "HTTPS"
}

resource "aws_vpc_security_group_egress_rule" "platform_api_to_postgres" {
  security_group_id            = aws_security_group.platform_api.id
  referenced_security_group_id = module.rds.security_group_id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "PostgreSQL"
}

resource "aws_vpc_security_group_egress_rule" "platform_api_to_redis" {
  security_group_id            = aws_security_group.platform_api.id
  referenced_security_group_id = module.redis.security_group_id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  description                  = "Redis"
}

resource "aws_vpc_security_group_egress_rule" "game_server_to_redis" {
  security_group_id            = aws_security_group.game_server.id
  referenced_security_group_id = module.redis.security_group_id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  description                  = "Redis"
}

resource "aws_vpc_security_group_egress_rule" "platform_api_smtp" {
  count = var.email_enabled ? 1 : 0

  security_group_id = aws_security_group.platform_api.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = var.email_smtp_port
  to_port           = var.email_smtp_port
  ip_protocol       = "tcp"
  description       = "SMTP"
}

module "ecs_cluster" {
  source = "../../modules/ecs-cluster"

  name               = local.name
  service_names      = ["platform-api", "game-server", "migrate"]
  container_insights = var.container_insights
}

locals {
  platform_api_repository = "eldritch-alley/prod/platform-api"
  game_server_repository  = "eldritch-alley/prod/game-server"

  redis_url           = "rediss://${module.redis.primary_endpoint_address}:${module.redis.port}"
  database_secret_arn = module.rds.master_secret_arn
  parameter_arns      = module.ssm_parameters.parameter_arns

  # DB_PASSWORD is the password key of the JSON secret RDS keeps. The application builds
  # its connection string from the parts; it reads only DATABASE_URL today, so it needs
  # that small change before the first rollout (see the plan's Q2).
  database_environment = {
    DB_HOST = module.rds.endpoint
    DB_PORT = tostring(module.rds.port)
    DB_NAME = module.rds.db_name
    DB_USER = module.rds.username
  }
  database_secrets = {
    DB_PASSWORD = "${local.database_secret_arn}:password::"
  }

  platform_api_environment = merge(
    {
      PLATFORM_API_PORT       = "3000"
      AWS_REGION              = var.region
      MATCH_ENDED_QUEUE_URL   = module.match_ended_queue.queue_url
      REDIS_URL               = local.redis_url
      ASSETS_BUCKET           = module.assets_bucket.bucket_name
      CLIENT_ORIGIN           = var.client_origin
      OAUTH_REDIRECT_BASE_URL = "https://${var.api_hostname}"
      COOKIE_DOMAIN           = coalesce(var.cookie_domain, var.api_hostname)
    },
    local.database_environment,
    { for k, v in { OAUTH_GITHUB_CLIENT_ID = var.oauth_github_client_id } : k => v if var.oauth_github_enabled },
    { for k, v in { OAUTH_GOOGLE_CLIENT_ID = var.oauth_google_client_id } : k => v if var.oauth_google_enabled },
    {
      for k, v in {
        EMAIL_SMTP_HOST = var.email_smtp_host
        EMAIL_SMTP_PORT = tostring(var.email_smtp_port)
        EMAIL_SMTP_USER = var.email_smtp_user
        EMAIL_FROM      = var.email_from
      } : k => v if var.email_enabled
    },
  )

  # The parameters the execution role must be allowed to read, kept apart from the
  # database password, which lives in Secrets Manager.
  platform_api_parameter_secrets = merge(
    {
      SESSION_SECRET          = local.parameter_arns["SESSION_SECRET"]
      GAME_TICKET_PRIVATE_KEY = local.parameter_arns["GAME_TICKET_PRIVATE_KEY"]
    },
    { for k, v in { OAUTH_GITHUB_CLIENT_SECRET = local.parameter_arns["OAUTH_GITHUB_CLIENT_SECRET"] } : k => v if var.oauth_github_enabled },
    { for k, v in { OAUTH_GOOGLE_CLIENT_SECRET = local.parameter_arns["OAUTH_GOOGLE_CLIENT_SECRET"] } : k => v if var.oauth_google_enabled },
    { for k, v in { EMAIL_SMTP_PASSWORD = local.parameter_arns["EMAIL_SMTP_PASSWORD"] } : k => v if var.email_enabled },
  )

  platform_api_secrets = merge(local.platform_api_parameter_secrets, local.database_secrets)

  game_server_environment = merge(
    {
      GAME_SERVER_PORT      = "2567"
      AWS_REGION            = var.region
      MATCH_ENDED_QUEUE_URL = module.match_ended_queue.queue_url
      REDIS_URL             = local.redis_url
    },
    { for k, v in { GAME_SERVER_MAX_MATCHES = tostring(var.game_server_max_matches) } : k => v if var.game_server_max_matches != null },
  )

  game_server_secrets = {
    GAME_TICKET_PUBLIC_KEY = local.parameter_arns["GAME_TICKET_PUBLIC_KEY"]
  }
}

module "platform_api" {
  source = "../../modules/ecs-service"

  prefix           = local.name
  name             = "platform-api"
  region           = var.region
  cluster_arn      = module.ecs_cluster.cluster_arn
  image            = "${module.ecr.repository_urls[local.platform_api_repository]}:${var.placeholder_image_tag}"
  cpu_architecture = var.cpu_architecture

  container_port       = 3000
  environment          = local.platform_api_environment
  secrets              = local.platform_api_secrets
  ssm_parameter_arns   = values(local.platform_api_parameter_secrets)
  secrets_manager_arns = [local.database_secret_arn]

  ecr_repository_arn = module.ecr.repository_arns[local.platform_api_repository]
  log_group_name     = module.ecs_cluster.log_group_names["platform-api"]
  log_group_arn      = module.ecs_cluster.log_group_arns["platform-api"]

  security_group_id = aws_security_group.platform_api.id
  subnet_ids        = module.vpc.public_subnet_ids
  target_group_arn  = module.alb.target_group_arns["platform-api"]

  services_enabled       = var.services_enabled
  enable_execute_command = var.enable_ecs_exec

  # Reads and writes the assets bucket under users/* only, and consumes the match queue.
  task_role_policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AssetsUnderUsers"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${module.assets_bucket.bucket_arn}/users/*"
      },
      {
        Sid      = "ConsumeMatchQueue"
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = module.match_ended_queue.queue_arn
      },
    ]
  })
}

module "game_server" {
  source = "../../modules/ecs-service"

  prefix           = local.name
  name             = "game-server"
  region           = var.region
  cluster_arn      = module.ecs_cluster.cluster_arn
  image            = "${module.ecr.repository_urls[local.game_server_repository]}:${var.placeholder_image_tag}"
  cpu_architecture = var.cpu_architecture

  container_port     = 2567
  environment        = local.game_server_environment
  secrets            = local.game_server_secrets
  ssm_parameter_arns = values(local.game_server_secrets)

  ecr_repository_arn = module.ecr.repository_arns[local.game_server_repository]
  log_group_name     = module.ecs_cluster.log_group_names["game-server"]
  log_group_arn      = module.ecs_cluster.log_group_arns["game-server"]

  security_group_id = aws_security_group.game_server.id
  subnet_ids        = module.vpc.public_subnet_ids
  target_group_arn  = module.alb.target_group_arns["game-server"]

  services_enabled       = var.services_enabled
  enable_execute_command = var.enable_ecs_exec

  # A Colyseus room that is ending needs time to finish before the task is stopped.
  stop_timeout = 120

  task_role_policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "PublishFinishedMatches"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = module.match_ended_queue.queue_arn
      },
    ]
  })
}

# The schema, applied by the deploy workflow before each rollout. The platform-api
# image with another command: a task family only, never a service. It needs the
# database and nothing else, so its task role has no policy.
module "migrate" {
  source = "../../modules/ecs-service"

  prefix           = local.name
  name             = "migrate"
  region           = var.region
  cluster_arn      = module.ecs_cluster.cluster_arn
  image            = "${module.ecr.repository_urls[local.platform_api_repository]}:${var.placeholder_image_tag}"
  cpu_architecture = var.cpu_architecture

  command              = var.migrate_command
  environment          = local.database_environment
  secrets              = local.database_secrets
  secrets_manager_arns = [local.database_secret_arn]

  ecr_repository_arn = module.ecr.repository_arns[local.platform_api_repository]
  log_group_name     = module.ecs_cluster.log_group_names["migrate"]
  log_group_arn      = module.ecs_cluster.log_group_arns["migrate"]

  security_group_id = aws_security_group.platform_api.id
  subnet_ids        = module.vpc.public_subnet_ids

  create_service = false
}
