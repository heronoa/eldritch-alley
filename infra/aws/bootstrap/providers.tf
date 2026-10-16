# No `profile` argument here: locally the identity comes from the AWS_PROFILE
# environment variable, in CI from the GitHub OIDC role. allowed_account_ids
# makes Terraform refuse to run against the wrong account.
provider "aws" {
  region              = var.region
  allowed_account_ids = var.allowed_account_ids

  default_tags {
    tags = {
      Project     = "eldritch-alley"
      Environment = "bootstrap"
      ManagedBy   = "terraform"
      Repository  = var.github_repository
    }
  }
}
