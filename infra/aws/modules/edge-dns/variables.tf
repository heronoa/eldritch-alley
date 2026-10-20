variable "zone_id" {
  description = "Cloudflare zone id of the domain. Not needed when manage_cloudflare_dns is false."
  type        = string
  default     = null
}

variable "hostnames" {
  description = "Hostnames to point at the load balancer, keyed by service name"
  type        = map(string)
}

variable "alb_dns_name" {
  description = "Load balancer DNS name, the target of the proxied CNAMEs"
  type        = string
}

variable "certificate_validation_options" {
  description = "The DNS records that validate the ACM certificate, keyed by domain name"
  type = map(object({
    name  = string
    type  = string
    value = string
  }))
}

variable "manage_cloudflare_dns" {
  description = "When false nothing is created here and the records are created by hand"
  type        = bool
  default     = true
}

variable "manage_zone_ssl_mode" {
  description = "Set the zone's SSL mode to Full (strict). Off by default: it is a ZONE-WIDE setting and also changes every other hostname in the zone."
  type        = bool
  default     = false
}
