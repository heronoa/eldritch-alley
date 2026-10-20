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
    TURNSTILE_SECRET        = { type = "SecureString", description = "Cloudflare Turnstile secret" }

    OAUTH_GITHUB_CLIENT_SECRET = { type = "SecureString", description = "GitHub OAuth app client secret" }
    OAUTH_GOOGLE_CLIENT_SECRET = { type = "SecureString", description = "Google OAuth app client secret" }
    EMAIL_SMTP_PASSWORD        = { type = "SecureString", description = "SMTP password, used only when email is enabled" }
  }
}

variable "multi_az" {
  description = "Run the database with a standby in a second zone"
  type        = bool
  default     = false
}

variable "db_name" {
  description = "Initial database name (from docker-compose.yml). Changing it later recreates the instance."
  type        = string
  default     = "eldritch_alley"
}

variable "db_username" {
  description = "Database master user name (from docker-compose.yml)"
  type        = string
  default     = "eldritch"
}

variable "db_allocated_storage" {
  description = "Database storage in GB, no autoscaling"
  type        = number
  default     = 20
}

variable "api_hostname" {
  description = "Public hostname of platform-api (a first-level name, never a.b.heronoa.com.br)"
  type        = string
  default     = "eldritch-aws-api.heronoa.com.br"
}

variable "game_hostname" {
  description = "Public hostname of the game-server"
  type        = string
  default     = "eldritch-aws-game.heronoa.com.br"
}

variable "manage_cloudflare_dns" {
  description = "Create the Cloudflare records here. When false, create them by hand (the validation_records output lists the certificate ones)."
  type        = bool
  default     = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone id of heronoa.com.br. Required while manage_cloudflare_dns is true."
  type        = string
  default     = null

  validation {
    condition     = !var.manage_cloudflare_dns || var.cloudflare_zone_id != null
    error_message = "cloudflare_zone_id is required while manage_cloudflare_dns is true"
  }
}

variable "manage_zone_ssl_mode" {
  description = "Set the Cloudflare zone's SSL mode to Full (strict). Off by default: it is zone-wide and also changes every other hostname in the zone. Otherwise it is a manual runbook step."
  type        = bool
  default     = false
}

variable "waf_rate_limit" {
  description = "Requests allowed per client IP in the window. A placeholder start with no traffic data behind it."
  type        = number
  default     = 1000
}

variable "waf_rate_window_seconds" {
  description = "Evaluation window of the WAF rate rule (60, 120, 300 or 600)"
  type        = number
  default     = 300
}

variable "waf_rate_limit_action" {
  description = "block to refuse over-limit requests, count to only record them"
  type        = string
  default     = "block"
}

variable "game_server_health_check_path" {
  description = "HTTP path the ALB checks on the game-server. The game-server has no such route on develop yet (DT-69); this must be confirmed before the first rollout."
  type        = string
  default     = "/health"
}

# --- Compute ------------------------------------------------------------------

variable "services_enabled" {
  description = "False keeps both services at zero tasks, which a stack with empty repositories needs. Set true after the first image is pushed."
  type        = bool
  default     = false
}

variable "placeholder_image_tag" {
  description = "Tag the task definitions point at until the deploy workflow registers real revisions. Nothing pulls it while the services are at zero."
  type        = string
  default     = "sha-pending"
}

variable "cpu_architecture" {
  description = "X86_64 or ARM64. ARM64 is cheaper but needs arm64 image builds."
  type        = string
  default     = "X86_64"
}

variable "container_insights" {
  description = "Container Insights bills per metric, so it is off by default"
  type        = bool
  default     = false
}

variable "enable_ecs_exec" {
  description = "ECS Exec on both services, for a shell in a running task. Off by default."
  type        = bool
  default     = false
}

variable "migrate_command" {
  description = "Command of the one-off migrate task (the one docker-compose.yml runs)"
  type        = list(string)
  default     = ["node", "dist/migrate.js"]
}

variable "game_server_max_matches" {
  description = "GAME_SERVER_MAX_MATCHES. Null leaves the application's own default."
  type        = number
  default     = null
}

variable "client_origin" {
  description = "Browser origin of the client, the one origin the API allows with credentials"
  type        = string
  default     = "https://eldritch.heronoa.com.br"
}

variable "cookie_domain" {
  description = "COOKIE_DOMAIN. Null uses the API hostname itself, so the session cookie reaches only that host."
  type        = string
  default     = null
}

variable "oauth_github_enabled" {
  description = "Turn on GitHub sign-in. Register the OAuth app with the callback on the API hostname first."
  type        = bool
  default     = false

  validation {
    condition     = !var.oauth_github_enabled || var.oauth_github_client_id != null
    error_message = "oauth_github_client_id is required while oauth_github_enabled is true"
  }
}

variable "oauth_github_client_id" {
  description = "GitHub OAuth app client id (not a secret)"
  type        = string
  default     = null
}

variable "oauth_google_enabled" {
  description = "Turn on Google sign-in. Register the OAuth app with the callback on the API hostname first."
  type        = bool
  default     = false

  validation {
    condition     = !var.oauth_google_enabled || var.oauth_google_client_id != null
    error_message = "oauth_google_client_id is required while oauth_google_enabled is true"
  }
}

variable "oauth_google_client_id" {
  description = "Google OAuth app client id (not a secret)"
  type        = string
  default     = null
}

variable "email_enabled" {
  description = "Send mail. All five settings or none: with none, the platform logs each message instead of sending it."
  type        = bool
  default     = false

  validation {
    condition = !var.email_enabled || alltrue([
      var.email_smtp_host != null,
      var.email_smtp_port != null,
      var.email_smtp_user != null,
      var.email_from != null,
    ])
    error_message = "email_smtp_host, email_smtp_port, email_smtp_user and email_from are required while email_enabled is true"
  }
}

variable "email_smtp_host" {
  description = "SMTP host"
  type        = string
  default     = null
}

variable "email_smtp_port" {
  description = "SMTP port, also opened for egress while email is enabled"
  type        = number
  default     = null
}

variable "email_smtp_user" {
  description = "SMTP user"
  type        = string
  default     = null
}

variable "email_from" {
  description = "Sender address"
  type        = string
  default     = null
}
