locals {
  name       = "eldritch-stg"
  ssm_prefix = "/eldritch-alley/stg"
}

module "network" {
  source = "../../modules/network"

  name               = local.name
  vpc_cidr           = var.vpc_cidr
  public_subnet_cidr = var.public_subnet_cidr
  availability_zone  = var.availability_zone
}

module "ecr" {
  source = "../../modules/ecr"

  name = "eldritch-alley/game-server"
}

module "ec2" {
  source = "../../modules/ec2"

  name              = local.name
  region            = var.region
  subnet_id         = module.network.public_subnet_id
  security_group_id = module.network.security_group_id
  instance_type     = var.instance_type
  root_volume_gb    = var.root_volume_gb

  ssm_param_prefix        = local.ssm_prefix
  cloudflared_token_param = "${local.ssm_prefix}/cloudflared-token"

  game_server_image = "${module.ecr.repository_url}:${var.game_server_image_tag}"
  cloudflared_tag   = var.cloudflared_tag
  compose_version   = var.compose_version
  compose_file      = file("${path.module}/../../../../deploy/stg/docker-compose.yml")
}
