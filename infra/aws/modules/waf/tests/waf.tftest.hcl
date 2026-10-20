# No credentials, no network access. Run from infra/aws/modules/waf/ with `terraform test`.

# The real provider validates ARN syntax on apply, so the mocked web ACL gets a valid ARN.
mock_provider "aws" {
  mock_resource "aws_wafv2_web_acl" {
    defaults = {
      arn = "arn:aws:wafv2:us-east-1:123456789012:regional/webacl/mock/00000000-0000-0000-0000-000000000000"
    }
  }
}

variables {
  name    = "eldritch-prod"
  alb_arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/eldritch-prod/0123456789abcdef"
}

run "regional_web_acl_allows_by_default" {
  command = plan

  assert {
    condition     = aws_wafv2_web_acl.this.scope == "REGIONAL"
    error_message = "an ALB needs a REGIONAL web ACL"
  }

  assert {
    condition     = length(one(aws_wafv2_web_acl.this.default_action).allow) == 1 && length(one(aws_wafv2_web_acl.this.default_action).block) == 0
    error_message = "the default action must be allow; only the rate rule blocks"
  }

  assert {
    condition     = one(aws_wafv2_web_acl.this.visibility_config).cloudwatch_metrics_enabled == true
    error_message = "CloudWatch metrics must be on, so the rule can be tuned"
  }
}

run "rate_rule_keys_on_the_client_ip_cloudflare_forwards" {
  command = plan

  assert {
    condition     = length(aws_wafv2_web_acl.this.rule) == 1
    error_message = "exactly one rule"
  }

  assert {
    condition     = one(one(one(aws_wafv2_web_acl.this.rule).statement).rate_based_statement).aggregate_key_type == "FORWARDED_IP"
    error_message = "the rule must aggregate on the forwarded IP, since the connection IP is always a Cloudflare one"
  }

  assert {
    condition     = one(one(one(one(aws_wafv2_web_acl.this.rule).statement).rate_based_statement).forwarded_ip_config).header_name == "CF-Connecting-IP"
    error_message = "the forwarded IP must come from CF-Connecting-IP"
  }

  assert {
    condition     = one(one(one(one(aws_wafv2_web_acl.this.rule).statement).rate_based_statement).forwarded_ip_config).fallback_behavior == "MATCH"
    error_message = "a request without the header must still be rate limited"
  }
}

run "rate_limit_defaults_and_blocks" {
  command = plan

  assert {
    condition     = one(one(one(aws_wafv2_web_acl.this.rule).statement).rate_based_statement).limit == 1000
    error_message = "the placeholder limit is 1000"
  }

  assert {
    condition     = one(one(one(aws_wafv2_web_acl.this.rule).statement).rate_based_statement).evaluation_window_sec == 300
    error_message = "the placeholder window is 300 seconds"
  }

  assert {
    condition     = length(one(one(aws_wafv2_web_acl.this.rule).action).block) == 1 && length(one(one(aws_wafv2_web_acl.this.rule).action).count) == 0
    error_message = "the rule blocks by default"
  }
}

run "limit_window_and_action_follow_their_variables" {
  command = plan

  variables {
    rate_limit          = 250
    rate_window_seconds = 60
    rate_limit_action   = "count"
  }

  assert {
    condition     = one(one(one(aws_wafv2_web_acl.this.rule).statement).rate_based_statement).limit == 250 && one(one(one(aws_wafv2_web_acl.this.rule).statement).rate_based_statement).evaluation_window_sec == 60
    error_message = "limit and window must follow the variables"
  }

  assert {
    condition     = length(one(one(aws_wafv2_web_acl.this.rule).action).count) == 1 && length(one(one(aws_wafv2_web_acl.this.rule).action).block) == 0
    error_message = "count mode must observe without blocking"
  }
}

run "an_unsupported_action_is_refused" {
  command = plan

  variables {
    rate_limit_action = "captcha"
  }

  expect_failures = [var.rate_limit_action]
}

run "web_acl_is_associated_with_the_alb" {
  command = apply

  assert {
    condition     = aws_wafv2_web_acl_association.this.resource_arn == var.alb_arn
    error_message = "the web ACL must be associated with the ALB"
  }

  assert {
    condition     = aws_wafv2_web_acl_association.this.web_acl_arn == aws_wafv2_web_acl.this.arn
    error_message = "the association must use this web ACL"
  }

  assert {
    condition     = output.web_acl_arn == aws_wafv2_web_acl.this.arn
    error_message = "the web ACL ARN must be an output"
  }
}
