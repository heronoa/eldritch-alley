# Read by infra-03 and infra-04 as module references inside this same stack.

output "vpc_id" {
  description = "VPC id"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet ids (ALB and Fargate tasks)"
  value       = module.vpc.public_subnet_ids
}

output "isolated_subnet_ids" {
  description = "Isolated subnet ids (RDS and ElastiCache)"
  value       = module.vpc.isolated_subnet_ids
}

output "repository_urls" {
  description = "ECR repository URLs keyed by name"
  value       = module.ecr.repository_urls
}

output "repository_arns" {
  description = "ECR repository ARNs keyed by name"
  value       = module.ecr.repository_arns
}

output "assets_bucket_name" {
  description = "Assets bucket name"
  value       = module.assets_bucket.bucket_name
}

output "assets_bucket_arn" {
  description = "Assets bucket ARN"
  value       = module.assets_bucket.bucket_arn
}

output "match_ended_queue_url" {
  description = "match-ended queue URL"
  value       = module.match_ended_queue.queue_url
}

output "match_ended_queue_arn" {
  description = "match-ended queue ARN"
  value       = module.match_ended_queue.queue_arn
}

output "match_ended_dlq_arn" {
  description = "match-ended dead-letter queue ARN"
  value       = module.match_ended_queue.dlq_arn
}

output "ssm_prefix" {
  description = "SSM parameter path prefix"
  value       = module.ssm_parameters.prefix
}

output "ssm_parameter_arns" {
  description = "SSM parameter ARNs keyed by name"
  value       = module.ssm_parameters.parameter_arns
}

output "db_endpoint" {
  description = "Database address"
  value       = module.rds.endpoint
}

output "db_port" {
  description = "Database port"
  value       = module.rds.port
}

output "db_name" {
  description = "Database name"
  value       = module.rds.db_name
}

output "db_username" {
  description = "Database master user name"
  value       = module.rds.username
}

output "db_master_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the database master password"
  value       = module.rds.master_secret_arn
}

output "redis_endpoint" {
  description = "Redis primary endpoint"
  value       = module.redis.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = module.redis.port
}

output "platform_api_security_group_id" {
  description = "Security group for platform-api and migrate tasks"
  value       = aws_security_group.platform_api.id
}

output "game_server_security_group_id" {
  description = "Security group for game-server tasks"
  value       = aws_security_group.game_server.id
}
