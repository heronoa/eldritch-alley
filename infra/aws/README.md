# AWS infrastructure

Full architecture diagram, runbook, cost table and known limitations land with infra-06 (see the [delivery index](../../.ia_context/plans/infra-aws-prod.index.md)). This stub only states the one convention infra-01 establishes, so later steps follow it from the start:

`terraform test` lives under `<stack-or-module>/tests/*.tftest.hcl`, uses `mock_provider "aws" {}` (no credentials, no network access), and runs with `terraform test` from that directory. Where a resource's trust or policy document embeds a provider-computed value (an ARN known only after creation), the `run` block uses `command = apply` instead of `command = plan` — the mock provider still never touches AWS; it synthesizes the computed value locally so the assertion can decode and check the JSON. See [`bootstrap/tests/bootstrap.tftest.hcl`](bootstrap/tests/bootstrap.tftest.hcl) for the pattern.

Stacks:

- `bootstrap/` — state bucket, GitHub OIDC provider and the three CI roles (plan, apply, deploy). Local state; `backend.tf` is added by hand once the bucket exists (see the plan).
- `envs/stg/` — the existing EC2 staging environment (ROADMAP M2-b). Unchanged by this move except its path.
- `envs/prod/` — not created yet; arrives with infra-04.
