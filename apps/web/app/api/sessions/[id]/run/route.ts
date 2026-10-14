import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@soryos/session";
import { agentRuntime } from "@soryos/agent";
import type { SessionData } from "@soryos/schema";

/**
 * Démarre l'exécution de l'agent pour une session.
 * Utilise UNIQUEMENT @soryos/* - Aucune logique métier ici.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session: SessionData | undefined = sessionStore.get(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.agent_running) {
    return new NextResponse("Session already running", { status: 409 });
  }

  // Crée un stream SSE qui délègue à @soryos/agent
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: any) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed by client
        }
      }

      try {
        // executePlan pauses when agent_running is explicitly false; mark the
        // session as running for the duration of this stream.
        sessionStore.update(id, { agent_running: true });
        await agentRuntime.run({ sessionId: id, emit: send });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
      } finally {
        const current = sessionStore.get(id);
        if (current) {
          current.agent_running = false;
          sessionStore.save(current);
        }
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
