# sqs

A standard queue and its dead-letter queue, both with SSE-SQS. The main queue redrives to the dead-letter queue after `max_receive_count` receives; the dead-letter queue keeps messages for 14 days.

No queue policy is attached. Send and receive permissions are granted in the task roles (infra-04).

| Input | Description |
|---|---|
| `name` | Main queue name; the dead-letter queue is `<name>-dlq` |
| `visibility_timeout_seconds` | Default 30 (AWS default), a placeholder until the consumer exists. Must exceed the consumer's processing time |
| `max_receive_count` | Default 5 |

| Output | Description |
|---|---|
| `queue_url`, `queue_arn` | Main queue |
| `dlq_url`, `dlq_arn` | Dead-letter queue |

Tests: `terraform test` from this directory (mocked provider, no credentials).
