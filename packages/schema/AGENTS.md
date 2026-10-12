# `@soryos/schema` Agent Operating Guidelines

## Overview
This package is the **source of truth for all domain types, contracts, and interfaces** in SoryOS-Code.

## Key Types
- `ActiveWorkspace`, `WorkspaceStatus`, `ProviderId`
- `SessionData`, `MessageBlock`, `ToolStep`
- `AgentEventPayload`, `ToolDefinition`, `ToolExecutionResult`

## Agent Guidelines
- All shared domain interfaces MUST be defined in `packages/schema/src/index.ts`.
- Never create duplicate type definitions in `apps/web/` or individual packages.
