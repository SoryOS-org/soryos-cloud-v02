# `@soryos/permissions` Agent Operating Guidelines

## Overview
This package manages granular role-based security policies (`PermissionsManager`).

## Roles & Policies
- **`build`**: Full read, write, and shell execution access.
- **`plan`**: Read-only access. Write and shell execution calls are blocked and throw `PermissionDeniedError`.
- **`explore`**: Read, glob, and grep search access.
- **`code-reviewer`**: Read and test suite execution access.

## Agent Guidelines
- Always call `permissionsManager.validatePermission(agentRole, actionType, pathOrCommand)` before executing tools.
