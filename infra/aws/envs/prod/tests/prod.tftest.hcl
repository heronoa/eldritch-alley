# No credentials, no network access. Run from infra/aws/envs/prod/ with `terraform test`.

mock_provider "aws" {}

override_data {
  target = module.vpc.data.aws_availability_zones.available
  values = {
    names = ["us-east-1a", "us-east-1b"]
  }
}

# The managed master secret is a computed block the mock leaves empty.
override_resource {
  target = module.rds.aws_db_instance.this
  values = {
    address = "mock.db.example"
    master_user_secret = [{
      kms_key_id    = "alias/aws/secretsmanager"
      secret_arn    = "arn:aws:secretsmanager:us-east-1:123456789012:secret:rds!db-mock"
      secret_status = "active"
    }]
  }
}

run "composition_exposes_the_contract_for_infra_03_and_infra_04" {
  command = plan

  assert {
    condition     = output.ssm_prefix == "/eldritch-alley/prod"
    error_message = "the SSM prefix is part of the contract"
  }

  assert {
    condition     = length(output.public_subnet_ids) == 2 && length(output.isolated_subnet_ids) == 2
    error_message = "two subnets per tier"
  }

  assert {
    condition     = length(output.repository_urls) == 2
    error_message = "two ECR repositories"
  }
}

run "destroyable_is_false_by_default_across_the_stack" {
  command = plan

  assert {
    condition     = var.destroyable == false
    error_message = "the production stack must not be destroyable by default"
  }
}

# The wiring checks read module outputs and need ids, so they use apply on the
# mocked provider (still no credentials and no network access).
run "only_platform_api_reaches_postgres_and_both_services_reach_redis" {
  command = apply

  assert {
    condition     = module.rds.allowed_security_group_ids == tolist([aws_security_group.platform_api.id])
    error_message = "RDS must admit the platform-api group and nothing else"
  }

  assert {
    condition     = toset(module.redis.allowed_security_group_ids) == toset([aws_security_group.platform_api.id, aws_security_group.game_server.id])
    error_message = "Redis must admit both service groups"
  }

  assert {
    condition     = !contains(module.rds.allowed_security_group_ids, aws_security_group.game_server.id)
    error_message = "the game-server group must not reach PostgreSQL"
  }
}

run "data_stores_sit_in_the_isolated_subnets" {
  command = apply

  assert {
    condition     = toset(module.rds.subnet_ids) == toset(module.vpc.isolated_subnet_ids)
    error_message = "RDS must use the isolated subnets"
  }

  assert {
    condition     = toset(module.redis.subnet_ids) == toset(module.vpc.isolated_subnet_ids)
    error_message = "Redis must use the isolated subnets"
  }

  assert {
    condition     = length(setintersection(toset(module.rds.subnet_ids), toset(module.vpc.public_subnet_ids))) == 0
    error_message = "no data store may touch a public subnet"
  }
}

run "task_security_groups_carry_no_inline_rules" {
  command = apply

  assert {
    condition = (
      length(aws_security_group.platform_api.ingress) == 0
      && length(aws_security_group.game_server.ingress) == 0
    )
    error_message = "infra-04 adds ingress with separate rule resources, so these groups must stay empty"
  }

  assert {
    condition     = output.platform_api_security_group_id == aws_security_group.platform_api.id && output.game_server_security_group_id == aws_security_group.game_server.id
    error_message = "the group ids are part of the contract toward infra-04"
  }
}

run "data_store_outputs_are_part_of_the_contract" {
  command = apply

  assert {
    condition     = output.db_name == "eldritch_alley" && output.db_username == "eldritch" && output.db_port == 5432
    error_message = "database name, user and port must be exposed"
  }

  assert {
    condition     = output.redis_port == 6379
    error_message = "the Redis port must be exposed"
  }
}
