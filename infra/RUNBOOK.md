# Runbook: M2-b staging on EC2

Operational steps before the first `terraform plan` of the staging environment. The design is in [.ia_context/plans/m2b-ec2.plan.md](../.ia_context/plans/m2b-ec2.plan.md). Terraform code is in [terraform/](terraform/).

Rules that apply to every step:

- Never run Terraform with the root user's credentials.
- Never paste a secret into a command line that stays in shell history. Use the prompts shown below.
- Nothing is applied without the owner's approval for that resource group.

## 0. Conventions

| Item | Value |
|---|---|
| AWS account | `510915414773` |
| Region | `us-east-1` |
| CLI profile for Terraform | `eldritch-stg` |
| SSM prefix | `/eldritch-alley/stg` |
| Public hostname (stg) | `stg-eldritch-game.heronoa.com.br` |

## 1. Enable MFA on the root user

1. Sign in to the AWS console as the root user.
2. Go to **Security credentials** for the account, then **Multi-factor authentication (MFA)**.
3. Assign an MFA device (authenticator app or security key).
4. Confirm that the root user has no access keys: under **Security credentials**, the list of access keys must be empty. If there is one, delete it after step 2 is done.

Check: the console shows MFA as "assigned" for the root user.

## 2. Create the IAM identity for Terraform

Terraform runs as an IAM user, not as root. An IAM Identity Center profile is also acceptable if you already use one.

1. In the console, go to **IAM**, then **Users**, then **Create user**. Name: `terraform-eldritch-stg`. Do not enable console access.
2. Attach a policy that grants only what the staging stack uses. The policy must be reviewed before it is attached. It needs these permissions, limited to the names used by the code:
   - EC2: VPC, subnet, internet gateway, route table, security group, instance, and the instance profile tags. Limit to resources tagged `Project=eldritch-alley`, `Environment=stg` where the API supports it.
   - ECR: `ecr:*` on `repository/eldritch-alley/*`.
   - IAM: create, tag, read and delete the role and instance profile named `eldritch-stg-ec2`; `iam:PassRole` on that role only; attach only the two managed policies used by the code (`AmazonEC2ContainerRegistryReadOnly`, `AmazonSSMManagedInstanceCore`) and the inline policy `read-stg-parameters`.
   - SSM: `ssm:GetParameter` for reading the public AL2023 AMI parameter, and `ssm:PutParameter`, `ssm:GetParameter`, `ssm:DeleteParameter` on `/eldritch-alley/stg/*` (for the manual secret in step 4 only).
   - STS: `sts:GetCallerIdentity`.
3. Create an access key for that user (**Security credentials** tab, **Create access key**, use case "Command Line Interface"). Keep the key and secret in the prompt of the next step only.

Check: the user exists, has the policy above, and has one active access key.

## 3. Configure the AWS CLI profile

On the dev machine:

```
aws configure --profile eldritch-stg
```

Answer the prompts:

- AWS Access Key ID: the key from step 2
- AWS Secret Access Key: the secret from step 2
- Default region name: `us-east-1`
- Default output format: `json`

Then check that the profile is **not** root:

```
aws sts get-caller-identity --profile eldritch-stg
```

Expected: `Arn` contains `:user/terraform-eldritch-stg`. If it contains `:root`, stop: the profile is wrong.

Optional, once the profile works: remove the root user's access keys (step 1, item 4), and do not use the root user for the CLI again.

## 4. Create the Cloudflare Tunnel and store its token

This step creates the tunnel that serves `stg-eldritch-game.heronoa.com.br`. The homelab tunnel on `eldritch-game.heronoa.com.br` must not be changed.

### 4a. In the Cloudflare dashboard

1. Go to **Zero Trust**, then **Networks**, then **Tunnels**, then **Create a tunnel**. Connector type: **Cloudflared**.
2. Name: `eldritch-stg`.
3. Do **not** install a connector on this machine. Copy the token from the install command (the value after `--token`). It starts with `eyJ`.
4. On the **Public hostname** tab, add:
   - Subdomain: `stg-eldritch-game`
   - Domain: `heronoa.com.br`
   - Service: type `HTTP`, URL `game-server:2567`

   The service name `game-server` is the compose service on the instance. It resolves inside the compose network.
5. Save the tunnel. Its status stays "Inactive" until the instance runs `cloudflared`. That is expected.

### 4b. Store the token in SSM

Run this in the terminal. It prompts for the token, so the token stays out of shell history:

```
read -r -s -p "Cloudflare tunnel token: " TOKEN && echo
aws ssm put-parameter \
  --profile eldritch-stg \
  --region us-east-1 \
  --name /eldritch-alley/stg/cloudflared-token \
  --type SecureString \
  --value "$TOKEN" \
  --description "Cloudflare Tunnel token for the stg EC2 (eldritch-stg)"
unset TOKEN
```

The value is visible to other users on the machine for a moment while the command runs. On a personal dev machine this is acceptable; do not run it on a shared host.

Check:

```
aws ssm get-parameter --profile eldritch-stg --region us-east-1 \
  --name /eldritch-alley/stg/cloudflared-token --query 'Parameter.Type'
```

Expected: `"SecureString"`. Do not print the value with `--with-decryption` in a shared terminal.

## 5. Choose the pinned versions

Copy the example and fill in the three values:

```
cd infra/terraform/envs/stg
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

| Variable | What to use | How to check |
|---|---|---|
| `cloudflared_tag` | A tag of `cloudflare/cloudflared` on Docker Hub, for example a dated release | Docker Hub tags page; pick a stable version, not `latest` |
| `compose_version` | A release tag of `docker/compose`, for example `v2.x.y` | GitHub releases page of `docker/compose`. It must include the asset `docker-compose-linux-aarch64` |
| `game_server_image_tag` | An immutable tag, for example the short commit SHA of the build | Chosen when the image is pushed in step 7 |

Tags are immutable in ECR. Pick the tag you will push, not a placeholder.

Check: `terraform.tfvars` has no `REPLACE_` strings. `grep REPLACE infra/terraform/envs/stg/terraform.tfvars` prints nothing.

## 6. Plan (do not apply yet)

```
cd infra/terraform/envs/stg
export AWS_PROFILE=eldritch-stg
terraform init
terraform validate
terraform plan -out=stg.tfplan
```

`terraform init` creates the local state file `terraform.tfstate`, which is gitignored. Keep it; it is the only record of the infrastructure until the state is migrated.

Share the plan output with the owner. Do not run `terraform apply` until the owner approves the plan.

Check: the plan lists these resources to create: VPC, internet gateway, subnet, route table and association, security group, ECR repository and lifecycle policy, IAM role, role policy attachments, inline policy, instance profile, EC2 instance. Nothing else. Any destroy or change to existing resources is a stop condition.

## 7. After approval: apply, push the image, start the stack

Only after the owner approves the plan:

```
terraform apply stg.tfplan
```

Then build and push the image for arm64 (the instance is `t4g.small`, arm64, and the dev machine is x86_64):

```
REPO=$(terraform output -raw ecr_repository_url)
REGISTRY=${REPO%%/*}
TAG=<the value of game_server_image_tag in terraform.tfvars>

aws ecr get-login-password --profile eldritch-stg --region us-east-1 \
  | docker login --username AWS --password-stdin "$REGISTRY"

# from the repository root
docker buildx build --platform linux/arm64 \
  -f backend/Dockerfile --build-arg SERVICE=game-server \
  -t "$REPO:$TAG" --push .
```

The first boot of the instance runs `docker compose pull`, which fails if the image did not exist yet. Start the stack by hand over SSM:

```
aws ssm start-session --profile eldritch-stg --region us-east-1 \
  --target "$(terraform output -raw instance_id)"
```

On the instance:

```
cd /opt/eldritch
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
```

Check: both services are `running`. In the Cloudflare dashboard, the tunnel `eldritch-stg` is **Healthy**. Then open `wss://stg-eldritch-game.heronoa.com.br` from the browser, or with the Colyseus client, and confirm the handshake.

## 8. Acceptance (from the plan)

1. A second `terraform plan` shows no changes.
2. `aws ssm start-session` opens a shell without port 22 open.
3. The image pulled from ECR runs on the instance.
4. The tunnel is Healthy and the WebSocket handshake works on the stg hostname.
5. The pending M2-b tests run against the stg hostname: a real room kept idle for more than 2 minutes, then a forced drop and a reconnect.

## Troubleshooting

- **`aws sts get-caller-identity` shows root.** The profile is wrong. Check `~/.aws/config` and `~/.aws/credentials`. Do not continue.
- **`put-parameter` fails with `AccessDenied`.** The IAM user lacks `ssm:PutParameter` on `/eldritch-alley/stg/*`, or the KMS key use is denied. Fix the policy and retry.
- **`put-parameter` stores a wrong value.** Run `aws ssm put-parameter ... --overwrite` with the same flags as step 4b; `--overwrite` is required to replace an existing parameter.
- **`terraform plan` asks for a variable.** A value is missing from `terraform.tfvars`. Step 5.
- **`docker compose pull` fails on the instance with "not found".** The image tag in `.env` does not exist in ECR. Check the tag with `aws ecr describe-images --profile eldritch-stg --region us-east-1 --repository-name eldritch-alley/game-server`.
- **Compose fails with `exec format error`.** The image was built for amd64. Rebuild with `--platform linux/arm64`, using a new tag (ECR tags are immutable).
- **Tunnel stays Inactive.** Check `sudo docker compose logs cloudflared` on the instance. The token must match the tunnel created in step 4a.

## Rollback

- Before apply: nothing exists; delete the local `stg.tfplan` if needed.
- After apply: `terraform destroy` in `infra/terraform/envs/stg`, after owner approval. This removes the VPC, ECR repository (with its images, since `force_delete` is off, ECR refuses to delete a non-empty repository: delete the images first), role and instance.
- Manual items not managed by Terraform: delete the SSM parameter `/eldritch-alley/stg/cloudflared-token` and the tunnel `eldritch-stg` in the Cloudflare dashboard.
