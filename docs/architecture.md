# SoryOS-Code Complete Architecture Documentation

## System Topology

```
SoryOS-Code Monorepo
│
├── apps/
│   ├── web/                # Next.js 16 + React 19 Web IDE
│   └── cli/                # Autonomous CLI engine (`soryos-code`)
│
└── packages/
    ├── schema/             # Central domain types & contracts
    ├── core/               # Base errors & exceptions
    ├── bus/                # GlobalEventBus real-time event stream
    ├── permissions/        # Role-based policy manager
    ├── execution/          # Physical command & file execution providers
    ├── tool/               # ToolRegistry & ToolExecutor
    ├── agent/              # AgentRuntime multi-turn loop
    ├── workspace/          # ActiveWorkspace manager
    ├── session/            # Persistent SessionStore
    ├── provider/           # Multi-model AI Provider Registry
    ├── filesystem/         # Filesystem manager
    ├── git/                # Git operations manager
    ├── pty/                # Interactive PTY manager
    ├── dev-runner/         # Dev server orchestrator
    ├── config/             # Config preferences manager
    └── auth/               # Auth & API key manager
```

## Data Flow Pipeline

1. **User Request** arrives via Web UI or CLI.
2. **`SessionStore`** retrieves or initializes `SessionData`.
3. **`AgentRuntime`** prepares context and selects the AI Model from `AIProviderRegistry`.
4. **LLM Inferences** emit text or tool calls.
5. **`ToolExecutor`** validates permissions via `PermissionsManager`.
6. **`ExecutionProvider`** executes physical disk writes, shell commands, or searches.
7. **`GlobalEventBus`** streams events (`tool.started`, `tool.completed`, `file.changed`) to UI & CLI in real time.
8. **Verification** is performed before completing the task.
