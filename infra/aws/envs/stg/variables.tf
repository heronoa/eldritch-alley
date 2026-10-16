variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Named AWS CLI profile of the Terraform identity (never the root user)"
  type        = string
  default     = "eldritch-stg"
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block of the public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "availability_zone" {
  description = "Availability zone of the public subnet"
  type        = string
  default     = "us-east-1a"
}

variable "instance_type" {
  description = "EC2 instance type (arm64)"
  type        = string
  default     = "t4g.small"
}

variable "root_volume_gb" {
  description = "Root volume size in GB"
  type        = number
  default     = 16
}

variable "game_server_image_tag" {
  description = "Immutable tag of the game-server image in ECR, for example a commit SHA"
  type        = string
}

variable "cloudflared_tag" {
  description = "Pinned tag of the cloudflare/cloudflared image"
  type        = string
}

variable "compose_version" {
  description = "Pinned Docker Compose release"
  type        = string
}
