# ssm-parameters

Creates SSM parameters under a prefix with a fixed placeholder value and `ignore_changes = [value]`. Terraform never holds a real secret: the real value is put by hand and a later apply leaves it alone.

| Input | Description |
|---|---|
| `prefix` | Path prefix, for example `/eldritch-alley/prod` |
| `parameters` | Map of name to `{ type, description }`; `type` is `String` or `SecureString` |

| Output | Description |
|---|---|
| `prefix` | The prefix |
| `parameter_arns` | Map keyed by name |

## Putting a value

Use a prompt so the value never lands in shell history:

```
read -rs -p "value: " V; echo
aws ssm put-parameter --name /eldritch-alley/prod/SESSION_SECRET --type SecureString --overwrite --value "$V"
unset V
```

Generate the ticket key pair offline (for example `openssl genpkey -algorithm ed25519`) and put each half the same way. Do not use `tls_private_key`: it would write the private key to the state.

`ignore_changes` is not covered by `terraform test`; it is covered by review of `main.tf`.

Tests: `terraform test` from this directory (mocked provider, no credentials).
