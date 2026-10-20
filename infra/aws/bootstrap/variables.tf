variable "region" {
  description = "AWS region for the state bucket and the IAM OIDC provider (IAM itself is global, but the provider block needs one)"
  type        = string
  default     = "us-east-1"
}

variable "allowed_account_ids" {
  description = "AWS account ids this stack is allowed to run against. Terraform refuses to apply against any other account."
  type        = list(string)
  default     = ["510915414773"]
}

variable "github_repository" {
  description = "GitHub repository slug (owner/repo) trusted by the OIDC roles. Must match the real remote before any apply."
  type        = string
  default     = "heronoa/eldritch-alley"
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for Terraform state. Holds bootstrap/terraform.tfstate and prod/terraform.tfstate. Not per-environment: it is account-level tooling."
  type        = string
  default     = "eldritch-tfstate-510915414773"
}
