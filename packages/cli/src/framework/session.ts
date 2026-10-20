/**
 * Session — résolution de la session cible pour le CLI.
 * ENROULE la résolution partagée `@soryos/session` (`resolveSessionTarget`)
 * avec les valeurs par défaut du CLI (modèle, provider, cwd local).
 *
 * Les commandes `run` et `interactive` utilisent CE module : aucune
 * implémentation de résolution n'est dupliquée dans le CLI.
 */

import { SessionData } from "@soryos/schema";
import { resolveSessionTarget, type SessionTarget } from "@soryos/session";
import { aiProviderRegistry } from "@soryos/provider";
import { cliSessionSource } from "../cli-session-store";
import { str, bool } from "./flags";
import { detectProviderAndKey } from "./auth";

export interface CliSessionFlags {
  session?: string;
  continue?: boolean;
  fork?: boolean;
  model?: string;
  title?: string;
  auto?: boolean;
  format?: string;
  agent?: string;
}

export interface CliSessionResolution {
  target: SessionTarget;
  session: SessionData;
}

/**
 * Résout la session cible du CLI.
 * @throws Error honnête si les options sont contradictoires (`--fork` seul).
 */
export async function resolveCliSession(flags: CliSessionFlags): Promise<CliSessionResolution> {
  const creds = await detectProviderAndKey();

  // Modèle par défaut = celui du provider détecté (pas un modèle codé en dur).
  let defaultModel = "gemini-2.5-flash";
  if (creds?.providerId) {
    try {
      defaultModel = aiProviderRegistry.getRequiredProvider(creds.providerId).getDefaultModel();
    } catch {
      /* provider inconnu du registre : on garde le défaut */
    }
  }

  const template: Partial<SessionData> = {
    title: str(flags, "title") ?? "CLI Session",
    model: str(flags, "model") ?? defaultModel,
    provider: creds?.provider ?? "Google Gemini",
    environment: "local",
    providerId: "local",
    cwd: process.cwd(),
    confirmDangerous: bool(flags, "auto"),
  };

  const { target, session } = await resolveSessionTarget(
    {
      sessionId: str(flags, "session") ?? undefined,
      continueLast: bool(flags, "continue"),
      fork: bool(flags, "fork"),
      title: str(flags, "title") ?? undefined,
      cwd: process.cwd(),
      template,
    },
    cliSessionSource,
  );

  return { target, session };
}
