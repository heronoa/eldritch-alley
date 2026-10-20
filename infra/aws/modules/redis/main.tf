resource "aws_elasticache_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_elasticache_parameter_group" "this" {
  name   = var.name
  family = var.parameter_group_family
}

# No inline rules and no egress: the cache initiates nothing. Ingress rules are
# separate resources so this group never fights with inline blocks.
resource "aws_security_group" "this" {
  name        = "${var.name}-redis"
  description = "Redis: ingress only from the allowed service security groups"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "from_security_group" {
  count = length(var.allowed_security_group_ids)

  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = var.allowed_security_group_ids[count.index]
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
}

# One node, no auth token: access is limited by the security group only (a known
# limitation, listed in the README in infra-06). Clients must use TLS (rediss://).
resource "aws_elasticache_replication_group" "this" {
  replication_group_id = var.name
  description          = "${var.name} Redis, single node"

  engine         = "redis"
  engine_version = var.engine_version
  node_type      = var.node_type
  port           = 6379

  num_cache_clusters         = 1
  automatic_failover_enabled = false

  subnet_group_name    = aws_elasticache_subnet_group.this.name
  security_group_ids   = [aws_security_group.this.id]
  parameter_group_name = aws_elasticache_parameter_group.this.name

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}
