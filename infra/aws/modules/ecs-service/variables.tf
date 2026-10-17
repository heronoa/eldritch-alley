variable "prefix" {
  description = "Stack prefix, for example eldritch-prod. Roles are <prefix>-<name>-execution and <prefix>-<name>-task."
  type        = string
}

variable "name" {
  description = "Service or task family name, for example platform-api"
  type        = string
}

variable "region" {
  description = "AWS region, for the log driver and the KMS service condition"
  type        = string
}

variable "cluster_arn" {
  description = "Cluster the service runs in"
  type        = string
}

variable "image" {
  description = "Container image with an immutable tag. A placeholder until the first deploy, never latest."
  type        = string

  validation {
    condition     = can(regex(":[^/]+$", var.image)) && !endswith(var.image, ":latest")
    error_message = "the image needs an explicit tag and it must not be latest"
  }
}

variable "container_port" {
  description = "Container port. Null for a task that listens on nothing, such as the migration."
  type        = number
  default     = null
}

variable "environment" {
  description = "Plain environment variables. Never a secret."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Container secrets: name to the ARN of an SSM parameter, or of a Secrets Manager secret with an optional JSON key suffix"
  type        = map(string)
  default     = {}
}

variable "ssm_parameter_arns" {
  description = "SSM parameters the execution role may read, and nothing else"
  type        = list(string)
  default     = []
}

variable "secrets_manager_arns" {
  description = "Secrets Manager secrets the execution role may read, and nothing else"
  type        = list(string)
  default     = []
}

variable "ecr_repository_arn" {
  description = "Repository the execution role may pull from"
  type        = string
}

variable "log_group_name" {
  description = "Log group the container writes to"
  type        = string
}

variable "log_group_arn" {
  description = "ARN of that log group"
  type        = string
}

variable "security_group_id" {
  description = "Security group of the tasks, created elsewhere. Its rules belong to the stack."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets of the tasks (public: there is no NAT)"
  type        = list(string)
}

variable "target_group_arn" {
  description = "Target group to register with. Null for a task behind no load balancer."
  type        = string
  default     = null
}

variable "create_service" {
  description = "False for a one-off task family that is only run, never kept running"
  type        = bool
  default     = true
}

variable "services_enabled" {
  description = "False starts the service with no tasks, which is what a stack with empty repositories needs"
  type        = bool
  default     = false
}

variable "desired_count" {
  description = "Tasks to run once the service is enabled"
  type        = number
  default     = 1
}

variable "cpu" {
  description = "CPU units"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Memory in MiB"
  type        = number
  default     = 512
}

variable "cpu_architecture" {
  description = "X86_64 or ARM64. ARM64 needs arm64 image builds."
  type        = string
  default     = "X86_64"
}

variable "stop_timeout" {
  description = "Seconds the container has to stop after SIGTERM (Fargate allows up to 120). Null keeps the default."
  type        = number
  default     = null
}

variable "command" {
  description = "Overrides the image's command. Null keeps it."
  type        = list(string)
  default     = null
}

variable "task_role_policy_json" {
  description = "Policy document of the task role. Null gives the role no policy."
  type        = string
  default     = null
}

variable "enable_execute_command" {
  description = "ECS Exec, for a shell in a running task. Off by default."
  type        = bool
  default     = false
}

variable "health_check_grace_period_seconds" {
  description = "Time a new task is given to pass the load balancer's health check"
  type        = number
  default     = 60
}
