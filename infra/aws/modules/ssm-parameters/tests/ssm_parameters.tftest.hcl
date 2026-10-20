# No credentials, no network access. Run from infra/aws/modules/ssm-parameters/ with `terraform test`.
#
# `ignore_changes = [value]` cannot be asserted by terraform test; it is covered
# by the module README and by review.

mock_provider "aws" {}

variables {
  prefix = "/eldritch-alley/prod"
  parameters = {
    SESSION_SECRET = { type = "SecureString", description = "Session signing secret" }
    JWT_SECRET     = { type = "SecureString", description = "Shared JWT secret" }
  }
}

run "parameters_live_under_the_prefix_as_secure_strings" {
  command = plan

  assert {
    condition     = length(aws_ssm_parameter.this) == 2
    error_message = "one parameter per entry"
  }

  assert {
    condition     = alltrue([for k, p in aws_ssm_parameter.this : p.name == "${var.prefix}/${k}"])
    error_message = "every parameter name must be <prefix>/<key>"
  }

  assert {
    condition     = alltrue([for p in aws_ssm_parameter.this : p.type == "SecureString"])
    error_message = "these entries must be SecureString"
  }
}

run "values_are_the_fixed_placeholder_never_a_real_secret" {
  command = plan

  assert {
    condition     = alltrue([for p in aws_ssm_parameter.this : nonsensitive(p.value) == "placeholder-set-by-hand"])
    error_message = "Terraform may only write the fixed placeholder"
  }
}

run "outputs_expose_the_prefix_and_arns" {
  command = apply

  assert {
    condition     = output.prefix == "/eldritch-alley/prod" && length(output.parameter_arns) == 2
    error_message = "outputs must expose the prefix and one ARN per parameter"
  }
}
