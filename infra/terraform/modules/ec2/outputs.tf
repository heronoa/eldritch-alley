output "instance_id" {
  description = "ID of the instance; use it with aws ssm start-session"
  value       = aws_instance.this.id
}

output "public_ip" {
  description = "Public IPv4 of the instance (outbound only; no inbound ports are open)"
  value       = aws_instance.this.public_ip
}

output "role_name" {
  description = "IAM role of the instance"
  value       = aws_iam_role.this.name
}
