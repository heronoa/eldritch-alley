variable "name" {
  description = "Cluster name, also the segment of the log group paths"
  type        = string
}

variable "service_names" {
  description = "One log group is created per name (the services and the one-off task families)"
  type        = set(string)
}

variable "container_insights" {
  description = "Container Insights bills per metric, so it is off by default"
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "Retention of every log group"
  type        = number
  default     = 14
}
