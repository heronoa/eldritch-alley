variable "name" {
  description = "Name of the load balancer and prefix of its related resources"
  type        = string
}

variable "vpc_id" {
  description = "VPC of the load balancer and the target groups"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets of the load balancer (two availability zones)"
  type        = list(string)
}

variable "cloudflare_ipv4_cidrs" {
  description = "Cloudflare's published IPv4 ranges. The only sources allowed to reach port 443. The module does not fetch them."
  type        = list(string)
}

variable "services" {
  description = "One entry per service behind the load balancer, keyed by service name"
  type = map(object({
    hostname             = string
    port                 = number
    health_check_path    = string
    deregistration_delay = optional(number)
    security_group_id    = string
  }))
}

variable "idle_timeout" {
  description = "Idle timeout in seconds. Colyseus pings every 3 s; Cloudflare closes idle connections near 125 s."
  type        = number
  default     = 120
}

variable "validation_record_fqdns" {
  description = "Names of the DNS records that validate the certificate, once created. Null waits for validation without checking them (use it when the records are created by hand)."
  type        = list(string)
  default     = null
}

variable "destroyable" {
  description = "When true, the load balancer has no deletion protection"
  type        = bool
  default     = false
}
