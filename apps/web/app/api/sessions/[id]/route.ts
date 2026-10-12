import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@soryos/session";
import { sandboxManager } from "@soryos/sandbox";
import type { SessionData, ProviderId } from "@soryos/schema";

/**
 * Gestion des sessions (GET, PATCH, DELETE).
 * Utilise UNIQUEMENT @soryos/* - Aucune logique métier ici.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session: SessionData = sessionStore.getOrCreate(id);

  return NextResponse.json({
    id: session.id,
    title: session.title,
    sandbox_id: session.sandbox_id,
    sandbox_state: session.sandbox_state,
    environment: session.environment || (session.providerId === "local" ? "local" : "sandbox"),
    providerId: session.providerId || "local",
    codespaceId: session.codespaceId,
    repository: session.repository,
    branch: session.branch,
    workspaceState: session.workspaceState || "WORKSPACE_READY",
    workspaceError: session.workspaceError,
    cwd: session.cwd,
    model: session.model,
    provider: session.provider,
    messages: session.messages,
    files: session.files || {},
    preview_url: session.preview_url,
    needs_run: session.needs_run,
    agent_running: session.agent_running,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session: SessionData = sessionStore.getOrCreate(id);

  const body = await req.json().catch(() => ({}));

  // Update session properties
  if (body.title && typeof body.title === "string") {
    session.title = body.title.trim();
  }

  if (body.codespaceId) session.codespaceId = body.codespaceId;
  if (body.repository) session.repository = body.repository;
  if (body.branch) session.branch = body.branch;
  if (body.workspaceState) session.workspaceState = body.workspaceState;
  if (body.workspaceError) session.workspaceError = body.workspaceError;
  
  if (body.environment) {
    session.environment = body.environment as "sandbox" | "local";
    if (session.environment === "local") {
      session.providerId = "local";
    }
  }

  if (body.providerId) {
    const newProviderId = body.providerId as ProviderId;
    session.providerId = newProviderId;
    session.environment = newProviderId === "local" ? "local" : "sandbox";
  }

  // Switch sandbox provider if needed (only if providerId is explicitly set and not local)
  if (session.providerId && session.providerId !== "local") {
    try {
      const { sandboxId } = await sandboxManager.switchProvider(id, session.providerId);
      session.sandbox_id = sandboxId;
    } catch {
      // ignore
    }
  }

  // Save session
  sessionStore.save(session);

  return NextResponse.json({
    id: session.id,
    title: session.title,
    environment: session.environment,
    providerId: session.providerId,
    sandbox_id: session.sandbox_id,
    codespaceId: session.codespaceId,
    repository: session.repository,
    branch: session.branch,
    workspaceState: session.workspaceState,
    cwd: session.cwd,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = sessionStore.delete(id);
  if (!deleted) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, id });
}
