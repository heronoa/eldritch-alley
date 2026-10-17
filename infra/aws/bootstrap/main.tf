# --- State bucket --------------------------------------------------------
# Holds bootstrap/terraform.tfstate (once Heron adds backend.tf) and
# prod/terraform.tfstate. Native S3 locking (use_lockfile) is configured on
# the consuming stacks' backend blocks, not here; this bucket just needs to
# allow the conditional writes that locking performs.

resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name

  # Keeping this bucket out of `destroyable` teardown logic on purpose: the
  # prod stack's `destroyable` variable never applies to the bootstrap stack.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyUnencryptedTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.state.arn,
          "${aws_s3_bucket.state.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
    ]
  })
}

# --- GitHub OIDC ----------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # thumbprint_list is optional and computed on this provider version
  # (confirmed against the hashicorp/aws 6.67.0 resource schema): AWS
  # fetches and verifies GitHub's certificate chain itself when it is
  # omitted, which is safer than pinning a thumbprint by hand here.
}

locals {
  oidc_sub_pull_request     = "repo:${var.github_repository}:pull_request"
  oidc_sub_prod_environment = "repo:${var.github_repository}:environment:prod"
}

# --- Role: plan (pull requests, read-only) --------------------------------

resource "aws_iam_role" "plan" {
  name = "eldritch-prod-ci-plan"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "sts:AssumeRoleWithWebIdentity"
        Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = local.oidc_sub_pull_request
          }
        }
      },
    ]
  })
}

# Read-only baseline so `terraform plan` can see every resource type later
# steps introduce. Known gap (documented in infra-01's plan and carried into
# infra-06's README "known limitations"): this is broader than the exact
# resource set the prod stacks use, because that set does not fully exist
# yet (infra-02 onward). Narrow it once all modules are in place, if time
# allows.
resource "aws_iam_role_policy_attachment" "plan_read_only" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "plan_state_access" {
  name = "state-bucket-read-and-lock"
  role = aws_iam_role.plan.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListStateBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.state.arn
      },
      {
        Sid    = "ReadAndLockProdState"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject"]
        # PutObject here is the native lock file (use_lockfile), not a write
        # to the state object itself; `plan` never writes a changed state.
        Resource = "${aws_s3_bucket.state.arn}/prod/*"
      },
    ]
  })
}

# --- Role: apply (prod environment, creates the infrastructure) ----------

resource "aws_iam_role" "apply" {
  name = "eldritch-prod-ci-apply"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "sts:AssumeRoleWithWebIdentity"
        Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = local.oidc_sub_prod_environment
          }
        }
      },
    ]
  })
}

# Known gap, documented in infra-01's plan and carried to infra-06's README:
# PowerUserAccess excludes most IAM management, but `apply` still needs to
# create the IAM roles that infra-04's ECS services and infra-01's own CI
# roles use. The inline policy below scopes that IAM piece to the
# `eldritch-*` name prefix instead of granting IAM broadly.
resource "aws_iam_role_policy_attachment" "apply_power_user" {
  role       = aws_iam_role.apply.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

resource "aws_iam_role_policy" "apply_scoped_iam" {
  name = "scoped-iam-for-eldritch-roles"
  role = aws_iam_role.apply.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageEldritchRoles"
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:TagRole",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:GetRolePolicy",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:ListAttachedRolePolicies",
          "iam:ListRolePolicies",
          "iam:CreateInstanceProfile",
          "iam:DeleteInstanceProfile",
          "iam:AddRoleToInstanceProfile",
          "iam:RemoveRoleFromInstanceProfile",
          "iam:PassRole",
          # The provider reads and updates roles with these on refresh and change.
          "iam:UpdateAssumeRolePolicy",
          "iam:ListRoleTags",
          "iam:UntagRole",
          "iam:GetInstanceProfile",
          "iam:ListInstanceProfilesForRole",
          "iam:TagInstanceProfile",
          "iam:UntagInstanceProfile",
        ]
        Resource = [
          "arn:aws:iam::*:role/eldritch-*",
          "arn:aws:iam::*:instance-profile/eldritch-*",
        ]
      },
      {
        # `role/eldritch-*` also matches the CI roles, so the allow above would
        # let this role widen its own permissions. An explicit deny wins.
        Sid    = "DenyChangingTheCiRoles"
        Effect = "Deny"
        Action = [
          "iam:DeleteRole",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:UpdateAssumeRolePolicy",
        ]
        Resource = "arn:aws:iam::*:role/eldritch-prod-ci-*"
      },
    ]
  })
}

resource "aws_iam_role_policy" "apply_state_access" {
  name = "state-bucket-read-write-and-lock"
  role = aws_iam_role.apply.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListStateBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.state.arn
      },
      {
        Sid      = "ReadWriteAndLockProdState"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.state.arn}/prod/*"
      },
    ]
  })
}

# --- Role: deploy (prod environment, ships application images) -----------

resource "aws_iam_role" "deploy" {
  name = "eldritch-prod-ci-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "sts:AssumeRoleWithWebIdentity"
        Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = local.oidc_sub_prod_environment
          }
        }
      },
    ]
  })
}

# Scoped to what a deploy does: push images, roll out task definitions, run
# the migrate task. No infrastructure-creation permission at all.
resource "aws_iam_role_policy" "deploy_ecr_and_ecs" {
  name = "ecr-push-and-ecs-rollout"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrAuth"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "EcrPushPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
        ]
        Resource = "arn:aws:ecr:*:*:repository/eldritch-alley/*"
      },
      {
        Sid    = "EcsRollout"
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeTaskDefinition",
          "ecs:RunTask",
          "ecs:DescribeTasks",
          "ecs:UpdateService",
          "ecs:DescribeServices",
        ]
        Resource = "*"
        # ECS task definitions and run-task/update-service do not support
        # resource-level scoping the way IAM below does; narrowed by the
        # cluster/service names at the application layer (infra-04), not
        # here.
      },
      {
        # Registering a task definition passes both the task role and the
        # execution role. infra-04 names them eldritch-prod-<service>-task and
        # eldritch-prod-<service>-execution.
        Sid    = "PassRoleToEcsTasks"
        Effect = "Allow"
        Action = ["iam:PassRole"]
        Resource = [
          "arn:aws:iam::*:role/eldritch-prod-*-task",
          "arn:aws:iam::*:role/eldritch-prod-*-execution",
        ]
      },
      {
        Sid      = "LogsForRunTask"
        Effect   = "Allow"
        Action   = ["logs:DescribeLogStreams", "logs:GetLogEvents"]
        Resource = "arn:aws:logs:*:*:log-group:/eldritch-alley/*"
      },
    ]
  })
}
