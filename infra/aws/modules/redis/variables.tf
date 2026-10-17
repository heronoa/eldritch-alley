variable "name" {
  description = "Replication group id and prefix of its related resources"
  type        = string
}

variable "vpc_id" {
  description = "VPC the security group belongs to"
  type        = string
}

variable "subnet_ids" {
  description = "Isolated subnets for the subnet group"
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to connect on 6379. Nothing else can reach the cache."
  type        = list(string)
}

variable "node_type" {
  description = "Node type"
  type        = string
  default     = "cache.t4g.micro"
}

variable "engine_version" {
  description = "Redis version"
  type        = string
  default     = "7.1"
}

variable "parameter_group_family" {
  description = "Parameter group family, must match engine_version"
  type        = string
  default     = "redis7"
}
