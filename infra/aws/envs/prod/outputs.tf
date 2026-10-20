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

output "api_hostname" {
  description = "Public hostname of platform-api"
  value       = var.api_hostname
}

output "game_hostname" {
  description = "Public hostname of the game-server"
  value       = var.game_hostname
}

output "alb_dns_name" {
  description = "Load balancer DNS name, the target of the proxied CNAMEs"
  value       = module.alb.alb_dns_name
}

output "alb_security_group_id" {
  description = "The load balancer's security group, which the task groups admit ingress from"
  value       = module.alb.alb_security_group_id
}

output "target_group_arns" {
  description = "Target group ARNs keyed by service name"
  value       = module.alb.target_group_arns
}

output "waf_web_acl_arn" {
  description = "WAF web ACL ARN"
  value       = module.waf.web_acl_arn
}

output "cloudflare_validation_records" {
  description = "The certificate validation records. When manage_cloudflare_dns is false, create these by hand, DNS-only."
  value       = module.edge_dns.validation_records
}

# --- Compute: what the deploy workflow reads ---------------------------------

output "cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs_cluster.cluster_name
}

output "platform_api_service_name" {
  description = "platform-api service name"
  value       = module.platform_api.service_name
}

output "game_server_service_name" {
  description = "game-server service name"
  value       = module.game_server.service_name
}

output "platform_api_task_family" {
  description = "platform-api task definition family"
  value       = module.platform_api.task_definition_family
}

output "game_server_task_family" {
  description = "game-server task definition family"
  value       = module.game_server.task_definition_family
}

output "migrate_task_family" {
  description = "Task definition family of the one-off migration"
  value       = module.migrate.task_definition_family
}

output "migrate_task_subnet_ids" {
  description = "Subnets to run the migrate task in (public: there is no NAT)"
  value       = module.vpc.public_subnet_ids
}

output "migrate_task_security_group_id" {
  description = "Security group to run the migrate task with (the platform-api one)"
  value       = aws_security_group.platform_api.id
}
