# Partial configuration: bucket, key, region, encrypt and use_lockfile come from
# backend.hcl (gitignored, see backend.hcl.example) or from -backend-config in CI.
terraform {
  backend "s3" {}
}
