# sqs

A FIFO queue and its FIFO dead-letter queue, both with SSE-SQS. The queue is FIFO because the game-server publishes with `MessageGroupId` and `MessageDeduplicationId` (the match id), which a standard queue rejects; a queue cannot change type, so moving from standard to FIFO replaces it. The main queue redrives to the dead-letter queue after `max_receive_count` receives; the dead-letter queue keeps messages for 14 days.

No queue policy is attached. Send and receive permissions are granted in the task roles (infra-04).

| Input | Description |
|---|---|
| `name` | Main queue name without `.fifo`; the queues are `<name>.fifo` and `<name>-dlq.fifo` |
| `visibility_timeout_seconds` | Default 30 (AWS default), a placeholder until the consumer exists. Must exceed the consumer's processing time |
| `max_receive_count` | Default 5 |

| Output | Description |
|---|---|
| `queue_url`, `queue_arn` | Main queue |
| `dlq_url`, `dlq_arn` | Dead-letter queue |

Tests: `terraform test` from this directory (mocked provider, no credentials).
