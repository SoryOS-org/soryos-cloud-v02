import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@soryos/agent";
import { sessionStore } from "@soryos/session";
import { workspaceManager } from "@soryos/workspace";
import { runPipeline, type RunPipelineResult } from "@soryos/agent";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = sessionStore.get(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.agent_running) {
    return new NextResponse("Session already running", { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const agentId = body.agent || "build";
  const modelId = body.model;
  const { provider, apiKey } = (() => {
    if (body.apiKey) return { provider: "Google Gemini", apiKey: body.apiKey };
    if (process.env.GEMINI_API_KEY) return { provider: "Google Gemini", apiKey: process.env.GEMINI_API_KEY };
    if (process.env.GOOGLE_API_KEY) return { provider: "Google", apiKey: process.env.GOOGLE_API_KEY };
    if (process.env.OPENAI_API_KEY) return { provider: "OpenAI", apiKey: process.env.OPENAI_API_KEY };
    if (process.env.MISTRAL_API_KEY) return { provider: "Mistral", apiKey: process.env.MISTRAL_API_KEY };
    return { provider: null, apiKey: null };
  })();

  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const now = () => new Date().toISOString();
      let errorText = "";
      sessionStore.update(id, { agent_running: true });

      function send(event: any) {
        if (event?.type === "error") errorText += `\n\n⚠️ ${event.message || "Erreur inconnue"}`;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed by client
        }
      }

      try {
        const pipelineResult = await runPipeline(
          { sessionId: id, agentId, modelId, apiKey },
          (event) => send({ ...event, timestamp: Date.now() }),
        );

        if (pipelineResult.status === "completed") {
          const updated = sessionStore.get(id);
          const stored = updated ?? session;
          const assistantText = stored.messages.filter((m) => m.role === "assistant").pop()?.content || "";
          if (assistantText && assistantText !== stored.messages.at(-1)?.content) {
            sessionStore.update(id, { messages: stored.messages });
          }
          send({ type: "done", data: { stepsExecuted: pipelineResult.session.messages.length, toolsExecuted: 0 } });
        } else {
          send({ type: "error", message: pipelineResult.error });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
      } finally {
        sessionStore.update(id, { agent_running: false });
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
