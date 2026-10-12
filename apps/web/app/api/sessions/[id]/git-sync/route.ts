import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@soryos/session";
import { sandboxManager } from "@soryos/sandbox";
import { gitSyncManager } from "@soryos/sandbox";
import type { SessionData, ProviderId } from "@soryos/schema";

/**
 * Synchronisation Git pour une session.
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

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "sync";

    // Get sandbox
    const { provider } = await sandboxManager.getOrCreateSandbox(id, session.providerId as ProviderId);

    if (action === "sync") {
      // Full sync
      const result = await gitSyncManager.sync(id, provider, session);
      return NextResponse.json(result);
    }

    if (action === "status") {
      const status = await gitSyncManager.getStatus(id, provider);
      return NextResponse.json(status);
    }

    if (action === "pull") {
      const result = await gitSyncManager.pull(id, provider);
      return NextResponse.json(result);
    }

    if (action === "push") {
      const result = await gitSyncManager.push(id, provider, body.message);
      return NextResponse.json(result);
    }

    if (action === "commit") {
      const result = await gitSyncManager.commit(id, provider, body.message);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Git sync failed" },
      { status: 500 }
    );
  }
}
