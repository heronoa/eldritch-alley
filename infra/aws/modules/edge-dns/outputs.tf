output "record_names" {
  description = "Hostnames of the proxied records, keyed by service name (empty when DNS is not managed here)"
  value       = { for k, r in cloudflare_dns_record.service : k => r.name }
}

output "validation_fqdns" {
  description = "Names of the validation records, without the trailing dot, for the ACM validation to wait on"
  value       = [for r in cloudflare_dns_record.validation : r.name]
}

output "validation_records" {
  description = "The validation records. When DNS is not managed here, create these by hand, DNS-only."
  value       = local.validation
}
