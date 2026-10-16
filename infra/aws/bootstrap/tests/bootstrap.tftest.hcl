# No credentials, no network access: terraform test with a mocked provider.
# Run from infra/aws/bootstrap/ with `terraform test`.
#
# `command = apply` below still never touches AWS: mock_provider synthesizes
# every computed attribute (role ARNs, the OIDC provider ARN) locally. Plan
# alone cannot be asserted on here because the trust policies embed
# aws_iam_openid_connect_provider.github.arn, a computed value, inside a
# single jsonencode() string — any unknown input makes the whole encoded
# string unknown until apply.

mock_provider "aws" {}

variables {
  github_repository = "heronoa/eldritch-alley"
}

run "plan_role_pins_exact_pull_request_sub" {
  command = apply

  assert {
    condition     = jsondecode(aws_iam_role.plan.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:${var.github_repository}:pull_request"
    error_message = "the plan role must pin the exact pull_request sub claim, no wildcard"
  }

  assert {
    condition     = jsondecode(aws_iam_role.plan.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    error_message = "the plan role must pin aud to sts.amazonaws.com"
  }
}

run "apply_and_deploy_roles_pin_exact_prod_environment_sub" {
  command = apply

  assert {
    condition     = jsondecode(aws_iam_role.apply.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:${var.github_repository}:environment:prod"
    error_message = "the apply role must pin the exact environment:prod sub claim, no wildcard"
  }

  assert {
    condition     = jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:${var.github_repository}:environment:prod"
    error_message = "the deploy role must pin the exact environment:prod sub claim, no wildcard"
  }
}

run "no_role_trust_policy_uses_a_wildcard_condition_operator" {
  command = apply

  assert {
    condition     = !can(jsondecode(aws_iam_role.plan.assume_role_policy).Statement[0].Condition.StringLike)
    error_message = "the plan role must use StringEquals, not StringLike, on the sub claim"
  }

  assert {
    condition     = !can(jsondecode(aws_iam_role.apply.assume_role_policy).Statement[0].Condition.StringLike)
    error_message = "the apply role must use StringEquals, not StringLike, on the sub claim"
  }

  assert {
    condition     = !can(jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringLike)
    error_message = "the deploy role must use StringEquals, not StringLike, on the sub claim"
  }
}

run "state_bucket_denies_unencrypted_transport" {
  command = apply

  assert {
    condition     = jsondecode(aws_s3_bucket_policy.state.policy).Statement[0].Effect == "Deny"
    error_message = "the state bucket policy must deny, not allow, the unencrypted-transport statement"
  }

  assert {
    condition     = jsondecode(aws_s3_bucket_policy.state.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false"
    error_message = "the state bucket policy must key its deny on aws:SecureTransport == false"
  }
}

run "state_bucket_blocks_all_public_access" {
  command = apply

  assert {
    condition     = aws_s3_bucket_public_access_block.state.block_public_acls && aws_s3_bucket_public_access_block.state.block_public_policy && aws_s3_bucket_public_access_block.state.ignore_public_acls && aws_s3_bucket_public_access_block.state.restrict_public_buckets
    error_message = "all four public-access-block settings must be true on the state bucket"
  }
}
