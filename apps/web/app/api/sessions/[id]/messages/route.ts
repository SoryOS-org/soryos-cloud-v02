import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@soryos/session";
import { agentRuntime } from "@soryos/agent";
import type { SessionData } from "@soryos/schema";

/**
 * Envoie un message à une session et démarre l'agent.
 * Utilise UNIQUEMENT @soryos/* - Aucune logique métier ici.
 */
export async function POST(
  req: NextRequest,
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

  const body = await req.json().catch(() => ({}));
  const content = (body.content || "").trim();

  if (!content) {
    return NextResponse.json({ error: "Message content required" }, { status: 400 });
  }

  // Crée un stream SSE qui délègue à @soryos/agent
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      let assistantText = "";
      const now = () => new Date().toISOString();
      session.messages.push({ id: `user-${Date.now()}`, role: "user", content, created_at: now() });
      const startIndex = session.messages.length;
      let errorText = "";
      session.agent_running = true;
      sessionStore.save(session);

      function send(event: any) {
        if (event?.type === "text" && event.delta) assistantText += event.delta;
        if (event?.type === "error") errorText += `\n\n⚠️ ${event.message || "Erreur inconnue"}`;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed by client
        }
      }

      try {
        await agentRuntime.run({
          session,
          userMessage: content,
          modelId: body.model,
          agentId: body.agent,
          emit: send,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
      } finally {
        // The runtime already stores the streamed assistant reply; only add one
        // when nothing was stored, and attach provider errors so they stay visible.
        const stored = session.messages.slice(startIndex).filter((m) => m.role === "assistant");
        const last = stored[stored.length - 1];
        if (last) {
          if (assistantText.trim().length > last.content.length) last.content = assistantText.trim();
          if (errorText) last.content = `${last.content}${errorText}`.trim();
        } else {
          session.messages.push({
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content:
              `${assistantText}${errorText}`.trim() || "⚠️ Aucune réponse reçue du fournisseur IA.",
            created_at: now(),
          });
        }
        session.agent_running = false;
        sessionStore.save(session);
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
