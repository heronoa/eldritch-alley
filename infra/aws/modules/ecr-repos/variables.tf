variable "repository_names" {
  description = "ECR repository names, for example eldritch-alley/prod/game-server"
  type        = set(string)
}

variable "destroyable" {
  description = "When true, repositories are deleted even if they still hold images"
  type        = bool
  default     = false
}
