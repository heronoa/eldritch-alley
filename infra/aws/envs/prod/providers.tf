# No `profile` argument: locally the identity comes from AWS_PROFILE, in CI from
# the GitHub OIDC role. allowed_account_ids makes Terraform refuse the wrong account.
provider "aws" {
  region              = var.region
  allowed_account_ids = var.allowed_account_ids

  default_tags {
    tags = {
      Project     = "eldritch-alley"
      Environment = "prod"
      ManagedBy   = "terraform"
      Repository  = var.github_repository
    }
  }
}
