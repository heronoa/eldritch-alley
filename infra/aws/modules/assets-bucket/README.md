# assets-bucket

Private S3 bucket for user assets: all four public-access blocks, bucket-owner-enforced ownership, SSE-S3, versioning, a TLS-only bucket policy, and CORS for one browser origin (`GET`, `PUT`, `HEAD`) so presigned URLs work. Non-current versions expire after 30 days and incomplete multipart uploads abort after 7.

Key convention for the future application code: `users/<user-uuid>/<kind>/<object-id>`. Only the platform-api task role may read or write, and only under `users/*`. That permission is granted on the role side in infra-04; this module grants no access to any role.

Nothing in the application uses this bucket yet.

| Input | Description |
|---|---|
| `name` | Globally unique bucket name (the caller includes the account id) |
| `cors_allowed_origin` | The one allowed origin |
| `destroyable` | `force_destroy`, default `false` |

| Output | Description |
|---|---|
| `bucket_name` | For the `ASSETS_BUCKET` variable |
| `bucket_arn` | For the task role policy |

Tests: `terraform test` from this directory (mocked provider, no credentials).
