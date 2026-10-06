variable "name" {
  description = "Prefix for resource names and tags"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC"
  type        = string
}

variable "public_subnet_cidr" {
  description = "CIDR block of the single public subnet"
  type        = string
}

variable "availability_zone" {
  description = "Availability zone of the public subnet"
  type        = string
}
