# These exact names are read by infra/aws/README.md's runbook (infra-06) and
# by the GitHub repository/environment variables that infra-ci.yml,
# infra-apply.yml and deploy.yml consume.

output "state_bucket_name" {
  description = "S3 bucket holding bootstrap/terraform.tfstate and prod/terraform.tfstate"
  value       = aws_s3_bucket.state.bucket
}

output "plan_role_arn" {
  description = "Assumed by GitHub Actions on pull requests touching infra/**"
  value       = aws_iam_role.plan.arn
}

output "apply_role_arn" {
  description = "Assumed by infra-apply.yml, environment prod"
  value       = aws_iam_role.apply.arn
}

output "deploy_role_arn" {
  description = "Assumed by deploy.yml, environment prod"
  value       = aws_iam_role.deploy.arn
}
