# No credentials, no network access. Run from infra/aws/modules/assets-bucket/ with `terraform test`.
#
# `command = apply` because the bucket policy embeds the bucket ARN (a computed
# value) inside jsonencode(); the mock provider still never touches AWS.

mock_provider "aws" {}

variables {
  name                = "eldritch-prod-assets-123456789012"
  cors_allowed_origin = "https://eldritch.heronoa.com.br"
}

run "all_public_access_is_blocked_and_ownership_is_enforced" {
  command = apply

  assert {
    condition = (
      aws_s3_bucket_public_access_block.this.block_public_acls
      && aws_s3_bucket_public_access_block.this.block_public_policy
      && aws_s3_bucket_public_access_block.this.ignore_public_acls
      && aws_s3_bucket_public_access_block.this.restrict_public_buckets
    )
    error_message = "all four public-access-block settings must be true"
  }

  assert {
    condition     = one(aws_s3_bucket_ownership_controls.this.rule).object_ownership == "BucketOwnerEnforced"
    error_message = "object ownership must be BucketOwnerEnforced"
  }
}

run "bucket_policy_denies_requests_without_tls" {
  command = apply

  assert {
    condition = anytrue([
      for s in jsondecode(aws_s3_bucket_policy.this.policy).Statement :
      s.Effect == "Deny" && s.Condition.Bool["aws:SecureTransport"] == "false"
    ])
    error_message = "the bucket policy must deny non-TLS requests"
  }
}

run "versioning_encryption_and_lifecycle" {
  command = apply

  assert {
    condition     = aws_s3_bucket_versioning.this.versioning_configuration[0].status == "Enabled"
    error_message = "versioning must be enabled"
  }

  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.this.rule).apply_server_side_encryption_by_default).sse_algorithm == "AES256"
    error_message = "default encryption must be SSE-S3"
  }

  assert {
    condition     = one(one(aws_s3_bucket_lifecycle_configuration.this.rule).noncurrent_version_expiration).noncurrent_days == 30
    error_message = "non-current versions must expire after 30 days"
  }

  assert {
    condition     = one(one(aws_s3_bucket_lifecycle_configuration.this.rule).abort_incomplete_multipart_upload).days_after_initiation == 7
    error_message = "incomplete multipart uploads must abort after 7 days"
  }
}

run "cors_allows_one_origin_and_three_methods" {
  command = apply

  assert {
    condition     = length(aws_s3_bucket_cors_configuration.this.cors_rule) == 1
    error_message = "exactly one CORS rule"
  }

  assert {
    condition     = one(aws_s3_bucket_cors_configuration.this.cors_rule).allowed_origins == toset(["https://eldritch.heronoa.com.br"])
    error_message = "CORS must allow only the configured origin"
  }

  assert {
    condition     = one(aws_s3_bucket_cors_configuration.this.cors_rule).allowed_methods == toset(["GET", "PUT", "HEAD"])
    error_message = "CORS must allow exactly GET, PUT and HEAD"
  }
}

run "force_destroy_is_off_by_default" {
  command = apply

  assert {
    condition     = aws_s3_bucket.this.force_destroy == false
    error_message = "force_destroy must be false when destroyable is false"
  }
}

run "force_destroy_follows_destroyable" {
  command = apply

  variables {
    destroyable = true
  }

  assert {
    condition     = aws_s3_bucket.this.force_destroy == true
    error_message = "force_destroy must be true when destroyable is true"
  }
}
