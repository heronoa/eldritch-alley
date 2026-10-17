output "alb_arn" {
  description = "Load balancer ARN, for the WAF association"
  value       = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "Load balancer DNS name, the target of the proxied CNAMEs"
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Load balancer hosted zone id"
  value       = aws_lb.this.zone_id
}

output "alb_security_group_id" {
  description = "The load balancer's security group. The services admit ingress from it."
  value       = aws_security_group.this.id
}

output "target_group_arns" {
  description = "Target group ARNs keyed by service name"
  value       = { for k, t in aws_lb_target_group.service : k => t.arn }
}

output "certificate_arn" {
  description = "Issued certificate ARN"
  value       = aws_acm_certificate_validation.this.certificate_arn
}

output "certificate_validation_options" {
  description = "The DNS records that validate the certificate, keyed by hostname. The keys come from the inputs and only the values wait for the certificate, so a for_each over this is known at plan time."
  value = {
    for h in local.hostnames : h => one([
      for o in aws_acm_certificate.this.domain_validation_options : {
        name  = o.resource_record_name
        type  = o.resource_record_type
        value = o.resource_record_value
      } if o.domain_name == h
    ])
  }
}
