# No credentials, no network access. Run from infra/aws/envs/prod/ with `terraform test`.

mock_provider "aws" {}

override_data {
  target = module.vpc.data.aws_availability_zones.available
  values = {
    names = ["us-east-1a", "us-east-1b"]
  }
}

run "composition_exposes_the_contract_for_infra_03_and_infra_04" {
  command = plan

  assert {
    condition     = output.ssm_prefix == "/eldritch-alley/prod"
    error_message = "the SSM prefix is part of the contract"
  }

  assert {
    condition     = length(output.public_subnet_ids) == 2 && length(output.isolated_subnet_ids) == 2
    error_message = "two subnets per tier"
  }

  assert {
    condition     = length(output.repository_urls) == 2
    error_message = "two ECR repositories"
  }
}

run "destroyable_is_false_by_default_across_the_stack" {
  command = plan

  assert {
    condition     = var.destroyable == false
    error_message = "the production stack must not be destroyable by default"
  }
}
