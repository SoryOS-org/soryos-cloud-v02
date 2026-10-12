import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@soryos/session";

/**
 * Arrête l'exécution de l'agent pour une session.
 * Utilise UNIQUEMENT @soryos/* - Aucune logique métier ici.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = sessionStore.get(id);

  if (session) {
    session.agent_running = false;
    sessionStore.save(session);
  }

  return NextResponse.json({ ok: true });
}
