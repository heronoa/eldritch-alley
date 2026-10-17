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

# The API token comes from the CLOUDFLARE_API_TOKEN environment variable (locally) or
# the `prod` GitHub environment secret of the same name (CI). Never in code or state.
provider "cloudflare" {}
