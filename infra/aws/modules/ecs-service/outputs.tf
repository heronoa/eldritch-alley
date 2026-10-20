output "service_name" {
  description = "Service name. Null for a one-off task family."
  value       = one(aws_ecs_service.this[*].name)
}

output "task_definition_family" {
  description = "Task definition family, which the deploy workflow renders new revisions from"
  value       = aws_ecs_task_definition.this.family
}

output "execution_role_arn" {
  description = "Execution role ARN, passed by the deploy role"
  value       = aws_iam_role.execution.arn
}

output "task_role_arn" {
  description = "Task role ARN, passed by the deploy role"
  value       = aws_iam_role.task.arn
}

output "desired_count" {
  description = "Tasks the service is set to run. Null for a one-off task family."
  value       = one(aws_ecs_service.this[*].desired_count)
}

output "environment" {
  description = "The plain environment given to the container (never a secret)"
  value       = var.environment
}

output "secrets" {
  description = "The secret references given to the container, by name"
  value       = var.secrets
}
