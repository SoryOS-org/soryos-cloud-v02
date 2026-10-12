/**
 * @soryos/web
 * SSE Helper - WRAPPER ONLY
 * 
 * Ce fichier est UNIQUEMENT un wrapper qui délègue toute la logique 
 * vers les packages officiels @soryos/*.
 * 
 * NE JAMAIS mettre de logique métier ici.
 */

import type { SessionData } from "@soryos/schema";
import { agentRuntime } from "@soryos/agent";
import type { AgentEvent } from "./types";

/**
 * Crée un stream SSE pour l'exécution d'un agent.
 * @param session - La session à exécuter
 * @param userMessage - Message utilisateur (optionnel)
 * @param modelId - Modèle IA (optionnel)
 * @param agentId - Agent à utiliser (optionnel)
 * @returns Response avec le stream SSE
 */
export function createAgentStream(
  session: SessionData,
  userMessage?: string,
  modelId?: string,
  agentId?: string,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: AgentEvent) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream might be closed by client
        }
      }

      try {
        // Délégation vers @soryos/agent
        await agentRuntime.run({
          session,
          userMessage,
          modelId,
          agentId,
          emit: send,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
      } finally {
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
