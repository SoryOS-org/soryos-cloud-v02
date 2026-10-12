# `@soryos/tool` Agent Operating Guidelines

## Overview
This package houses the **`ToolRegistry`** and **`ToolExecutor`** responsible for executing all file operations, shell commands, and searches.

## Responsibilities
- Register tool definitions with Gemini-compatible schemas.
- Validate tool parameters against Zod/JSON schemas.
- Delegate execution to the active `ExecutionProvider`.
- Enforce the invariant: *"NO REAL ACTION = NO SUCCESS"*. Every tool MUST perform physical disk/shell actions and verify results.

## Registered Tools
- `read_file`: Reads file content with 1-based line numbers.
- `write_file`: Overwrites/creates pristine files on disk.
- `edit_file`: Surgically replaces target content in a file.
- `delete_file`: Safely deletes a file from disk.
- `shell_command`: Executes bash commands with a 60s timeout.
- `glob_files`: Matches files using glob patterns.
- `grep_search`: Searches regex or text patterns across files.
- `list_files`: Recursively lists directories and files.
- `todo_write` & `todo_read`: Manages task roadmaps.

## Agent Guidelines
- When adding a new tool, declare its schema in `ToolRegistry` and add its execution handler in `ToolExecutor`.
- Never fake tool execution results. Return real stdout, stderr, or filesystem outputs.
