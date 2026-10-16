variable "name" {
  description = "Prefix for resource names and tags"
  type        = string
}

variable "region" {
  description = "AWS region of the instance and of the parameters it reads"
  type        = string
}

variable "subnet_id" {
  description = "Public subnet of the instance"
  type        = string
}

variable "security_group_id" {
  description = "Security group of the instance (no inbound rules)"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type; arm64 family, for example t4g.small"
  type        = string
}

variable "root_volume_gb" {
  description = "Size of the encrypted gp3 root volume"
  type        = number
}

variable "ssm_param_prefix" {
  description = "Path prefix of the SSM parameters this instance may read, for example /eldritch-alley/stg"
  type        = string
}

variable "cloudflared_token_param" {
  description = "Full name of the SecureString holding the Cloudflare Tunnel token"
  type        = string
}

variable "game_server_image" {
  description = "Full image reference in ECR, with an immutable tag"
  type        = string
}

variable "cloudflared_tag" {
  description = "Tag of the cloudflare/cloudflared image, pinned"
  type        = string
}

variable "compose_version" {
  description = "Docker Compose release, for example v2.40.3; installed as a Docker CLI plugin"
  type        = string
}

variable "compose_file" {
  description = "Content of the Compose file written to the instance (deploy/stg/docker-compose.yml)"
  type        = string
}
