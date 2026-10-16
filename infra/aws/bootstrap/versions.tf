terraform {
  required_version = ">= 1.15.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Local state on the first apply. Heron adds backend.tf once state_bucket_name
  # exists, pointing this stack at itself under the "bootstrap/" key, then commits it.
}
