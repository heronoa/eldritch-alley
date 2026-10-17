# No credentials, no network access. Run from infra/aws/modules/ecr-repos/ with `terraform test`.

mock_provider "aws" {}

variables {
  repository_names = ["eldritch-alley/prod/game-server", "eldritch-alley/prod/platform-api"]
}

run "repositories_are_immutable_and_scanned" {
  command = plan

  assert {
    condition     = length(aws_ecr_repository.this) == 2
    error_message = "one repository per name"
  }

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.image_tag_mutability == "IMMUTABLE"])
    error_message = "tags must be immutable"
  }

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.image_scanning_configuration[0].scan_on_push])
    error_message = "scan_on_push must be on"
  }

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.encryption_configuration[0].encryption_type == "AES256"])
    error_message = "repositories must use AES-256 encryption"
  }
}

run "force_delete_is_off_by_default" {
  command = plan

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.force_delete == false])
    error_message = "force_delete must be false when destroyable is false"
  }
}

run "force_delete_follows_destroyable" {
  command = plan

  variables {
    destroyable = true
  }

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.force_delete == true])
    error_message = "force_delete must be true when destroyable is true"
  }
}

run "lifecycle_keeps_twenty_tagged_and_expires_untagged_after_seven_days" {
  command = plan

  assert {
    condition     = length(aws_ecr_lifecycle_policy.this) == 2
    error_message = "one lifecycle policy per repository"
  }

  assert {
    condition = alltrue([
      for p in aws_ecr_lifecycle_policy.this :
      jsondecode(p.policy).rules[0].selection.tagStatus == "tagged"
      && jsondecode(p.policy).rules[0].selection.countType == "imageCountMoreThan"
      && jsondecode(p.policy).rules[0].selection.countNumber == 20
    ])
    error_message = "the first rule must keep the 20 most recent tagged images"
  }

  assert {
    condition = alltrue([
      for p in aws_ecr_lifecycle_policy.this :
      jsondecode(p.policy).rules[1].selection.tagStatus == "untagged"
      && jsondecode(p.policy).rules[1].selection.countType == "sinceImagePushed"
      && jsondecode(p.policy).rules[1].selection.countUnit == "days"
      && jsondecode(p.policy).rules[1].selection.countNumber == 7
    ])
    error_message = "the second rule must expire untagged images after 7 days"
  }
}
