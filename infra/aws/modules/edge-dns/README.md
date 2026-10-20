# edge-dns

The Cloudflare side of the edge: a proxied CNAME per hostname pointing at the load balancer, and the DNS-only records that validate the ACM certificate.

- Needs the `cloudflare/cloudflare` provider (v5 is what this was written against) and a token scoped to DNS edit on the one zone. The token comes from `CLOUDFLARE_API_TOKEN`, never from code or state.
- ACM puts a trailing dot on its record names and values, which Cloudflare drops, so they are trimmed here or every plan would show a difference.
- `manage_cloudflare_dns = false` creates nothing. The `validation_records` output then lists what to create by hand, DNS-only, before the certificate can be issued.
- **`manage_zone_ssl_mode` is off by default because it is zone-wide.** Setting Full (strict) also changes how Cloudflare checks the origin certificate of every other hostname in the zone, including any that are not part of this stack. Otherwise it is a manual step: Cloudflare dashboard, SSL/TLS, Full (strict). The values `ssl` and `strict` were not verified against a real zone.

| Input | Description |
|---|---|
| `zone_id` | Cloudflare zone id; not needed when DNS is not managed |
| `hostnames` | Keyed by service name |
| `alb_dns_name` | The CNAME target |
| `certificate_validation_options` | Keyed by hostname, each `name`, `type`, `value` |
| `manage_cloudflare_dns`, `manage_zone_ssl_mode` | See above |

| Output | Description |
|---|---|
| `record_names` | The proxied records |
| `validation_fqdns` | Validation record names, without the trailing dot, for the ACM validation to wait on |
| `validation_records` | What to create by hand when DNS is not managed here |

Tests: `terraform test` from this directory (mocked provider, no credentials).
