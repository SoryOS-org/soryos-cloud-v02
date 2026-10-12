# `@soryos/session` Agent Operating Guidelines

## Overview
This package manages session persistence, chat history, and conversation state across Next.js API requests and CLI runs.

## Responsibilities
- Provide `SessionStore` (`sessionStore` global singleton).
- Persist `SessionData` records.
- Retrieve, update, and list active workspace sessions.

## Agent Guidelines
- Always use `sessionStore.getOrCreate(sessionId)` to retrieve session data.
- Call `sessionStore.save(session)` whenever session state or messages are modified.
