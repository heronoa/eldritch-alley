# No credentials, no network access. Run from infra/aws/modules/rds/ with `terraform test`.
#
# The managed master secret (`master_user_secret`) is a computed block, so the
# instance is overridden with a value for it; without that the output could
# not be asserted. The mock provider never touches AWS.

mock_provider "aws" {}

override_resource {
  target = aws_db_instance.this
  values = {
    address = "mock.db.example"
    master_user_secret = [{
      kms_key_id    = "alias/aws/secretsmanager"
      secret_arn    = "arn:aws:secretsmanager:us-east-1:123456789012:secret:rds!db-mock"
      secret_status = "active"
    }]
  }
}

variables {
  name                       = "eldritch-prod"
  vpc_id                     = "vpc-0abc"
  subnet_ids                 = ["subnet-0aaa", "subnet-0bbb"]
  allowed_security_group_ids = ["sg-0aaa"]
  db_name                    = "eldritch_alley"
  db_username                = "eldritch"
  final_snapshot_identifier  = "eldritch-prod-final"
}

run "instance_is_private_encrypted_and_in_the_given_subnets" {
  command = plan

  assert {
    condition     = aws_db_instance.this.publicly_accessible == false
    error_message = "the database must not be publicly accessible"
  }

  assert {
    condition     = aws_db_subnet_group.this.subnet_ids == toset(["subnet-0aaa", "subnet-0bbb"])
    error_message = "the subnet group must use exactly the subnets given"
  }

  assert {
    condition     = aws_db_instance.this.db_subnet_group_name == aws_db_subnet_group.this.name
    error_message = "the instance must use that subnet group"
  }

  assert {
    condition     = aws_db_instance.this.storage_encrypted == true && aws_db_instance.this.storage_type == "gp3"
    error_message = "storage must be encrypted gp3"
  }
}

run "defaults_match_the_decisions_in_the_plan" {
  command = plan

  assert {
    condition     = aws_db_instance.this.engine == "postgres" && aws_db_instance.this.engine_version == "17"
    error_message = "engine must be PostgreSQL pinned to major 17"
  }

  assert {
    condition     = aws_db_instance.this.instance_class == "db.t4g.micro" && aws_db_instance.this.allocated_storage == 20
    error_message = "defaults are db.t4g.micro with 20 GB"
  }

  assert {
    condition     = aws_db_instance.this.db_name == "eldritch_alley" && aws_db_instance.this.username == "eldritch"
    error_message = "database name and master user come from the variables"
  }

  assert {
    condition     = aws_db_instance.this.multi_az == false && aws_db_instance.this.backup_retention_period == 7
    error_message = "defaults are single-AZ with 7-day backups"
  }

  assert {
    condition     = aws_db_instance.this.max_allocated_storage == null
    error_message = "storage autoscaling must stay off"
  }
}

run "multi_az_follows_its_variable" {
  command = plan

  variables {
    multi_az = true
  }

  assert {
    condition     = aws_db_instance.this.multi_az == true
    error_message = "multi_az must follow the variable"
  }
}

run "master_password_is_managed_by_rds_and_never_set_here" {
  command = plan

  assert {
    condition     = aws_db_instance.this.manage_master_user_password == true
    error_message = "RDS must manage the master password"
  }

  assert {
    condition     = aws_db_instance.this.password == null
    error_message = "no password argument may be set, or it would land in state"
  }
}

run "parameter_group_requires_tls" {
  command = plan

  assert {
    condition     = aws_db_parameter_group.this.family == "postgres17"
    error_message = "the parameter group family must be postgres17"
  }

  assert {
    condition     = one([for p in aws_db_parameter_group.this.parameter : p.value if p.name == "rds.force_ssl"]) == "1"
    error_message = "rds.force_ssl must be 1"
  }

  assert {
    condition     = aws_db_instance.this.parameter_group_name == aws_db_parameter_group.this.name
    error_message = "the instance must use that parameter group"
  }
}

run "teardown_protection_is_on_by_default" {
  command = plan

  assert {
    condition     = aws_db_instance.this.deletion_protection == true && aws_db_instance.this.skip_final_snapshot == false
    error_message = "protection must be on and the final snapshot kept when destroyable is false"
  }

  assert {
    condition     = aws_db_instance.this.final_snapshot_identifier == "eldritch-prod-final"
    error_message = "the final snapshot must use the fixed identifier"
  }
}

run "destroyable_lifts_protection_and_skips_the_snapshot" {
  command = plan

  variables {
    destroyable = true
  }

  assert {
    condition     = aws_db_instance.this.deletion_protection == false && aws_db_instance.this.skip_final_snapshot == true
    error_message = "protection must be off and the final snapshot skipped when destroyable is true"
  }

  assert {
    condition     = aws_db_instance.this.final_snapshot_identifier == null
    error_message = "no final snapshot identifier when skipping the snapshot"
  }
}

run "security_group_admits_only_the_allowed_groups_on_5432" {
  command = apply

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.from_security_group) == 1
    error_message = "one ingress rule per allowed security group"
  }

  assert {
    condition = alltrue([
      for r in aws_vpc_security_group_ingress_rule.from_security_group :
      r.from_port == 5432 && r.to_port == 5432 && r.ip_protocol == "tcp"
    ])
    error_message = "ingress must be TCP 5432 only"
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.from_security_group[0].referenced_security_group_id == "sg-0aaa"
    error_message = "the source must be the allowed security group"
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

run "outputs_expose_the_connection_pieces_and_never_a_password" {
  command = apply

  assert {
    condition     = output.endpoint == "mock.db.example" && output.port == 5432
    error_message = "endpoint and port must be exposed"
  }

  assert {
    condition     = output.db_name == "eldritch_alley" && output.username == "eldritch"
    error_message = "database name and username must be exposed"
  }

  assert {
    condition     = startswith(output.master_secret_arn, "arn:aws:secretsmanager:")
    error_message = "the managed secret ARN must be exposed"
  }

  assert {
    condition     = output.allowed_security_group_ids == tolist(["sg-0aaa"]) && output.subnet_ids == tolist(["subnet-0aaa", "subnet-0bbb"])
    error_message = "the wiring must be readable from the outputs"
  }
}
