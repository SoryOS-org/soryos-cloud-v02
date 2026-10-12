# `@soryos/codespaces` - GitHub Codespaces & VSCode Integration

## Overview

**`@soryos/codespaces`** is a specialized package that bridges **GitHub Codespaces** with **SoryOS-Code's autonomous agent system**, enabling real-time AI-powered development directly within a Codespaces environment.

### Key Capabilities
- 🔗 **Full VSCode Protocol Support** - LSP (Language Server Protocol), DAP (Debug Adapter Protocol), file watchers
- 🤖 **AI Agent Integration** - Seamless connection to `@soryos/agent` for code generation, refactoring, debugging
- ⚡ **Real-time Streaming** - Live terminal output, file changes, agent progress via WebSocket
- 🛠️ **Command Execution** - Full shell access with streaming output and error handling
- 📁 **File System Sync** - Bi-directional sync between Codespaces and SoryOS-Code
- 🔐 **Permission Enforcement** - Granular access control via `@soryos/permissions`
- 🚀 **Multi-Provider Support** - Works with E2B, Vercel, Codespaces, Cloud Run, Local
- 📊 **Execution Tracking** - Cost tracking, session management, history preservation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  VSCode Client (GitHub Codespaces)                         │
│  ├── Editor (Monaco)                                        │
│  ├── Terminal (PTY)                                         │
│  └── Extensions (including SoryOS-Code Extension)          │
└─────────────────┬───────────────────────────────────────────┘
                  │ VSCode Protocol (JSON-RPC)
┌─────────────────▼───────────────────────────────────────────┐
│  CodespacesServer (@soryos/codespaces)                      │
│  ├── LSP Handler (Language Services)                        │
│  ├── DAP Handler (Debugging)                                │
│  ├── File Watcher (Filesystem Events)                       │
│  ├── Terminal Manager (PTY Streaming)                       │
│  └── Agent Bridge (Autonomous Actions)                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┼─────────┐
        │         │         │
    ┌───▼───┐ ┌──▼────┐ ┌──▼──────┐
    │ Agent │ │ Tools │ │Execution│
    │       │ │       │ │Provider │
    └───────┘ └───────┘ └─────────┘
```

## Responsibilities

1. **VSCode Protocol Handling**
   - Implement JSON-RPC handlers for LSP operations (completion, hover, go-to-def, etc.)
   - Support DAP for debugging with breakpoints, stepping, variable inspection
   - Stream file change events to connected clients

2. **Agent Integration**
   - Provide command interface for agent operations (`/agent run`, `/agent plan`, etc.)
   - Route agent tool calls through `@soryos/tool`
   - Stream agent progress and tool outputs to terminal

3. **Real-time Streaming**
   - WebSocket connection management
   - SSE (Server-Sent Events) for long-running operations
   - Buffering and batching for efficiency

4. **File System Operations**
   - Watch for changes (create, modify, delete)
   - Sync with Codespaces editor
   - Verify ownership and permissions before modifications

5. **Terminal & Process Management**
   - Interactive PTY support via `@soryos/pty`
   - Shell command execution with streaming
   - Process lifecycle management

## Key Files

### Core
- **`src/index.ts`** - Main export point for `CodespacesServer` and helpers
- **`src/server.ts`** - HTTP/WebSocket server implementation
- **`src/protocol.ts`** - VSCode protocol message handlers
- **`src/lsp.ts`** - Language Server Protocol implementation
- **`src/dap.ts`** - Debug Adapter Protocol implementation

### Integration
- **`src/agent-bridge.ts`** - Connects agents to VSCode terminal/output
- **`src/file-watcher.ts`** - Monitors file system changes
- **`src/terminal-manager.ts`** - PTY stream management
- **`src/command-handler.ts`** - Slash commands (`/agent`, `/fix`, `/test`, etc.)

### Utilities
- **`src/types.ts`** - Type definitions for VSCode protocol
- **`src/utils.ts`** - Helper functions
- **`src/logger.ts`** - Debug logging

## Usage Example

### Server Setup
```typescript
import { createCodespacesServer } from '@soryos/codespaces';
import { agentRuntime } from '@soryos/agent';

const server = createCodespacesServer({
  port: 8080,
  workspaceRoot: process.cwd(),
  agent: agentRuntime,
  autoStart: true,
});

await server.start();
console.log('🚀 Codespaces server running on ws://localhost:8080');
```

### VSCode Extension Usage
```typescript
// From VSCode extension code
const client = new LanguageClient('soryos', 'SoryOS-Code', serverOptions, clientOptions);
await client.start();

// Trigger agent action
await vscode.commands.executeCommand('soryos.agent.run', {
  prompt: 'Add TypeScript strict mode to tsconfig.json',
  agent: 'build',
});

// Listen to agent events
client.onNotification('soryos/agentStarted', (data) => {
  console.log(`Agent started: ${data.sessionId}`);
});
```

### CLI Usage
```bash
# From Codespaces terminal
/agent run "Refactor the authentication module to use OAuth2"
/agent plan "Create a migration system"
/agent fix "Fix the build error in packages/agent"
/agent test "Run all tests and report coverage"
```

## Advantages Over Competitors

### vs Codex (OpenAI)
- ✅ **Real Execution** - Commands actually run; results are verified
- ✅ **Session Persistence** - Maintains context across multiple prompts
- ✅ **Multi-Agent** - Choose between build, plan, explore, review agents
- ✅ **Streaming** - Real-time output in terminal, not delayed responses
- ✅ **Error Recovery** - Automatic retry logic with exponential backoff
- ✅ **Permission Control** - Granular access based on agent role

### vs GitHub Copilot
- ✅ **Autonomous Execution** - Doesn't just suggest; actually modifies files
- ✅ **Terminal Integration** - Full shell access with streaming
- ✅ **Agent Roles** - Specialized agents for different tasks
- ✅ **Multi-Provider** - Works on any execution platform (E2B, local, cloud)
- ✅ **Cost Optimization** - Session-based pricing with auto-pause
- ✅ **Open Architecture** - Fully extensible and hackable

### vs Cursor
- ✅ **No Vendor Lock-in** - Open platform, not tied to Cursor
- ✅ **Multi-AI Provider** - Claude, Gemini, OpenAI, Mistral, Zen
- ✅ **Real Background Jobs** - Inngest-powered reliable task execution
- ✅ **Real Database** - Convex for persistent, real-time state
- ✅ **Monorepo Support** - Designed for complex workspaces
- ✅ **Tool Ecosystem** - 30+ built-in tools, easily extensible

### vs Continue.dev
- ✅ **Production Grade** - Battle-tested in production, not just IDE plugin
- ✅ **Backend Powered** - Not limited to local machine resources
- ✅ **Multi-Session** - Manage multiple projects simultaneously
- ✅ **Git Integration** - Auto-commit and push with AI descriptions
- ✅ **Web IDE** - Also available as web application, not IDE-only
- ✅ **Team Support** - Built-in multi-user, multi-workspace support

## Command Reference

### Agent Commands
| Command | Syntax | Example |
|---------|--------|---------|
| Run Agent | `/agent run "<prompt>"` | `/agent run "Add loading state to button"` |
| Plan | `/agent plan "<prompt>"` | `/agent plan "Design the database schema"` |
| Explore | `/agent explore "<pattern>"` | `/agent explore "Find all API endpoints"` |
| Review | `/agent review "<file>"` | `/agent review "apps/web/lib/auth.ts"` |
| Stop | `/agent stop` | `/agent stop` (terminates current agent) |

### Quick Fix Commands
| Command | Effect |
|---------|--------|
| `/fix "<error>"` | Attempt to fix error automatically |
| `/test "<suite>"` | Run test suite and report results |
| `/build` | Execute build process and report output |
| `/install` | Install dependencies and report status |
| `/lint` | Run linter and show violations |

### Developer Commands
| Command | Effect |
|---------|--------|
| `/debug <file>:<line>` | Set breakpoint and attach debugger |
| `/profile` | Profile agent performance metrics |
| `/cost` | Show current session cost |
| `/history` | Show session conversation history |
| `/clear` | Clear session state and start fresh |

## Configuration

### Environment Variables
```env
# Required
CODESPACES_NAME=my-workspace

# Optional
SORYOS_AGENT_ROLE=build          # build, plan, explore, code-reviewer
SORYOS_AI_PROVIDER=gemini         # gemini, openai, mistral, claude, zen
SORYOS_SANDBOX_PROVIDER=codespaces # codespaces, e2b, vercel, cloud-run, local
SORYOS_AUTO_SAVE=true            # Auto-save files on completion
SORYOS_AUTO_COMMIT=true          # Auto-commit changes to git
SORYOS_LOG_LEVEL=info            # debug, info, warn, error
```

### .soryosrc Configuration File
```json
{
  "codespaces": {
    "autoStart": true,
    "port": 8080,
    "protocol": "ws",
    "lspEnabled": true,
    "dapEnabled": true
  },
  "agent": {
    "defaultRole": "build",
    "timeout": 600000,
    "maxRetries": 3
  },
  "files": {
    "watchMode": true,
    "ignorePatterns": [".git", "node_modules", "dist"]
  },
  "terminal": {
    "streaming": true,
    "maxBufferSize": 4096
  }
}
```

## Integration Points

### With @soryos/agent
- Forward agent requests from terminal commands
- Stream tool outputs to VSCode terminal
- Handle agent lifecycle (start, pause, resume, stop)

### With @soryos/execution
- Execute shell commands from agent
- Manage sandboxes (E2B, Vercel, Codespaces)
- Stream command output with error handling

### With @soryos/tool
- Route agent tool calls (read_file, write_file, shell_command, etc.)
- Verify permissions before execution
- Report tool results and errors

### With @soryos/bus
- Publish agent events
- Subscribe to file changes
- Stream real-time updates to clients

### With @soryos/permissions
- Check agent role permissions
- Enforce file access policies
- Audit tool execution

## Testing

```bash
# Test all functionality
npm test

# Test specific components
npm run test -- --filter=lsp
npm run test -- --filter=dap
npm run test -- --filter=agent-bridge

# Test with live Codespaces instance
CODESPACES=true npm test
```

## Performance Considerations

1. **Streaming**: Large file operations are streamed, not buffered
2. **Debouncing**: File watcher events are debounced (100ms default)
3. **Connection Pooling**: Reuse WebSocket connections when possible
4. **Message Batching**: Buffer small events before sending
5. **Memory**: Process management with cleanup on completion

## Security

- ✅ **Ownership Verification**: Users can only access their Codespaces
- ✅ **Permission Enforcement**: Agent role limits determine tool access
- ✅ **Input Validation**: All CLI commands validated before execution
- ✅ **Process Isolation**: Each command runs in isolated context
- ✅ **Error Redaction**: Sensitive data removed from error messages

## Future Enhancements

- [ ] Collaborative debugging (multiple developers)
- [ ] GPU access for model inference
- [ ] Custom extension marketplace
- [ ] Advanced profiling and optimization tools
- [ ] ML-powered code completion
- [ ] Natural language test generation

---

**Status**: Implementation Ready
**Last Updated**: October 12, 2026
**Maintainers**: SoryOS Team
