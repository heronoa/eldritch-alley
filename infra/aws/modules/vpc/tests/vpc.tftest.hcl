# No credentials, no network access: terraform test with a mocked provider.
# Run from infra/aws/modules/vpc/ with `terraform test`.
#
# The route and endpoint assertions use `command = apply` because they compare
# ids that only exist after creation; mock_provider synthesizes them locally,
# so AWS is never touched.

mock_provider "aws" {}

override_data {
  target = data.aws_availability_zones.available
  values = {
    names = ["us-east-1a", "us-east-1b"]
  }
}

variables {
  name     = "eldritch-prod"
  vpc_cidr = "10.1.0.0/16"
  region   = "us-east-1"
}

run "two_public_and_two_isolated_subnets_in_two_zones" {
  command = plan

  assert {
    condition     = length(aws_subnet.public) == 2 && length(aws_subnet.isolated) == 2
    error_message = "expected two public and two isolated subnets"
  }

  assert {
    condition     = length(distinct([for s in aws_subnet.public : s.availability_zone])) == 2
    error_message = "public subnets must sit in two distinct zones"
  }

  assert {
    condition     = length(distinct([for s in aws_subnet.isolated : s.availability_zone])) == 2
    error_message = "isolated subnets must sit in two distinct zones"
  }
}

run "subnet_cidrs_lie_inside_the_vpc_and_do_not_overlap" {
  command = plan

  assert {
    condition = alltrue([
      for s in concat(values(aws_subnet.public), values(aws_subnet.isolated)) : contains([for i in range(256) : cidrsubnet(var.vpc_cidr, 8, i)], s.cidr_block)
    ])
    error_message = "every subnet CIDR must be inside vpc_cidr"
  }

  assert {
    condition     = length(distinct([for s in concat(values(aws_subnet.public), values(aws_subnet.isolated)) : s.cidr_block])) == 4
    error_message = "subnet CIDRs must be distinct"
  }
}

run "public_default_route_goes_to_the_internet_gateway_only" {
  command = apply

  assert {
    condition     = aws_route.public_internet.destination_cidr_block == "0.0.0.0/0"
    error_message = "the public route table needs a default route"
  }

  assert {
    condition     = aws_route.public_internet.route_table_id == aws_route_table.public.id
    error_message = "the default route must be on the public route table"
  }

  assert {
    condition     = aws_route.public_internet.route_table_id != aws_route_table.isolated.id
    error_message = "the isolated route table must never receive the default route"
  }

  assert {
    condition     = aws_route.public_internet.gateway_id == aws_internet_gateway.this.id && aws_route.public_internet.nat_gateway_id == null
    error_message = "the default route must target the internet gateway, never a NAT gateway"
  }
}

run "s3_gateway_endpoint_is_on_public_route_tables_only" {
  command = apply

  assert {
    condition     = aws_vpc_endpoint.s3.vpc_endpoint_type == "Gateway" && aws_vpc_endpoint.s3.service_name == "com.amazonaws.us-east-1.s3"
    error_message = "expected a Gateway endpoint for S3 in the configured region"
  }

  assert {
    condition     = contains(aws_vpc_endpoint.s3.route_table_ids, aws_route_table.public.id)
    error_message = "the S3 endpoint must be attached to the public route table"
  }

  assert {
    condition     = !contains(aws_vpc_endpoint.s3.route_table_ids, aws_route_table.isolated.id)
    error_message = "the S3 endpoint must not be attached to the isolated route table"
  }
}

run "outputs_expose_the_subnet_ids" {
  command = apply

  assert {
    condition     = length(output.public_subnet_ids) == 2 && length(output.isolated_subnet_ids) == 2
    error_message = "outputs must list both subnets of each tier"
  }
}
