# No credentials, no network access. Run from infra/aws/modules/alb/ with `terraform test`.
# `command = apply` where an assertion compares ids that only exist after creation;
# the mock provider synthesizes them locally and never touches AWS.

# The real provider validates ARN syntax on apply, so the mocked resources get valid ARNs.
mock_provider "aws" {
  mock_resource "aws_lb" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/mock/0123456789abcdef"
    }
  }

  mock_resource "aws_lb_listener" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/mock/0123456789abcdef/0123456789abcdef"
    }
  }

  mock_resource "aws_lb_target_group" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/mock/0123456789abcdef"
    }
  }

  mock_resource "aws_acm_certificate" {
    defaults = {
      arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
    }
  }

  mock_resource "aws_acm_certificate_validation" {
    defaults = {
      certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
    }
  }
}

variables {
  name              = "eldritch-prod"
  vpc_id            = "vpc-0abc"
  public_subnet_ids = ["subnet-0aaa", "subnet-0bbb"]

  cloudflare_ipv4_cidrs = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22"]

  services = {
    "platform-api" = {
      hostname          = "eldritch-aws-api.heronoa.com.br"
      port              = 3000
      health_check_path = "/health"
      security_group_id = "sg-0aaa"
    }
    "game-server" = {
      hostname             = "eldritch-aws-game.heronoa.com.br"
      port                 = 2567
      health_check_path    = "/health"
      deregistration_delay = 120
      security_group_id    = "sg-0bbb"
    }
  }
}

run "load_balancer_is_public_ipv4_only_with_a_two_minute_idle_timeout" {
  command = plan

  assert {
    condition     = aws_lb.this.load_balancer_type == "application" && aws_lb.this.internal == false
    error_message = "an internet-facing application load balancer"
  }

  assert {
    condition     = aws_lb.this.ip_address_type == "ipv4"
    error_message = "the ALB must be IPv4 only"
  }

  assert {
    condition     = aws_lb.this.idle_timeout == 120
    error_message = "idle_timeout must be 120 (Colyseus pings every 3 s; Cloudflare closes idle connections near 125 s)"
  }

  assert {
    condition     = aws_lb.this.subnets == toset(["subnet-0aaa", "subnet-0bbb"])
    error_message = "the ALB must sit in the public subnets given"
  }

  assert {
    condition     = aws_lb.this.enable_deletion_protection == true
    error_message = "deletion protection must be on unless destroyable"
  }
}

run "destroyable_lifts_deletion_protection" {
  command = plan

  variables {
    destroyable = true
  }

  assert {
    condition     = aws_lb.this.enable_deletion_protection == false
    error_message = "deletion protection must be off when destroyable is true"
  }
}

run "one_https_listener_with_tls13_policy_and_a_403_default" {
  command = plan

  assert {
    condition     = aws_lb_listener.https.port == 443 && aws_lb_listener.https.protocol == "HTTPS"
    error_message = "the only listener is HTTPS on 443"
  }

  assert {
    condition     = aws_lb_listener.https.ssl_policy == "ELBSecurityPolicy-TLS13-1-2-2021-06"
    error_message = "the TLS policy must be ELBSecurityPolicy-TLS13-1-2-2021-06"
  }

  assert {
    condition     = one(aws_lb_listener.https.default_action).type == "fixed-response"
    error_message = "the default action must be a fixed response, never a forward"
  }

  assert {
    condition     = one(one(aws_lb_listener.https.default_action).fixed_response).status_code == "403"
    error_message = "an unknown host must get a 403"
  }
}

run "certificate_covers_both_hostnames_with_dns_validation" {
  command = plan

  assert {
    condition     = aws_acm_certificate.this.validation_method == "DNS"
    error_message = "the certificate must be validated by DNS"
  }

  assert {
    condition     = toset(concat([aws_acm_certificate.this.domain_name], tolist(aws_acm_certificate.this.subject_alternative_names))) == toset(["eldritch-aws-api.heronoa.com.br", "eldritch-aws-game.heronoa.com.br"])
    error_message = "one certificate must cover both hostnames and nothing else"
  }
}

run "cloudflare_prefix_list_holds_exactly_the_given_ranges" {
  command = plan

  assert {
    condition     = aws_ec2_managed_prefix_list.cloudflare.address_family == "IPv4"
    error_message = "the prefix list must be IPv4"
  }

  assert {
    condition     = toset([for e in aws_ec2_managed_prefix_list.cloudflare.entry : e.cidr]) == toset(var.cloudflare_ipv4_cidrs)
    error_message = "the prefix list must hold exactly the given Cloudflare ranges"
  }

  assert {
    condition     = aws_ec2_managed_prefix_list.cloudflare.max_entries >= length(var.cloudflare_ipv4_cidrs) && aws_ec2_managed_prefix_list.cloudflare.max_entries <= length(var.cloudflare_ipv4_cidrs) + 10
    error_message = "max_entries must leave a little headroom and no more: it counts toward the security group's rule quota"
  }
}

run "security_group_admits_https_from_cloudflare_only_and_egresses_to_the_tasks" {
  command = apply

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.https.from_port == 443
      && aws_vpc_security_group_ingress_rule.https.to_port == 443
      && aws_vpc_security_group_ingress_rule.https.ip_protocol == "tcp"
    )
    error_message = "the only ingress is TCP 443"
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.https.prefix_list_id == aws_ec2_managed_prefix_list.cloudflare.id
    error_message = "the source must be the Cloudflare prefix list"
  }

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.https.cidr_ipv4 == null
      && aws_vpc_security_group_ingress_rule.https.cidr_ipv6 == null
      && aws_vpc_security_group_ingress_rule.https.referenced_security_group_id == null
    )
    error_message = "no CIDR source is allowed, so never 0.0.0.0/0"
  }

  assert {
    condition     = length(aws_vpc_security_group_egress_rule.to_service) == 2
    error_message = "one egress rule per service"
  }

  assert {
    condition = (
      aws_vpc_security_group_egress_rule.to_service["platform-api"].from_port == 3000
      && aws_vpc_security_group_egress_rule.to_service["platform-api"].to_port == 3000
      && aws_vpc_security_group_egress_rule.to_service["platform-api"].referenced_security_group_id == "sg-0aaa"
      && aws_vpc_security_group_egress_rule.to_service["game-server"].from_port == 2567
      && aws_vpc_security_group_egress_rule.to_service["game-server"].to_port == 2567
      && aws_vpc_security_group_egress_rule.to_service["game-server"].referenced_security_group_id == "sg-0bbb"
    )
    error_message = "egress goes only to each task group on its container port"
  }

  assert {
    condition     = alltrue([for r in aws_vpc_security_group_egress_rule.to_service : r.cidr_ipv4 == null && r.cidr_ipv6 == null])
    error_message = "no egress rule may use a CIDR"
  }

  assert {
    condition     = length(aws_security_group.this.ingress) == 0 && length(aws_security_group.this.egress) == 0
    error_message = "the group must carry no inline rules"
  }
}

run "target_groups_are_ip_targets_with_real_health_checks" {
  command = plan

  assert {
    condition     = alltrue([for t in aws_lb_target_group.service : t.target_type == "ip" && t.protocol == "HTTP"])
    error_message = "target groups must be HTTP and of type ip (awsvpc tasks)"
  }

  assert {
    condition     = aws_lb_target_group.service["platform-api"].port == 3000 && aws_lb_target_group.service["game-server"].port == 2567
    error_message = "target group ports must be the container ports"
  }

  assert {
    condition     = alltrue([for t in aws_lb_target_group.service : one(t.health_check).path == "/health" && one(t.health_check).matcher == "200"])
    error_message = "health checks must be a real GET expecting exactly 200, never a catch-all matcher"
  }

  assert {
    condition     = aws_lb_target_group.service["game-server"].deregistration_delay == "120"
    error_message = "the game-server deregistration delay must be 120 s"
  }

  assert {
    condition     = alltrue([for t in aws_lb_target_group.service : length(t.name) <= 32])
    error_message = "ALB target group names are limited to 32 characters"
  }
}

run "each_hostname_has_its_own_host_header_rule_and_priority" {
  command = apply

  assert {
    condition     = one(one(aws_lb_listener_rule.host["platform-api"].condition).host_header).values == toset(["eldritch-aws-api.heronoa.com.br"])
    error_message = "the platform-api rule must match only its hostname"
  }

  assert {
    condition     = one(one(aws_lb_listener_rule.host["game-server"].condition).host_header).values == toset(["eldritch-aws-game.heronoa.com.br"])
    error_message = "the game-server rule must match only its hostname"
  }

  assert {
    condition     = length(distinct([for r in aws_lb_listener_rule.host : r.priority])) == 2
    error_message = "rule priorities must be distinct"
  }

  assert {
    condition = alltrue([
      for k, r in aws_lb_listener_rule.host :
      one(r.action).type == "forward" && one(r.action).target_group_arn == aws_lb_target_group.service[k].arn
    ])
    error_message = "each rule must forward to its own target group"
  }
}
