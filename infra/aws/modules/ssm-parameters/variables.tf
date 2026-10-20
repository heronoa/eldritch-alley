variable "prefix" {
  description = "Parameter path prefix, for example /eldritch-alley/prod"
  type        = string
}

variable "parameters" {
  description = "Parameters to create, keyed by name. Terraform writes a placeholder; the real value is put by hand."
  type = map(object({
    type        = string
    description = string
  }))

  validation {
    condition     = alltrue([for p in var.parameters : contains(["String", "SecureString"], p.type)])
    error_message = "type must be String or SecureString"
  }
}
