# alb

The public entrypoint: an internet-facing, IPv4-only Application Load Balancer that only Cloudflare can reach, with an ACM certificate, one HTTPS listener and one host-header rule per service.

- **Who may connect.** The security group has one ingress rule, TCP 443 from a customer-managed prefix list of Cloudflare's IPv4 ranges, and one egress rule per service, to that service's security group on its container port. No CIDR source anywhere, and no inline rules.
- **One listener, on 443**, with `ELBSecurityPolicy-TLS13-1-2-2021-06`. There is no port 80 listener, so plain HTTP is never answered. The default action is a fixed 403: a request for a host this stack does not serve gets nothing useful.
- **`idle_timeout = 120`.** Colyseus pings every 3 s and Cloudflare closes idle connections near 125 s.
- **Target groups** are type `ip` (awsvpc tasks) with a real `GET` health check that must answer exactly 200. A catch-all matcher would hide an outage.
- **The certificate** covers every hostname, validated by DNS. The records that validate it are created by the `edge-dns` module, or by hand with `manage_cloudflare_dns = false`. The listener waits for the issued certificate.
- **`certificate_validation_options`** is keyed by hostname, taken from the inputs, so a `for_each` over it is known at plan time and only its values wait for the certificate.
- The prefix list's `max_entries` counts toward the security group's rule quota, so it leaves only five entries of headroom. Cloudflare's ranges change rarely; refreshing the list needs an apply.

| Input | Description |
|---|---|
| `name`, `vpc_id`, `public_subnet_ids` | Identity and placement |
| `cloudflare_ipv4_cidrs` | The ranges allowed to reach 443. The module does not fetch them |
| `services` | Per service: `hostname`, `port`, `health_check_path`, optional `deregistration_delay`, `security_group_id` |
| `idle_timeout` | Default 120 |
| `validation_record_fqdns` | Names of the validation records once created; null waits without checking |
| `destroyable` | When true, no deletion protection |

| Output | Description |
|---|---|
| `alb_arn`, `alb_dns_name`, `alb_zone_id` | The load balancer |
| `alb_security_group_id` | Which the services admit ingress from |
| `target_group_arns` | Keyed by service |
| `certificate_arn`, `certificate_validation_options` | The certificate and its DNS records |

Tests: `terraform test` from this directory (mocked provider, no credentials).
