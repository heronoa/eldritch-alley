resource "aws_ecs_cluster" "this" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }
}

# Under /eldritch-alley/, the prefix the deploy role is allowed to read for run-task.
resource "aws_cloudwatch_log_group" "service" {
  for_each = var.service_names

  name              = "/eldritch-alley/${var.name}/${each.key}"
  retention_in_days = var.log_retention_days
}
