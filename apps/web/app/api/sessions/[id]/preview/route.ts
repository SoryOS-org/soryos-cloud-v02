import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@soryos/session";
import { sandboxManager } from "@soryos/sandbox";
import type { SessionData } from "@soryos/schema";

/**
 * Récupère l'URL de prévisualisation pour une session.
 * Utilise UNIQUEMENT @soryos/* - Aucune logique métier ici.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session: SessionData | undefined = sessionStore.get(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    // Get sandbox and check if dev server is running
    const { provider } = await sandboxManager.getOrCreateSandbox(id, session.providerId || "local");
    const envInfo = await provider.getEnvironmentInfo();

    // Check for common dev server ports
    const devPorts = [3000, 3001, 4000, 5173, 8080];
    let previewUrl: string | null = null;

    for (const port of devPorts) {
      try {
        // Try to fetch from the port
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        const response = await fetch(`http://localhost:${port}`, {
          method: "HEAD",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          previewUrl = `http://localhost:${port}`;
          break;
        }
      } catch {
        // Port not available
      }
    }

    if (!previewUrl) {
      previewUrl = `/api/preview/${id}`;
    }

    return NextResponse.json({
      preview_url: previewUrl,
      status: "ready",
      cwd: envInfo.cwd,
    });
  } catch {
    return NextResponse.json({
      preview_url: `/api/preview/${id}`,
      status: "ready",
    });
  }
}
