# No credentials, no network access. Run from infra/aws/modules/redis/ with `terraform test`.
# The mock provider never touches AWS.

mock_provider "aws" {}

override_resource {
  target = aws_elasticache_replication_group.this
  values = {
    primary_endpoint_address = "mock.cache.example"
  }
}

variables {
  name                       = "eldritch-prod"
  vpc_id                     = "vpc-0abc"
  subnet_ids                 = ["subnet-0aaa", "subnet-0bbb"]
  allowed_security_group_ids = ["sg-0aaa", "sg-0bbb"]
}

run "one_node_encrypted_in_transit_and_at_rest_with_no_auth_token" {
  command = plan

  assert {
    condition     = aws_elasticache_replication_group.this.num_cache_clusters == 1
    error_message = "exactly one node"
  }

  assert {
    condition     = tostring(aws_elasticache_replication_group.this.automatic_failover_enabled) == "false"
    error_message = "automatic failover must be off with a single node"
  }

  assert {
    condition = (
      tostring(aws_elasticache_replication_group.this.at_rest_encryption_enabled) == "true"
      && tostring(aws_elasticache_replication_group.this.transit_encryption_enabled) == "true"
    )
    error_message = "encryption at rest and in transit must be on"
  }

  assert {
    condition     = aws_elasticache_replication_group.this.auth_token == null
    error_message = "no auth token in this delivery (known limitation, access is by security group)"
  }
}

run "defaults_match_the_decisions_in_the_plan" {
  command = plan

  assert {
    condition     = aws_elasticache_replication_group.this.engine == "redis" && aws_elasticache_replication_group.this.engine_version == "7.1"
    error_message = "engine must be Redis 7.1"
  }

  assert {
    condition     = aws_elasticache_replication_group.this.node_type == "cache.t4g.micro" && aws_elasticache_replication_group.this.port == 6379
    error_message = "defaults are cache.t4g.micro on port 6379"
  }

  assert {
    condition     = aws_elasticache_parameter_group.this.family == "redis7"
    error_message = "the parameter group family must be redis7"
  }
}

run "node_lives_in_the_given_subnets_and_group" {
  command = plan

  assert {
    condition     = aws_elasticache_subnet_group.this.subnet_ids == toset(["subnet-0aaa", "subnet-0bbb"])
    error_message = "the subnet group must use exactly the subnets given"
  }

  assert {
    condition     = aws_elasticache_replication_group.this.subnet_group_name == aws_elasticache_subnet_group.this.name
    error_message = "the replication group must use that subnet group"
  }
}

run "security_group_admits_only_the_allowed_groups_on_6379" {
  command = apply

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.from_security_group) == 2
    error_message = "one ingress rule per allowed security group"
  }

  assert {
    condition = alltrue([
      for r in aws_vpc_security_group_ingress_rule.from_security_group :
      r.from_port == 6379 && r.to_port == 6379 && r.ip_protocol == "tcp"
    ])
    error_message = "ingress must be TCP 6379 only"
  }

  assert {
    condition = alltrue([
      for r in aws_vpc_security_group_ingress_rule.from_security_group :
      r.cidr_ipv4 == null && r.cidr_ipv6 == null
    ])
    error_message = "no CIDR source is allowed, so never 0.0.0.0/0"
  }

  assert {
    condition     = length(aws_security_group.this.ingress) == 0 && length(aws_security_group.this.egress) == 0
    error_message = "the group must carry no inline rules, and no egress at all"
  }
}

run "outputs_expose_the_endpoint_and_the_wiring" {
  command = apply

  assert {
    condition     = output.primary_endpoint_address == "mock.cache.example" && output.port == 6379
    error_message = "endpoint and port must be exposed"
  }

  assert {
    condition     = output.allowed_security_group_ids == tolist(["sg-0aaa", "sg-0bbb"]) && output.subnet_ids == tolist(["subnet-0aaa", "subnet-0bbb"])
    error_message = "the wiring must be readable from the outputs"
  }
}
