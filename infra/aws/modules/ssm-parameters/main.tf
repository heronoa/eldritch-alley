# The placeholder is the only value Terraform ever writes. The real value is put
# with `aws ssm put-parameter`, and ignore_changes keeps a later apply from
# overwriting it. No real secret ever enters the state.
resource "aws_ssm_parameter" "this" {
  for_each = var.parameters

  name        = "${var.prefix}/${each.key}"
  type        = each.value.type
  description = each.value.description
  value       = "placeholder-set-by-hand"

  lifecycle {
    ignore_changes = [value]
  }
}
