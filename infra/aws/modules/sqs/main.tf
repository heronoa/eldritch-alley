# The game-server publishes with MessageGroupId and MessageDeduplicationId, which a
# standard queue rejects, so both queues are FIFO. A FIFO name must end in .fifo, and
# a FIFO queue needs a FIFO dead-letter queue. Deduplication is by the explicit match
# id the publisher sends, never by content.
resource "aws_sqs_queue" "dlq" {
  name                        = "${var.name}-dlq.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  message_retention_seconds   = 1209600
  sqs_managed_sse_enabled     = true
}

resource "aws_sqs_queue" "main" {
  name                        = "${var.name}.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  visibility_timeout_seconds  = var.visibility_timeout_seconds
  sqs_managed_sse_enabled     = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })
}
