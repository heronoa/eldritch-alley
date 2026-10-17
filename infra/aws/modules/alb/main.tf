locals {
  service_names = sort(keys(var.services))
  hostnames     = sort([for s in var.services : s.hostname])
}

# --- Who may reach the load balancer ---------------------------------------
# Only Cloudflare. The prefix list keeps the rules tidy, but its max_entries counts
# toward the security group's rule quota, so it leaves only a little headroom.

resource "aws_ec2_managed_prefix_list" "cloudflare" {
  name           = "${var.name}-cloudflare-ipv4"
  address_family = "IPv4"
  max_entries    = length(var.cloudflare_ipv4_cidrs) + 5

  dynamic "entry" {
    for_each = toset(var.cloudflare_ipv4_cidrs)

    content {
      cidr        = entry.value
      description = "Cloudflare"
    }
  }
}

# No inline rules. Ingress is one rule on 443 from the prefix list; egress is one
# rule per service, to that service's group on its container port, and nothing else.
resource "aws_security_group" "this" {
  name        = "${var.name}-alb"
  description = "ALB: HTTPS from Cloudflare only, egress to the service groups only"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.this.id
  prefix_list_id    = aws_ec2_managed_prefix_list.cloudflare.id
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "HTTPS from Cloudflare"
}

resource "aws_vpc_security_group_egress_rule" "to_service" {
  for_each = var.services

  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = each.value.security_group_id
  from_port                    = each.value.port
  to_port                      = each.value.port
  ip_protocol                  = "tcp"
  description                  = "To ${each.key}"
}

# --- Certificate -------------------------------------------------------------

resource "aws_acm_certificate" "this" {
  domain_name               = local.hostnames[0]
  subject_alternative_names = slice(local.hostnames, 1, length(local.hostnames))
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Waits until the certificate is issued. The records that validate it are created by
# the edge-dns module (or by hand), which is why the listener depends on this and not
# on the certificate directly.
resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = var.validation_record_fqdns
}

# --- Load balancer, listener and rules ----------------------------------------

resource "aws_lb" "this" {
  name               = var.name
  load_balancer_type = "application"
  internal           = false
  ip_address_type    = "ipv4"
  subnets            = var.public_subnet_ids
  security_groups    = [aws_security_group.this.id]

  idle_timeout               = var.idle_timeout
  drop_invalid_header_fields = true
  enable_deletion_protection = !var.destroyable
}

# The only listener. There is no port 80 listener, so plain HTTP is never answered.
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.this.certificate_arn

  # A request for a host this stack does not serve gets nothing useful.
  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}

resource "aws_lb_target_group" "service" {
  for_each = var.services

  name        = "${var.name}-${each.key}"
  port        = each.value.port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  deregistration_delay = each.value.deregistration_delay == null ? null : tostring(each.value.deregistration_delay)

  # A real GET that must answer exactly 200. Never a catch-all matcher.
  health_check {
    path     = each.value.health_check_path
    matcher  = "200"
    protocol = "HTTP"
    port     = "traffic-port"
  }
}

resource "aws_lb_listener_rule" "host" {
  for_each = var.services

  listener_arn = aws_lb_listener.https.arn
  priority     = index(local.service_names, each.key) + 1

  condition {
    host_header {
      values = [each.value.hostname]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service[each.key].arn
  }
}
