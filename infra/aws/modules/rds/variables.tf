variable "name" {
  description = "Name of the instance and prefix of its related resources"
  type        = string
}

variable "vpc_id" {
  description = "VPC the security group belongs to"
  type        = string
}

variable "subnet_ids" {
  description = "Isolated subnets for the subnet group (at least two availability zones)"
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to connect on 5432. Nothing else can reach the database."
  type        = list(string)
}

variable "db_name" {
  description = "Initial database name. Changing it later recreates the instance."
  type        = string
}

variable "db_username" {
  description = "Master user name. The password is generated and kept by RDS in Secrets Manager."
  type        = string
}

variable "instance_class" {
  description = "Instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Storage in GB (gp3 minimum for PostgreSQL is 20). No storage autoscaling."
  type        = number
  default     = 20
}

variable "engine_version" {
  description = "PostgreSQL version. A major only, so AWS picks its default minor."
  type        = string
  default     = "17"
}

variable "parameter_group_family" {
  description = "Parameter group family, must match engine_version"
  type        = string
  default     = "postgres17"
}

variable "multi_az" {
  description = "Run a standby in a second zone"
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Automated backup retention"
  type        = number
  default     = 7
}

variable "destroyable" {
  description = "When true: no deletion protection and no final snapshot, so the instance can be torn down"
  type        = bool
  default     = false
}

variable "final_snapshot_identifier" {
  description = "Fixed identifier of the snapshot taken on destroy. Required unless destroyable is true."
  type        = string
  default     = null
}
