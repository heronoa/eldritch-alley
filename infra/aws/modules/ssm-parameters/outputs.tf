output "prefix" {
  description = "Parameter path prefix"
  value       = var.prefix
}

output "parameter_arns" {
  description = "Parameter ARNs keyed by name"
  value       = { for k, p in aws_ssm_parameter.this : k => p.arn }
}
