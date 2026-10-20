#!/bin/sh
# The queues the two backends talk over, created on LocalStack's first boot.
#
# LocalStack runs every script in /etc/localstack/init/ready.d once the services are up, so this is the
# local equivalent of the infrastructure a deployment is given by whatever provisions it. Nothing in the
# test suite depends on it: the suite runs against in-memory queues, and this exists so that
# `docker compose up` has the real thing to exercise.
set -e

# A FIFO dead-letter queue for a FIFO queue: SQS refuses the redrive policy otherwise. The suffix is not
# decoration either — a FIFO queue's name has to end in `.fifo`.
awslocal sqs create-queue \
  --queue-name match-ended-dlq.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=false

# The queue itself, and the redrive policy that makes a message the platform cannot store stop being
# retried: after five receives it goes to the dead-letter queue, which is where a person looks. The
# number is not decoration — `InMemoryMatchEndedQueue.DEFAULT_MAX_RECEIVE_COUNT` is the same five, so
# the fake the tests run against and the queue a deployment gets give up at the same point.
awslocal sqs create-queue \
  --queue-name match-ended.fifo \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "VisibilityTimeout": "30",
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:match-ended-dlq.fifo\",\"maxReceiveCount\":\"5\"}"
  }'

awslocal sqs list-queues
