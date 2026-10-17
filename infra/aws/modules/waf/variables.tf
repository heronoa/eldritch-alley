variable "name" {
  description = "Name of the web ACL"
  type        = string
}

variable "alb_arn" {
  description = "Load balancer the web ACL protects"
  type        = string
}

variable "rate_limit" {
  description = "Requests allowed per client IP in the window. A placeholder start, not a measurement."
  type        = number
  default     = 1000

  validation {
    condition     = var.rate_limit >= 10
    error_message = "WAF rate-based rules need a limit of at least 10"
  }
}

variable "rate_window_seconds" {
  description = "Evaluation window of the rate rule"
  type        = number
  default     = 300

  validation {
    condition     = contains([60, 120, 300, 600], var.rate_window_seconds)
    error_message = "the window must be 60, 120, 300 or 600 seconds"
  }
}

variable "rate_limit_action" {
  description = "block to refuse over-limit requests, count to only record them"
  type        = string
  default     = "block"

  validation {
    condition     = contains(["block", "count"], var.rate_limit_action)
    error_message = "rate_limit_action must be block or count"
  }
}
