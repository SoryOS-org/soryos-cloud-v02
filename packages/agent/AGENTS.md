# `@soryos/agent` Agent Operating Guidelines

## Overview
This package houses the core autonomous **`AgentRuntime`** and agent matrix (`build`, `plan`, `explore`, `code-reviewer`).

## Responsibilities
- Drive multi-turn inference loops with LLMs.
- Parse tool calls and delegate to `@soryos/tool`.
- Enforce role permissions via `@soryos/permissions`.
- Stream real-time events (`agent.started`, `agent.completed`, `agent.failed`) over `@soryos/bus`.
- Handle errors with comprehensive classification and recovery via `ErrorRecoveryManager`.

## Key Files
- `src/index.ts`: Primary export point for `AgentRuntime`, `agentRuntime`, and agent matrix configuration.
- `src/runtime.ts`: Core agent execution engine with multi-turn support and streaming.
- `src/error-handler.ts`: Error classification and recovery system with 10+ error types.
- `src/config.ts`: Agent configuration and matrix definitions.
- `src/providers.ts`: AI provider abstraction.
- `src/types.ts`: Type definitions.

## Agent Guidelines
- Never bypass `@soryos/permissions`.
- If an agent role is `plan` or `explore`, writes and shell commands MUST be blocked.
- Always handle LLM API errors gracefully and report exact failure causes.
- Use `ErrorRecoveryManager` for error classification and recovery.
- Always preserve session state on errors when appropriate.
- Provide user-friendly error messages with recovery suggestions.

## Error Handling
The package includes a comprehensive error recovery system inspired by Vibra Code's onFailure handler:

### Error Types (10+ classified types)
- **timeout**: Operation took too long (retryable)
- **sandbox_terminated**: Sandbox was terminated (retryable)
- **sandbox_not_ready**: Sandbox still initializing (retryable)
- **network_error**: Network connectivity issues (retryable)
- **rate_limit**: API rate limit exceeded (retryable)
- **permission_denied**: Insufficient permissions (not retryable)
- **invalid_input**: Invalid parameters (not retryable)
- **resource_exhausted**: Out of resources (not retryable)
- **internal_error**: Internal system errors (retryable)
- **validation_error**: Schema validation failed (not retryable)
- **canceled**: Operation was canceled (not retryable)
- **session_expired**: Session has expired (not retryable)
- **git_error**: Git operations failed (not retryable)
- **build_failed**: Build process failed (not retryable)

### Error Recovery Features
- **Automatic Classification**: Errors are automatically classified based on message patterns
- **Retry Logic**: Exponential backoff for retryable errors (base 100ms, max 30s)
- **Session Preservation**: Session state is preserved for recoverable errors
- **User Notifications**: User-friendly messages with recovery suggestions
- **Event Streaming**: Error events streamed via `@soryos/bus`
- **Custom Error Classes**: Type-safe error handling with dedicated classes
