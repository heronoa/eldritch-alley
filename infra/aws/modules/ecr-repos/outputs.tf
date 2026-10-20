output "repository_urls" {
  description = "Repository URLs keyed by repository name"
  value       = { for k, r in aws_ecr_repository.this : k => r.repository_url }
}

output "repository_arns" {
  description = "Repository ARNs keyed by repository name"
  value       = { for k, r in aws_ecr_repository.this : k => r.arn }
}
