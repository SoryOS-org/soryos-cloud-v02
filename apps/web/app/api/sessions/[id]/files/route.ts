import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@soryos/session";
import { GitHubRemoteFilesystem } from "@soryos/filesystem";
import type { SessionData } from "@soryos/schema";

/**
 * Gestion des fichiers d'une session.
 * Utilise UNIQUEMENT @soryos/* - Aucune logique métier ici.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session: SessionData | undefined = sessionStore.get(id);

  if (!session) {
    return NextResponse.json({ paths: [] });
  }

  // If session files are empty but session is connected to a remote GitHub Codespace / repo, fetch live
  if (
    Object.keys(session.files).length === 0 &&
    (session.providerId === "github-codespaces" || session.providerId === "github-repository") &&
    session.repository
  ) {
    try {
      const fs = new GitHubRemoteFilesystem(id, session.repository, session.branch || "main");
      const entries = await fs.listFiles();
      for (const entry of entries) {
        if (entry.type === "file") {
          session.files[entry.path] = "";
        }
      }
    } catch (e) {
      console.warn("Auto-sync remote files in files GET warning:", e);
    }
  }

  const paths = Object.keys(session.files);
  return NextResponse.json({ paths });
}

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
    const body = await req.json();
    const { action, path, newPath, content = "" } = body;

    const normalize = (p: string) =>
      p
        .replace(/^\/home\/user\//, "")
        .replace(/^home\/user\//, "")
        .replace(/^\.\//, "")
        .replace(/^\/+/, "");

    if (action === "create_file" && path) {
      const cleanPath = normalize(path);
      session.files[cleanPath] = content;
      sessionStore.save(session);
      return NextResponse.json({ success: true, path: cleanPath });
    }

    if (action === "create_folder" && path) {
      const cleanPath = normalize(path);
      const placeholder = `${cleanPath}/.gitkeep`;
      session.files[placeholder] = "";
      sessionStore.save(session);
      return NextResponse.json({ success: true, path: cleanPath });
    }

    if (action === "rename" && path && newPath) {
      const oldClean = normalize(path);
      const newClean = normalize(newPath);

      const isDirectory =
        !session.files[oldClean] &&
        Object.keys(session.files).some((p) => p.startsWith(`${oldClean}/`));

      if (isDirectory) {
        const matching = Object.keys(session.files).filter((p) =>
          p.startsWith(`${oldClean}/`)
        );
        for (const oldKey of matching) {
          const suffix = oldKey.slice(oldClean.length);
          session.files[`${newClean}${suffix}`] = session.files[oldKey];
          delete session.files[oldKey];
        }
      } else {
        const existingContent = session.files[oldClean] ?? "";
        session.files[newClean] = existingContent;
        delete session.files[oldClean];
      }

      sessionStore.save(session);
      return NextResponse.json({ success: true, oldPath: oldClean, newPath: newClean });
    }

    if (action === "delete" && path) {
      const cleanPath = normalize(path);
      delete session.files[cleanPath];
      const subtreeKeys = Object.keys(session.files).filter((p) =>
        p.startsWith(`${cleanPath}/`)
      );
      for (const k of subtreeKeys) {
        delete session.files[k];
      }
      sessionStore.save(session);
      return NextResponse.json({ success: true, deleted: [cleanPath, ...subtreeKeys] });
    }

    if (action === "save" && path) {
      const cleanPath = normalize(path);
      session.files[cleanPath] = content;
      sessionStore.save(session);
      return NextResponse.json({ success: true, path: cleanPath });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
