# redis

One ElastiCache Redis node in the isolated subnets, reachable only from the security groups passed in.

- A replication group with a single node, no automatic failover.
- Encryption at rest and in transit. Clients must use TLS (`rediss://`).
- **No auth token** in this delivery: access is limited by the security group only. This is a known limitation, listed in the top-level README in infra-06.
- The security group has no inline rules and no egress; ingress is one separate rule per allowed security group, on 6379, never a CIDR.

| Input | Description |
|---|---|
| `name`, `vpc_id`, `subnet_ids` | Identity and placement |
| `allowed_security_group_ids` | Groups admitted on 6379 |
| `node_type` | Default `cache.t4g.micro` |
| `engine_version`, `parameter_group_family` | Default `7.1` and `redis7` |

| Output | Description |
|---|---|
| `primary_endpoint_address`, `port` | `REDIS_URL` is `rediss://<address>:<port>`, assembled in infra-04 |
| `security_group_id` | The cache's group |
| `allowed_security_group_ids`, `subnet_ids` | The wiring, echoed for the caller's tests |

Tests: `terraform test` from this directory (mocked provider, no credentials).
