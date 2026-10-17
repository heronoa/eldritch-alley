variable "name" {
  description = "Prefix for resource names and tags"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC. Must not overlap the stg VPC (10.0.0.0/16)."
  type        = string
  default     = "10.1.0.0/16"
}

variable "region" {
  description = "AWS region, used to build the S3 gateway endpoint service name"
  type        = string
}
