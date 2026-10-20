variable "name" {
  description = "Globally unique bucket name. The caller includes the account id."
  type        = string
}

variable "cors_allowed_origin" {
  description = "The single browser origin allowed to use presigned URLs"
  type        = string
  default     = "https://eldritch.heronoa.com.br"
}

variable "destroyable" {
  description = "When true, the bucket is deleted even if it still holds objects"
  type        = bool
  default     = false
}
