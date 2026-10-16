output "repository_url" {
  description = "Repository URL without a tag, for example <account>.dkr.ecr.<region>.amazonaws.com/<name>"
  value       = aws_ecr_repository.this.repository_url
}
