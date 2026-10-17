# vpc

Production network: one VPC across two availability zones, with one public and one isolated subnet per zone. No NAT gateway and no interface endpoints, on purpose (they bill per hour).

- Public subnets route `0.0.0.0/0` to the internet gateway. They hold the ALB and the Fargate tasks.
- Isolated subnets have only the local route. They hold RDS and ElastiCache.
- A free S3 gateway endpoint is attached to the public route table only (ECR image layers come from S3).
- Security groups are not created here; each workload module owns its own.

| Input | Description |
|---|---|
| `name` | Prefix for names and tags |
| `vpc_cidr` | VPC CIDR, default `10.1.0.0/16` (stg uses `10.0.0.0/16`) |
| `region` | Region, used for the S3 endpoint service name |

| Output | Description |
|---|---|
| `vpc_id` | VPC id |
| `public_subnet_ids`, `isolated_subnet_ids` | One id per zone |
| `availability_zones` | The two zones in use |
| `s3_gateway_endpoint_id` | S3 gateway endpoint id |

Tests: `terraform test` from this directory (mocked provider, no credentials).
