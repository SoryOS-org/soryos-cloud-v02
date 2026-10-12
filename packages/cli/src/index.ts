#!/usr/bin/env node
/**
 * @soryos/cli
 * Real standalone CLI sharing the unified @soryos/agent runtime.
 */

import { agentRuntime } from "@soryos/agent";
import { globalEventBus } from "@soryos/bus";
import { AgentEventPayload, SessionData } from "@soryos/schema";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

export async function runCLI(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(`
${colors.bold}${colors.cyan}SoryOS-Code CLI${colors.reset} - Autonomous Coding Agent Engine

${colors.bold}USAGE:${colors.reset}
  soryos-code run "<prompt>" [options]
  soryos-code "<prompt>" [options]

${colors.bold}OPTIONS:${colors.reset}
  --session <id>     Session ID (default: creates new cli session)
  --agent <agent>    Agent role: build | plan | explore | code-reviewer (default: build)
  --model <model>    Model ID (default: gemini-3.8-flash)
  --help, -h         Show this message
`);
    return;
  }

  let prompt = "";
  let sessionId = `cli-${Date.now()}`;
  let agentId = "build";
  let modelId = "gemini-3.8-flash";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "run" && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      prompt = argv[++i];
    } else if (arg === "--session" && i + 1 < argv.length) {
      sessionId = argv[++i];
    } else if (arg === "--agent" && i + 1 < argv.length) {
      agentId = argv[++i];
    } else if (arg === "--model" && i + 1 < argv.length) {
      modelId = argv[++i];
    } else if (!arg.startsWith("--") && !prompt) {
      prompt = arg;
    }
  }

  if (!prompt) {
    console.error(`${colors.red}Error:${colors.reset} Prompt is required.`);
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) {
    console.error(`${colors.red}Error:${colors.reset} GEMINI_API_KEY environment variable is required.`);
    process.exit(1);
  }

  const session: SessionData = {
    id: sessionId,
    title: "CLI Session",
    sandbox_id: `sandbox-${sessionId}`,
    sandbox_state: "running",
    environment: "local",
    providerId: "local",
    model: modelId,
    provider: "Google Gemini",
    created_at: new Date().toISOString(),
    messages: [],
    files: {},
    preview_url: null,
    needs_run: false,
    agent_running: false,
    cwd: process.cwd(),
  };

  console.log(`\n${colors.bold}${colors.magenta}=== SoryOS-Code Autonomous Engine (CLI) ===${colors.reset}`);
  console.log(`${colors.dim}Session : ${sessionId}${colors.reset}`);
  console.log(`${colors.dim}Agent   : ${agentId}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}Prompt  : "${prompt}"${colors.reset}\n`);

  globalEventBus.on("*", (event: AgentEventPayload) => {
    if (event.sessionId !== sessionId) return;

    switch (event.type) {
      case "agent.started":
        console.log(`${colors.green}● Agent started${colors.reset}`);
        break;
      case "tool.started":
        console.log(`${colors.yellow}⚙ Executing tool:${colors.reset} ${colors.bold}${event.data.toolName}${colors.reset}`);
        break;
      case "tool.completed":
        console.log(`${colors.green}✔ Tool completed:${colors.reset} ${event.data.toolName}`);
        break;
      case "tool.failed":
        console.log(`${colors.red}✖ Tool failed:${colors.reset} ${event.data.toolName} - ${event.data.error}`);
        break;
      case "file.changed":
        console.log(`${colors.cyan}📄 File modified:${colors.reset} ${event.data.path} (${event.data.action})`);
        break;
      case "process.started":
        console.log(`${colors.blue}▶ Shell command:${colors.reset} ${event.data.command}`);
        break;
      case "process.exited":
        console.log(
          `${Number(event.data.exitCode) === 0 ? colors.green : colors.red}◀ Process exited with code ${
            event.data.exitCode
          } (${event.data.durationMs}ms)${colors.reset}`
        );
        break;
      case "agent.completed":
        console.log(
          `\n${colors.bold}${colors.green}✔ Agent task finished successfully (${event.data.stepsExecuted} steps, ${event.data.toolsExecuted} tools).${colors.reset}`
        );
        break;
      case "agent.failed":
        console.log(`\n${colors.bold}${colors.red}✖ Agent task failed: ${event.data.error}${colors.reset}`);
        break;
    }
  });

  const res = await agentRuntime.run({
    session,
    userMessage: prompt,
    modelId,
    agentId,
    apiKey,
    emit: (e: any) => {
      if (e.type === "text" && e.delta) {
        process.stdout.write(e.delta as string);
      }
    },
  });

  if (res.exitCode !== 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCLI().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
