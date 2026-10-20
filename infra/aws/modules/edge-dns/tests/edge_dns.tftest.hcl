# No credentials, no network access. Run from infra/aws/modules/edge-dns/ with `terraform test`.

mock_provider "cloudflare" {}

variables {
  zone_id = "0123456789abcdef0123456789abcdef"
  hostnames = {
    "platform-api" = "eldritch-aws-api.heronoa.com.br"
    "game-server"  = "eldritch-aws-game.heronoa.com.br"
  }
  alb_dns_name = "eldritch-prod-123456789.us-east-1.elb.amazonaws.com"
  certificate_validation_options = {
    "eldritch-aws-api.heronoa.com.br" = {
      name  = "_abc.eldritch-aws-api.heronoa.com.br."
      type  = "CNAME"
      value = "_def.acm-validations.aws."
    }
    "eldritch-aws-game.heronoa.com.br" = {
      name  = "_ghi.eldritch-aws-game.heronoa.com.br."
      type  = "CNAME"
      value = "_jkl.acm-validations.aws."
    }
  }
}

run "hostnames_are_proxied_cnames_to_the_alb" {
  command = plan

  assert {
    condition     = length(cloudflare_dns_record.service) == 2
    error_message = "one record per hostname"
  }

  assert {
    condition = alltrue([
      for r in cloudflare_dns_record.service :
      r.type == "CNAME" && r.proxied == true && r.content == "eldritch-prod-123456789.us-east-1.elb.amazonaws.com" && r.ttl == 1
    ])
    error_message = "hostnames must be proxied CNAMEs to the ALB with automatic TTL"
  }

  assert {
    condition     = cloudflare_dns_record.service["platform-api"].name == "eldritch-aws-api.heronoa.com.br" && cloudflare_dns_record.service["game-server"].name == "eldritch-aws-game.heronoa.com.br"
    error_message = "each record must carry its hostname"
  }
}

run "certificate_validation_records_are_dns_only" {
  command = plan

  assert {
    condition     = length(cloudflare_dns_record.validation) == 2
    error_message = "one validation record per certificate name"
  }

  assert {
    condition     = alltrue([for r in cloudflare_dns_record.validation : r.proxied == false && r.type == "CNAME"])
    error_message = "validation records must be DNS-only CNAMEs"
  }

  assert {
    condition     = toset([for r in cloudflare_dns_record.validation : r.content]) == toset(["_def.acm-validations.aws", "_jkl.acm-validations.aws"])
    error_message = "validation records must carry ACM's values, without the trailing dot"
  }
}

run "validation_fqdns_are_exposed_without_the_trailing_dot" {
  command = apply

  assert {
    condition     = toset(output.validation_fqdns) == toset(["_abc.eldritch-aws-api.heronoa.com.br", "_ghi.eldritch-aws-game.heronoa.com.br"])
    error_message = "the ACM validation needs the record names without the trailing dot"
  }
}

run "nothing_is_created_when_dns_is_not_managed" {
  command = plan

  variables {
    manage_cloudflare_dns = false
  }

  assert {
    condition     = length(cloudflare_dns_record.service) == 0 && length(cloudflare_dns_record.validation) == 0
    error_message = "no record may exist when manage_cloudflare_dns is false"
  }

  assert {
    condition     = length(cloudflare_zone_setting.ssl) == 0
    error_message = "no zone setting may exist when DNS is not managed"
  }
}

run "zone_ssl_mode_is_off_by_default_because_it_is_zone_wide" {
  command = plan

  assert {
    condition     = length(cloudflare_zone_setting.ssl) == 0
    error_message = "the SSL mode is a zone-wide setting and must not change unless asked"
  }
}

run "zone_ssl_mode_is_full_strict_when_asked" {
  command = plan

  variables {
    manage_zone_ssl_mode = true
  }

  assert {
    condition     = one(cloudflare_zone_setting.ssl).setting_id == "ssl" && one(cloudflare_zone_setting.ssl).value == "strict"
    error_message = "the SSL mode must be Full (strict)"
  }
}
