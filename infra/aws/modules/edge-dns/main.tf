# Cloudflare drops the trailing dot ACM puts on its record names and values, so they
# are trimmed here, or every plan would show a difference.
locals {
  validation = {
    for domain, o in var.certificate_validation_options : domain => {
      name  = trimsuffix(o.name, ".")
      type  = o.type
      value = trimsuffix(o.value, ".")
    }
  }
}

# The hostnames the players use: proxied CNAMEs to the load balancer.
resource "cloudflare_dns_record" "service" {
  for_each = var.manage_cloudflare_dns ? var.hostnames : {}

  zone_id = var.zone_id
  name    = each.value
  type    = "CNAME"
  content = var.alb_dns_name
  proxied = true
  ttl     = 1
}

# Certificate validation must reach ACM directly, so these are DNS-only.
resource "cloudflare_dns_record" "validation" {
  for_each = var.manage_cloudflare_dns ? local.validation : {}

  zone_id = var.zone_id
  name    = each.value.name
  type    = each.value.type
  content = each.value.value
  proxied = false
  ttl     = 1
}

# ZONE-WIDE: this changes how Cloudflare checks the origin certificate of every
# hostname in the zone, not only the two above. Off unless asked.
resource "cloudflare_zone_setting" "ssl" {
  count = var.manage_cloudflare_dns && var.manage_zone_ssl_mode ? 1 : 0

  zone_id    = var.zone_id
  setting_id = "ssl"
  value      = "strict"
}
