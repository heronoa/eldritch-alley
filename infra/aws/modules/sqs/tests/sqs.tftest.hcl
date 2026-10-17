# No credentials, no network access. Run from infra/aws/modules/sqs/ with `terraform test`.
#
# `command = apply` because the redrive policy embeds the dead-letter queue ARN
# (a computed value) inside jsonencode(); the mock provider never touches AWS.

mock_provider "aws" {}

variables {
  name                       = "eldritch-prod-match-ended"
  visibility_timeout_seconds = 30
  max_receive_count          = 5
}

run "main_queue_redrives_to_the_dead_letter_queue_after_five_receives" {
  command = apply

  assert {
    condition     = jsondecode(aws_sqs_queue.main.redrive_policy).maxReceiveCount == 5
    error_message = "the redrive policy must move a message after 5 receives"
  }

  assert {
    condition     = jsondecode(aws_sqs_queue.main.redrive_policy).deadLetterTargetArn == aws_sqs_queue.dlq.arn
    error_message = "the redrive policy must target the dead-letter queue"
  }
}

run "dead_letter_queue_retains_messages_for_fourteen_days" {
  command = apply

  assert {
    condition     = aws_sqs_queue.dlq.message_retention_seconds == 1209600
    error_message = "the dead-letter queue must retain messages for 14 days"
  }
}

run "both_queues_are_encrypted_and_named_from_the_input" {
  command = apply

  assert {
    condition     = aws_sqs_queue.main.sqs_managed_sse_enabled && aws_sqs_queue.dlq.sqs_managed_sse_enabled
    error_message = "both queues must use SSE-SQS"
  }

  assert {
    condition     = aws_sqs_queue.main.name == "eldritch-prod-match-ended.fifo" && aws_sqs_queue.dlq.name == "eldritch-prod-match-ended-dlq.fifo"
    error_message = "queue names must derive from the name input and end in .fifo"
  }

  assert {
    condition     = aws_sqs_queue.main.visibility_timeout_seconds == 30
    error_message = "the visibility timeout must come from the variable"
  }
}

# The game-server publishes with MessageGroupId and MessageDeduplicationId, which a
# standard queue rejects. A queue cannot change type, and a FIFO name must end in .fifo.
run "both_queues_are_fifo_without_content_based_deduplication" {
  command = apply

  assert {
    condition     = aws_sqs_queue.main.fifo_queue && aws_sqs_queue.dlq.fifo_queue
    error_message = "both queues must be FIFO (a FIFO queue needs a FIFO dead-letter queue)"
  }

  assert {
    condition     = aws_sqs_queue.main.content_based_deduplication == false && aws_sqs_queue.dlq.content_based_deduplication == false
    error_message = "deduplication is by the explicit match id, never by content"
  }
}
