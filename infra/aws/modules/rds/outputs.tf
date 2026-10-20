# Never a password: the master password lives only in the managed secret.

output "endpoint" {
  description = "Instance address"
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Instance port"
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Initial database name"
  value       = aws_db_instance.this.db_name
}

output "username" {
  description = "Master user name"
  value       = aws_db_instance.this.username
}

output "master_secret_arn" {
  description = "ARN of the Secrets Manager secret RDS keeps the master password in (JSON with a password key)"
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "security_group_id" {
  description = "Security group of the instance"
  value       = aws_security_group.this.id
}

output "allowed_security_group_ids" {
  description = "Security groups admitted on 5432 (the wiring, readable by the caller's tests)"
  value       = var.allowed_security_group_ids
}

output "subnet_ids" {
  description = "Subnets of the subnet group (the wiring, readable by the caller's tests)"
  value       = var.subnet_ids
}
