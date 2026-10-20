output "instance_id" {
  description = "Instance ID for SSM access"
  value       = module.ec2.instance_id
}

output "public_ip" {
  description = "Public IPv4 (outbound only)"
  value       = module.ec2.public_ip
}

output "ecr_repository_url" {
  description = "Push target for the game-server image"
  value       = module.ecr.repository_url
}

output "ssm_session_command" {
  description = "Opens a shell on the instance without SSH"
  value       = "aws ssm start-session --profile ${var.aws_profile} --region ${var.region} --target ${module.ec2.instance_id}"
}
