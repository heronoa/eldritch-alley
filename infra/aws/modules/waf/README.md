# waf

A regional WAFv2 web ACL associated with the load balancer, with one per-client-IP rate rule.

- Cloudflare is the only thing that can reach the load balancer, so the connection IP is always a Cloudflare one. The rule keys on the client IP Cloudflare forwards in `CF-Connecting-IP`. A request with no such header still counts toward the rule (`MATCH`).
- The default action is allow; only the rate rule blocks. `rate_limit_action = "count"` records without blocking, useful to tune the limit first.
- **The limit is a placeholder, not a measurement:** 1000 requests per 300 s per client IP, with no traffic data behind it. Players behind one shared network address (a school, an office) share a counter.
- WAF inspects the WebSocket upgrade request only; frames on an open connection are not inspected.
- No AWS-managed rule groups: each is billed per rule. A known limitation and a later option.
- WAF is billed per web ACL, per rule and per request.

| Input | Description |
|---|---|
| `name`, `alb_arn` | Identity and the load balancer to protect |
| `rate_limit` | Default 1000, at least 10 |
| `rate_window_seconds` | 60, 120, 300 or 600; default 300 |
| `rate_limit_action` | `block` (default) or `count` |

| Output | Description |
|---|---|
| `web_acl_arn` | The web ACL |

Tests: `terraform test` from this directory (mocked provider, no credentials).
