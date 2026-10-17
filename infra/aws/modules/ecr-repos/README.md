# ecr-repos

One ECR repository per name: immutable tags, scan on push, AES-256 encryption. Lifecycle: keep the 20 most recent tagged images, expire untagged images after 7 days. Image tags follow `sha-<short git sha>`.

| Input | Description |
|---|---|
| `repository_names` | Set of repository names |
| `destroyable` | `force_delete` on every repository, default `false` |

| Output | Description |
|---|---|
| `repository_urls`, `repository_arns` | Maps keyed by repository name |

Tests: `terraform test` from this directory (mocked provider, no credentials).
