variable "name" {
  description = "Name of the main queue. The dead-letter queue is named <name>-dlq."
  type        = string
}

variable "visibility_timeout_seconds" {
  description = "Must exceed the consumer's processing time. 30 is the AWS default, a placeholder until the consumer exists."
  type        = number
  default     = 30
}

variable "max_receive_count" {
  description = "Receives before a message moves to the dead-letter queue"
  type        = number
  default     = 5
}
