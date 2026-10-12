# `@soryos/jobs` Agent Operating Guidelines

## Overview
This package provides background job processing inspired by Vibra Code's Inngest implementation. Enables long-running tasks, asynchronous processing, and reliable job execution.

## Responsibilities
- Provide `JobQueue` with concurrency control
- Manage job lifecycle: pending → running → completed/failed
- Support job prioritization (high, medium, low)
- Implement retry logic with exponential backoff
- Classify errors for appropriate handling
- Stream job progress and results
- Integrate with Inngest for production deployment

## Key Files
- `src/index.ts`: Main exports (JobQueue, Job types)
- `src/queue.ts`: JobQueue implementation with concurrency control
- `src/types.ts`: Job type definitions (Job, JobId, JobStatus, JobError)
- `src/client.ts`: Inngest client configuration
- `src/middleware.ts`: Shared middleware for job functions
- `src/functions/create-session.ts`: Session creation job
- `src/functions/run-agent.ts`: Agent execution job
- `src/functions/push-to-github.ts`: GitHub push job

## Architecture
```
JobQueue
├── Concurrency Control (max 25 concurrent jobs)
├── Priority Scheduling (high > medium > low)
├── Retry Logic (exponential backoff, max 3 retries)
├── Error Classification (10+ error types)
├── Timeout Management (default 15 minutes)
└── Event Streaming (real-time job updates)
```

## Agent Guidelines
- Use `JobQueue` for all long-running tasks
- Set appropriate priority for jobs (high for user-facing, low for background)
- Handle errors with proper classification for retry decisions
- Use exponential backoff for transient errors
- Stream progress updates for long-running jobs
- Clean up resources on job completion/failure

## Job Queue Configuration
- **maxConcurrency**: 25 (maximum concurrent jobs)
- **defaultTimeoutMs**: 900000 (15 minutes)
- **maxRetries**: 3 (maximum retry attempts)
- **retryBaseDelayMs**: 100 (base delay for exponential backoff)
- **maxDelay**: 30000 (30 seconds maximum retry delay)

## Error Classification
- **timeout**: Job exceeded timeout (retryable)
- **sandbox_terminated**: Sandbox was terminated (retryable)
- **network_error**: Network connectivity issue (retryable)
- **rate_limit**: API rate limit exceeded (retryable)
- **permission_denied**: Insufficient permissions (not retryable)
- **invalid_input**: Invalid job parameters (not retryable)
- **resource_exhausted**: Out of resources (not retryable)
- **internal_error**: Internal system error (retryable)
- **validation_error**: Schema validation failed (not retryable)
- **canceled**: Job was explicitly canceled (not retryable)

## Inngest Integration
- Jobs can be deployed to Inngest for production
- Functions are defined in `src/functions/`
- Middleware provides shared utilities
- Supports function chaining and workflows

## Job Functions
- **create-session**: Create and initialize a new sandbox session
- **run-agent**: Execute agent in sandbox with streaming
- **push-to-github**: Push changes to GitHub repository
