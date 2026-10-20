# Cloudflare is the only thing that can reach the load balancer, so the connection IP
# is always a Cloudflare one. The rule keys on the client IP Cloudflare forwards.
# A request with no CF-Connecting-IP header still counts toward the rule (MATCH).
#
# WAF inspects the WebSocket upgrade request only; frames on an open connection are
# not inspected.
resource "aws_wafv2_web_acl" "this" {
  name        = var.name
  description = "Per-client-IP rate limit in front of the ALB"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit-per-client-ip"
    priority = 1

    action {
      dynamic "block" {
        for_each = var.rate_limit_action == "block" ? [1] : []
        content {}
      }

      dynamic "count" {
        for_each = var.rate_limit_action == "count" ? [1] : []
        content {}
      }
    }

    statement {
      rate_based_statement {
        limit                 = var.rate_limit
        evaluation_window_sec = var.rate_window_seconds
        aggregate_key_type    = "FORWARDED_IP"

        forwarded_ip_config {
          header_name       = "CF-Connecting-IP"
          fallback_behavior = "MATCH"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = var.name
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "this" {
  resource_arn = var.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}
