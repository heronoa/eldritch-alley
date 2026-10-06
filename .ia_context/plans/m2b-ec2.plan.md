# M2-b · EC2 stg (plan)

Scope: the staging environment on one EC2 instance, as described in ROADMAP M2-b. Out of scope: SQS, S3, RDS, ElastiCache, ECS, ALB. Those arrive with M4, M5 and M6 when the code uses them.

## Decisions

| Item | Value | Source |
|---|---|---|
| Region | `us-east-1` | Owner, 2026-10-05 |
| Instance | `t4g.small` (arm64, Graviton) | Owner, 2026-10-05 |
| IaC tool | Terraform 1.15.x, AWS provider pinned in `versions.tf` | Owner, 2026-10-05 |
| State | Local in M2-b, migrated to S3 + lock later | Owner, 2026-10-05 |
| Public entry | Cloudflare Tunnel with `cloudflared` on the instance. No inbound ports | ROADMAP M2-b |

## Prerequisite (owner action, before any apply)

The AWS CLI on the dev machine is authenticated as the **root user** of account `510915414773`. Terraform must not run with root credentials.

- Enable MFA on the root user, if not already enabled.
- Create an IAM user or IAM Identity Center profile for Terraform, with the permissions listed in "Terraform permissions" below.
- Configure it as a named AWS profile (`eldritch-stg`). The Terraform code uses `profile = var.aws_profile`, never a key in the repository.

## Decided: public hostname for stg

`stg-eldritch-game.heronoa.com.br` for the EC2 tunnel. The homelab tunnel on `eldritch-game.heronoa.com.br` stays untouched. Approved by the owner on 2026-10-05. Stg needs its own frontend build pointing to this hostname; that is a separate change.

## Status (2026-10-05)

- Owner has only installed and authenticated the AWS CLI. **Nothing exists in the AWS account yet.**
- The CLI is authenticated as the root user. The "Prerequisite" section must be done before any apply.
- Terraform code is written under `infra/terraform/` and validated locally (`fmt`, `init -backend=false`, `validate`). No `plan` or `apply` has run.

## Resources, in apply order

Each group is applied only after the owner approves it. Each one ends with a `terraform plan` shown to the owner.

### 1. Network (`modules/network`)

- VPC `10.0.0.0/16`, DNS support and hostnames on.
- One public subnet `10.0.1.0/24` in `us-east-1a`.
- Internet gateway, route table with `0.0.0.0/0` to the gateway.
- No NAT gateway. The instance has a public IPv4 to reach ECR and Cloudflare outbound.
- Security group `eldritch-stg-ec2`: **no ingress rules**. Egress all.

### 2. Container registry (`modules/ecr`)

- Repository `eldritch-alley/game-server`.
- Tag mutability `IMMUTABLE`, scan on push, encryption AES256.
- Lifecycle policy: keep the last 10 images.
- `platform-api` repository is not created now (no deploy target yet).

### 3. Instance identity (`modules/ec2`, IAM part)

- IAM role `eldritch-stg-ec2` with the instance profile.
- Managed policies: `AmazonEC2ContainerRegistryReadOnly`, `AmazonSSMManagedInstanceCore`.
- Inline policy: `ssm:GetParameter` and `kms:Decrypt` only on `/eldritch-alley/stg/*`.

### 4. Secrets (manual, not in Terraform)

Created by the owner with the AWS CLI, so the values never enter the Terraform state:

- `/eldritch-alley/stg/cloudflared-token` (SecureString), the token of the stg tunnel created in the Cloudflare dashboard. The boot script reads it.

Deviation from the first version of this plan: `jwt-secret` is **not** created now. No code reads `JWT_SECRET` until M4, so it is created then, with its own approval. The instance role already covers `/eldritch-alley/stg/*`.

Terraform only reads these at boot; it never creates the values.

### 5. Instance (`modules/ec2`)

- AMI: Amazon Linux 2023 arm64, resolved through the public SSM parameter `/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64`.
- Type `t4g.small`, placed in the public subnet, public IPv4, security group from step 1.
- Root volume gp3, 16 GB, encrypted.
- IMDSv2 required (`http_tokens = required`).
- No key pair. Access only through SSM Session Manager.
- `user_data`: install Docker and the Compose plugin, log in to ECR, read the tunnel token from SSM, write the Compose file and its `.env`, and try to start the stack. The first start may fail if the image is not in ECR yet; the script says so and the owner runs `docker compose up -d` after the first push.

### 6. Compose stack for stg (repository file, not Terraform)

- `deploy/stg/docker-compose.yml`, passed to the instance by Terraform (`file()`), so the repository file is the single source.
- `game-server` from ECR, no published ports.
- `cloudflared` as a container (`cloudflare/cloudflared`, pinned tag), running the tunnel token. The tunnel's public hostname points to `http://game-server:2567`, set in the Cloudflare dashboard, not in Terraform.
- Restart policy `unless-stopped` on both.
- `REDIS_URL` and the database variables are not included: the game server does not read them yet.

## Architecture note: arm64 image

The dev machine is `x86_64`. The `game-server` image must be built for `linux/arm64`:

```
docker buildx build --platform linux/arm64 -f backend/Dockerfile --build-arg SERVICE=game-server -t <ecr>/eldritch-alley/game-server:<tag> --push .
```

Emulated builds are slow. Moving the build to a GitHub Actions arm64 runner is a later step, not part of this plan.

## Repository changes (on approval)

- `infra/terraform/envs/stg/` with `versions.tf`, `providers.tf`, `main.tf`, `variables.tf`, `outputs.tf`, `terraform.tfvars.example`.
- `infra/terraform/modules/{network,ecr,ec2}/`.
- `deploy/stg/docker-compose.yml`.
- `.gitignore`: add `*.tfstate`, `*.tfstate.*`, `.terraform/`, `*.tfvars` (keeping `!*.tfvars.example`). `.terraform.lock.hcl` **is** committed.
- CI: not changed in this plan. `terraform fmt -check`, `validate` and a plan job come in a separate change.

## Terraform permissions (for the Terraform IAM identity)

Scoped to the resources above: `ec2:*` restricted to the VPC and the instance tags, `ecr:*` restricted to `eldritch-alley/*`, `iam:CreateRole`, `iam:PassRole`, `iam:CreateInstanceProfile` and attachments restricted to `eldritch-stg-*`, `ssm:GetParameter` for the read paths. The exact policy is written when the owner approves step 1.

## Cost (order of magnitude, us-east-1, verify in the pricing calculator)

- `t4g.small` on demand: about USD 12 per month.
- Public IPv4 address: about USD 3.7 per month (AWS charges for every public IPv4 since February 2024).
- EBS gp3 16 GB: about USD 1.3 per month.
- ECR storage for 10 images: small.

## Acceptance (M2-b, EC2 part)

1. `terraform apply` creates the network, ECR, IAM and instance. A second `plan` shows no changes.
2. `aws ssm start-session` opens a shell on the instance. No port 22 is open.
3. `docker pull` of the arm64 image from ECR works on the instance.
4. The tunnel is healthy in the Cloudflare dashboard, and a WebSocket handshake to the stg hostname returns OK.
5. The pending M2-b tests from ROADMAP run against the stg hostname: idle more than 2 minutes with a real room, then a forced drop and reconnect.

## Rollback

- Terraform destroy of the stack, or `terraform destroy -target` per module.
- Secrets in SSM are removed by hand.
- Tunnel deleted in the Cloudflare dashboard.

## Follow-ups (not in this plan)

- Remote state in S3 with locking (after the second environment exists).
- Deploy workflow with GitHub Actions and OIDC, instead of manual `docker pull`.
- Terraform checks in CI.
- SQS, S3, RDS, ElastiCache, ECS and ALB, with their own plans at M4, M5 and M6.
