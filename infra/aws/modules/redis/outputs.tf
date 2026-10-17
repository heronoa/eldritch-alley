output "primary_endpoint_address" {
  description = "Primary endpoint. The rediss:// URL is assembled from this and the port in infra-04."
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "port" {
  description = "Port"
  value       = aws_elasticache_replication_group.this.port
}

output "security_group_id" {
  description = "Security group of the cache"
  value       = aws_security_group.this.id
}

output "allowed_security_group_ids" {
  description = "Security groups admitted on 6379 (the wiring, readable by the caller's tests)"
  value       = var.allowed_security_group_ids
}

output "subnet_ids" {
  description = "Subnets of the subnet group (the wiring, readable by the caller's tests)"
  value       = var.subnet_ids
}
