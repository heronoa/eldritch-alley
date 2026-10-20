output "vpc_id" {
  description = "VPC id"
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet ids, one per availability zone"
  value       = [for s in aws_subnet.public : s.id]
}

output "isolated_subnet_ids" {
  description = "Isolated subnet ids, one per availability zone"
  value       = [for s in aws_subnet.isolated : s.id]
}

output "availability_zones" {
  description = "The two availability zones in use"
  value       = local.azs
}

output "s3_gateway_endpoint_id" {
  description = "S3 gateway endpoint id"
  value       = aws_vpc_endpoint.s3.id
}
