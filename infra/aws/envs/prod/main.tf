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
