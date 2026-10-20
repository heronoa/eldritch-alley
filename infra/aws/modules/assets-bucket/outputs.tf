output "bucket_name" {
  description = "Bucket name, for the ASSETS_BUCKET variable"
  value       = aws_s3_bucket.this.bucket
}

output "bucket_arn" {
  description = "Bucket ARN, for the task role policy in infra-04"
  value       = aws_s3_bucket.this.arn
}
