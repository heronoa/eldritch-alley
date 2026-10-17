output "cluster_name" {
  description = "Cluster name"
  value       = aws_ecs_cluster.this.name
}

output "cluster_arn" {
  description = "Cluster ARN"
  value       = aws_ecs_cluster.this.arn
}

output "log_group_names" {
  description = "Log group names keyed by service name"
  value       = { for k, g in aws_cloudwatch_log_group.service : k => g.name }
}

output "log_group_arns" {
  description = "Log group ARNs keyed by service name"
  value       = { for k, g in aws_cloudwatch_log_group.service : k => g.arn }
}
