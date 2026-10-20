variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "allowed_account_ids" {
  description = "AWS account ids this stack is allowed to run against"
  type        = list(string)
  default     = ["510915414773"]
}

variable "github_repository" {
  description = "GitHub repository slug (owner/repo), used for the Repository tag"
  type        = string
  default     = "heronoa/eldritch-alley"
}

variable "destroyable" {
  description = "When true, protections that block teardown are lifted (S3 force_destroy, ECR force_delete). Keep false except for a deliberate teardown."
  type        = bool
  default     = false
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC"
  type        = string
  default     = "10.1.0.0/16"
}

variable "assets_cors_origin" {
  description = "Browser origin allowed to use presigned URLs on the assets bucket"
  type        = string
  default     = "https://eldritch.heronoa.com.br"
}

variable "visibility_timeout_seconds" {
  description = "Visibility timeout of the match-ended queue. Placeholder until the consumer exists."
  type        = number
  default     = 30
}

variable "ssm_parameters" {
  description = "Application parameters created with a placeholder value. Add one entry per parameter once its name is defined."
  type = map(object({
    type        = string
    description = string
  }))
  default = {
    SESSION_SECRET          = { type = "SecureString", description = "platform-api session signing secret" }
    GAME_TICKET_PRIVATE_KEY = { type = "SecureString", description = "Ed25519 private key that signs game tickets" }
    GAME_TICKET_PUBLIC_KEY  = { type = "SecureString", description = "Ed25519 public key that verifies game tickets" }
    JWT_SECRET              = { type = "SecureString", description = "Shared JWT secret, only until asymmetric tickets land" }
    TURNSTILE_SECRET        = { type = "SecureString", description = "Cloudflare Turnstile secret" }
  }
}
