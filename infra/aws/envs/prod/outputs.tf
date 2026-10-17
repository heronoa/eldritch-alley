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
