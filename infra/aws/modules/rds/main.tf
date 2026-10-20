resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name   = var.name
  family = var.parameter_group_family

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

# No inline rules and no egress: the database initiates nothing. Ingress rules
# are separate resources so this group never fights with inline blocks.
resource "aws_security_group" "this" {
  name        = "${var.name}-db"
  description = "PostgreSQL: ingress only from the allowed service security groups"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "from_security_group" {
  count = length(var.allowed_security_group_ids)

  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = var.allowed_security_group_ids[count.index]
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_db_instance" "this" {
  identifier     = var.name
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class
  port           = 5432

  allocated_storage = var.allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  # RDS generates the password and keeps it in a Secrets Manager secret. No
  # `password` argument, so it never reaches the state.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false
  multi_az               = var.multi_az

  backup_retention_period = var.backup_retention_days
  copy_tags_to_snapshot   = true

  deletion_protection       = !var.destroyable
  skip_final_snapshot       = var.destroyable
  final_snapshot_identifier = var.destroyable ? null : var.final_snapshot_identifier

  lifecycle {
    precondition {
      condition     = var.destroyable || var.final_snapshot_identifier != null
      error_message = "final_snapshot_identifier is required unless destroyable is true"
    }
  }
}
