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
