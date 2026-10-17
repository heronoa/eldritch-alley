# No credentials, no network access. Run from infra/aws/envs/prod/ with `terraform test`.

# The real provider validates ARN syntax on apply, so the mocked resources get valid ARNs.
mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock"
    }
  }

  mock_resource "aws_ecs_cluster" {
    defaults = {
      arn = "arn:aws:ecs:us-east-1:123456789012:cluster/mock"
    }
  }

  mock_resource "aws_ecs_task_definition" {
    defaults = {
      arn = "arn:aws:ecs:us-east-1:123456789012:task-definition/mock:1"
    }
  }

  mock_resource "aws_ssm_parameter" {
    defaults = {
      arn = "arn:aws:ssm:us-east-1:123456789012:parameter/eldritch-alley/prod/MOCK"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:123456789012:log-group:/mock"
    }
  }
}
mock_provider "cloudflare" {}

variables {
  cloudflare_zone_id = "0123456789abcdef0123456789abcdef"
}

override_data {
  target = data.cloudflare_ip_ranges.cloudflare
  values = {
    ipv4_cidrs = ["173.245.48.0/20", "103.21.244.0/22"]
  }
}

override_data {
  target = module.vpc.data.aws_availability_zones.available
  values = {
    names = ["us-east-1a", "us-east-1b"]
  }
}

# The certificate's validation records are a computed set the mock leaves empty.
override_resource {
  target = module.alb.aws_acm_certificate.this
  values = {
    arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
    domain_validation_options = [
      {
        domain_name           = "eldritch-aws-api.heronoa.com.br"
        resource_record_name  = "_abc.eldritch-aws-api.heronoa.com.br."
        resource_record_type  = "CNAME"
        resource_record_value = "_def.acm-validations.aws."
      },
      {
        domain_name           = "eldritch-aws-game.heronoa.com.br"
        resource_record_name  = "_ghi.eldritch-aws-game.heronoa.com.br."
        resource_record_type  = "CNAME"
        resource_record_value = "_jkl.acm-validations.aws."
      },
    ]
  }
}

# The real provider validates ARN syntax on apply, so the mocked resources get valid ARNs.
override_resource {
  target = module.alb.aws_lb.this
  values = {
    arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/mock/0123456789abcdef"
  }
}

override_resource {
  target = module.alb.aws_lb_listener.https
  values = {
    arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/mock/0123456789abcdef/0123456789abcdef"
  }
}

override_resource {
  target = module.alb.aws_lb_target_group.service["platform-api"]
  values = {
    arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/platform-api/0123456789abcdef"
  }
}

override_resource {
  target = module.alb.aws_lb_target_group.service["game-server"]
  values = {
    arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/game-server/0123456789abcdef"
  }
}

override_resource {
  target = module.waf.aws_wafv2_web_acl.this
  values = {
    arn = "arn:aws:wafv2:us-east-1:123456789012:regional/webacl/mock/00000000-0000-0000-0000-000000000000"
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

run "ssm_defaults_match_what_the_application_reads" {
  command = plan

  assert {
    condition = alltrue([
      for k in ["SESSION_SECRET", "GAME_TICKET_PRIVATE_KEY", "GAME_TICKET_PUBLIC_KEY", "TURNSTILE_SECRET", "OAUTH_GITHUB_CLIENT_SECRET", "OAUTH_GOOGLE_CLIENT_SECRET", "EMAIL_SMTP_PASSWORD"] :
      contains(keys(var.ssm_parameters), k)
    ])
    error_message = "every secret the application reads must have a parameter"
  }

  assert {
    condition     = !contains(keys(var.ssm_parameters), "JWT_SECRET")
    error_message = "JWT_SECRET is not read by the application, so it gets no parameter"
  }
}

run "edge_hostnames_and_waf_are_part_of_the_contract" {
  command = plan

  assert {
    condition     = output.api_hostname == "eldritch-aws-api.heronoa.com.br" && output.game_hostname == "eldritch-aws-game.heronoa.com.br"
    error_message = "the two hostnames are part of the contract toward infra-05"
  }

  assert {
    condition     = var.waf_rate_limit == 1000 && var.waf_rate_window_seconds == 300 && var.waf_rate_limit_action == "block"
    error_message = "the WAF defaults are a 1000 per 300 s placeholder in block mode"
  }

  assert {
    condition     = var.manage_zone_ssl_mode == false
    error_message = "the zone-wide SSL mode must not be touched unless asked"
  }
}

run "managing_dns_without_a_zone_id_is_refused" {
  command = plan

  variables {
    cloudflare_zone_id    = null
    manage_cloudflare_dns = true
  }

  expect_failures = [var.cloudflare_zone_id]
}

run "dns_can_be_left_unmanaged_without_a_zone_id" {
  command = plan

  variables {
    cloudflare_zone_id    = null
    manage_cloudflare_dns = false
  }

  assert {
    condition     = output.api_hostname == "eldritch-aws-api.heronoa.com.br"
    error_message = "the hostnames exist whether or not DNS is managed here"
  }
}

# --- Part B: compute --------------------------------------------------------

run "task_groups_admit_ingress_only_from_the_alb_on_their_port" {
  command = apply

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.platform_api_from_alb.from_port == 3000
      && aws_vpc_security_group_ingress_rule.platform_api_from_alb.to_port == 3000
      && aws_vpc_security_group_ingress_rule.platform_api_from_alb.ip_protocol == "tcp"
      && aws_vpc_security_group_ingress_rule.platform_api_from_alb.referenced_security_group_id == module.alb.alb_security_group_id
      && aws_vpc_security_group_ingress_rule.platform_api_from_alb.security_group_id == aws_security_group.platform_api.id
    )
    error_message = "platform-api admits TCP 3000 from the ALB group and nothing else"
  }

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.game_server_from_alb.from_port == 2567
      && aws_vpc_security_group_ingress_rule.game_server_from_alb.to_port == 2567
      && aws_vpc_security_group_ingress_rule.game_server_from_alb.ip_protocol == "tcp"
      && aws_vpc_security_group_ingress_rule.game_server_from_alb.referenced_security_group_id == module.alb.alb_security_group_id
      && aws_vpc_security_group_ingress_rule.game_server_from_alb.security_group_id == aws_security_group.game_server.id
    )
    error_message = "game-server admits TCP 2567 from the ALB group and nothing else"
  }

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.platform_api_from_alb.cidr_ipv4 == null
      && aws_vpc_security_group_ingress_rule.game_server_from_alb.cidr_ipv4 == null
    )
    error_message = "no task group may admit a CIDR, so never 0.0.0.0/0"
  }
}

run "task_groups_reach_the_stores_by_group_and_the_internet_only_on_443" {
  command = apply

  assert {
    condition = (
      aws_vpc_security_group_egress_rule.platform_api_to_postgres.from_port == 5432
      && aws_vpc_security_group_egress_rule.platform_api_to_postgres.referenced_security_group_id == module.rds.security_group_id
      && aws_vpc_security_group_egress_rule.platform_api_to_redis.from_port == 6379
      && aws_vpc_security_group_egress_rule.platform_api_to_redis.referenced_security_group_id == module.redis.security_group_id
      && aws_vpc_security_group_egress_rule.game_server_to_redis.from_port == 6379
      && aws_vpc_security_group_egress_rule.game_server_to_redis.referenced_security_group_id == module.redis.security_group_id
    )
    error_message = "the stores are reached by security group, on their own ports"
  }

  assert {
    condition = alltrue([
      for r in aws_vpc_security_group_egress_rule.https :
      r.cidr_ipv4 == "0.0.0.0/0" && r.from_port == 443 && r.to_port == 443 && r.ip_protocol == "tcp"
    ])
    error_message = "the only open egress is HTTPS (ECR, SSM, Secrets Manager, SQS, S3, OAuth providers)"
  }

  assert {
    condition     = length(aws_vpc_security_group_egress_rule.https) == 2
    error_message = "both service groups need outbound HTTPS, as there is no NAT and no endpoint"
  }

  assert {
    condition     = length(aws_vpc_security_group_egress_rule.platform_api_smtp) == 0
    error_message = "no SMTP egress while email is off"
  }
}

run "services_start_at_zero_and_the_migrate_family_has_no_service" {
  command = apply

  assert {
    condition     = module.platform_api.desired_count == 0 && module.game_server.desired_count == 0
    error_message = "every service starts with no tasks"
  }

  assert {
    condition     = module.migrate.service_name == null
    error_message = "the migrate family has no service"
  }

  assert {
    condition     = output.migrate_task_family == "eldritch-prod-migrate"
    error_message = "the migrate family is part of the contract toward infra-05"
  }
}

run "platform_api_environment_follows_the_application_contract" {
  command = apply

  assert {
    condition = alltrue([
      for k in ["AWS_ENDPOINT_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "JWT_SECRET", "DATABASE_URL"] :
      !contains(keys(module.platform_api.environment), k)
    ])
    error_message = "these must be absent: static keys, an endpoint override, JWT_SECRET (not read) and a URL carrying the password"
  }

  assert {
    condition = (
      module.platform_api.environment["PLATFORM_API_PORT"] == "3000"
      && module.platform_api.environment["AWS_REGION"] == var.region
      && module.platform_api.environment["CLIENT_ORIGIN"] == var.client_origin
      && module.platform_api.environment["OAUTH_REDIRECT_BASE_URL"] == "https://${var.api_hostname}"
      && module.platform_api.environment["DB_NAME"] == "eldritch_alley"
      && module.platform_api.environment["DB_USER"] == "eldritch"
      && module.platform_api.environment["DB_PORT"] == "5432"
    )
    error_message = "the plain environment must follow docker-compose.yml and the M4 spec"
  }

  assert {
    condition     = module.platform_api.environment["COOKIE_DOMAIN"] == var.api_hostname
    error_message = "the cookie is scoped to the API hostname itself, not to the parent domain"
  }

  assert {
    condition     = startswith(module.platform_api.environment["REDIS_URL"], "rediss://") && endswith(module.platform_api.environment["REDIS_URL"], ":6379")
    error_message = "Redis must be reached over TLS"
  }

  assert {
    condition     = endswith(module.platform_api.environment["MATCH_ENDED_QUEUE_URL"], ".fifo") || module.platform_api.environment["MATCH_ENDED_QUEUE_URL"] != ""
    error_message = "the match queue URL must be passed"
  }
}

run "no_secret_value_is_ever_a_plain_environment_variable" {
  command = apply

  assert {
    condition = !anytrue([
      for k in concat(keys(module.platform_api.environment), keys(module.game_server.environment), keys(module.migrate.environment)) :
      can(regex("SECRET|PASSWORD|PRIVATE_KEY|TOKEN", k))
    ])
    error_message = "a name that looks like a secret must come from the secrets map"
  }
}

run "secrets_are_references_by_arn" {
  command = apply

  assert {
    condition = (
      toset(keys(module.platform_api.secrets)) == toset(["SESSION_SECRET", "GAME_TICKET_PRIVATE_KEY", "DB_PASSWORD"])
      && toset(keys(module.game_server.secrets)) == toset(["GAME_TICKET_PUBLIC_KEY"])
      && toset(keys(module.migrate.secrets)) == toset(["DB_PASSWORD"])
    )
    error_message = "each service gets only the secrets it reads, and none of the optional ones while they are off"
  }

  assert {
    condition = alltrue([
      for v in concat(values(module.platform_api.secrets), values(module.game_server.secrets), values(module.migrate.secrets)) : startswith(v, "arn:")
    ])
    error_message = "every secret must be an ARN reference"
  }

  assert {
    condition     = endswith(module.platform_api.secrets["DB_PASSWORD"], ":password::")
    error_message = "the database password is the password key of the managed RDS secret"
  }
}

run "game_server_environment_follows_the_application_contract" {
  command = apply

  assert {
    condition = (
      module.game_server.environment["GAME_SERVER_PORT"] == "2567"
      && module.game_server.environment["AWS_REGION"] == var.region
      && startswith(module.game_server.environment["REDIS_URL"], "rediss://")
    )
    error_message = "the game-server environment must follow docker-compose.yml"
  }

  assert {
    condition = alltrue([
      for k in ["AWS_ENDPOINT_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "JWT_SECRET", "DATABASE_URL", "ASSETS_BUCKET"] :
      !contains(keys(module.game_server.environment), k)
    ])
    error_message = "the game-server must not receive what it does not read"
  }

  assert {
    condition     = !contains(keys(module.game_server.environment), "GAME_SERVER_MAX_MATCHES")
    error_message = "GAME_SERVER_MAX_MATCHES is left to the application's own default until a value is chosen"
  }
}

run "optional_sign_in_and_mail_are_off_by_default" {
  command = apply

  assert {
    condition = alltrue([
      for k in ["OAUTH_GITHUB_CLIENT_ID", "OAUTH_GOOGLE_CLIENT_ID", "EMAIL_SMTP_HOST", "EMAIL_SMTP_PORT", "EMAIL_SMTP_USER", "EMAIL_FROM"] :
      !contains(keys(module.platform_api.environment), k)
    ])
    error_message = "no optional variable is injected while its feature is off"
  }

  assert {
    condition = alltrue([
      for k in ["OAUTH_GITHUB_CLIENT_SECRET", "OAUTH_GOOGLE_CLIENT_SECRET", "EMAIL_SMTP_PASSWORD"] :
      !contains(keys(module.platform_api.secrets), k)
    ])
    error_message = "no optional secret is injected while its feature is off"
  }
}

run "enabling_mail_adds_all_five_settings_the_secret_and_the_smtp_egress" {
  command = apply

  variables {
    email_enabled   = true
    email_smtp_host = "smtp.example.com"
    email_smtp_port = 587
    email_smtp_user = "mailer"
    email_from      = "noreply@example.com"
  }

  assert {
    condition = (
      module.platform_api.environment["EMAIL_SMTP_HOST"] == "smtp.example.com"
      && module.platform_api.environment["EMAIL_SMTP_PORT"] == "587"
      && module.platform_api.environment["EMAIL_SMTP_USER"] == "mailer"
      && module.platform_api.environment["EMAIL_FROM"] == "noreply@example.com"
      && contains(keys(module.platform_api.secrets), "EMAIL_SMTP_PASSWORD")
    )
    error_message = "mail is all five settings or none"
  }

  assert {
    condition     = one(aws_vpc_security_group_egress_rule.platform_api_smtp).from_port == 587
    error_message = "the SMTP port must be opened for egress, and only then"
  }
}

run "enabling_mail_without_its_settings_is_refused" {
  command = plan

  variables {
    email_enabled = true
  }

  expect_failures = [var.email_enabled]
}

run "enabling_a_provider_without_its_client_id_is_refused" {
  command = plan

  variables {
    oauth_github_enabled   = true
    oauth_github_client_id = null
  }

  expect_failures = [var.oauth_github_enabled]
}

run "enabling_a_provider_adds_its_client_id_and_secret" {
  command = apply

  variables {
    oauth_github_enabled   = true
    oauth_github_client_id = "Iv1.abc123"
  }

  assert {
    condition     = module.platform_api.environment["OAUTH_GITHUB_CLIENT_ID"] == "Iv1.abc123" && contains(keys(module.platform_api.secrets), "OAUTH_GITHUB_CLIENT_SECRET")
    error_message = "an enabled provider needs its client id and its secret"
  }

  assert {
    condition     = !contains(keys(module.platform_api.environment), "OAUTH_GOOGLE_CLIENT_ID")
    error_message = "the other provider stays off"
  }
}

run "compute_outputs_are_the_contract_toward_infra_05" {
  command = apply

  assert {
    condition = (
      output.cluster_name == "eldritch-prod"
      && output.platform_api_service_name == "eldritch-prod-platform-api"
      && output.game_server_service_name == "eldritch-prod-game-server"
      && output.platform_api_task_family == "eldritch-prod-platform-api"
      && output.game_server_task_family == "eldritch-prod-game-server"
      && output.migrate_task_family == "eldritch-prod-migrate"
    )
    error_message = "the cluster, services and families are part of the contract"
  }

  assert {
    condition     = toset(output.migrate_task_subnet_ids) == toset(output.public_subnet_ids) && output.migrate_task_security_group_id == output.platform_api_security_group_id
    error_message = "the migrate task runs in the same network position as platform-api"
  }
}
