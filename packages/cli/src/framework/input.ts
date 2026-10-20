/**
 * Terminal input — UNIQUE propriétaire de stdin en mode raw.
 *
 * Le REPL et les pickers (modèle, provider…) partagent le même gestionnaire :
 * une pile de handlers, le dernier actif reçoit les touches. Plus de conflit
 * entre `readline` et un picker (readline garde stdin pour lui).
 */

import { emitKeypressEvents } from "node:readline";

export interface TerminalKey {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence: string;
}

export type KeyHandler = (key: TerminalKey) => void;

export class TerminalInput {
  private stack: KeyHandler[] = [];
  private started = false;
  private wasRaw = false;

  /** Démarre la capture clavier (mode raw). */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.wasRaw = Boolean(process.stdin.isRaw);
    emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("keypress", (_str: string, key: TerminalKey) => {
      const handler = this.stack[this.stack.length - 1];
      if (!handler) return;
      try {
        handler(key);
      } catch {
        /* une erreur de handler ne doit pas casser la boucle */
      }
    });
  }

  /** Relâche stdin (et vide la pile de handlers). */
  stop(): void {
    this.stack = [];
    if (!this.started) return;
    this.started = false;
    if (process.stdin.isTTY) process.stdin.setRawMode?.(this.wasRaw);
    process.stdin.pause();
  }

  /** Empile un handler ; renvoie la fonction pour le dépiler. */
  push(handler: KeyHandler): () => void {
    this.stack.push(handler);
    return () => {
      const index = this.stack.indexOf(handler);
      if (index >= 0) this.stack.splice(index, 1);
    };
  }

  /** Nombre de handlers actifs. */
  get depth(): number {
    return this.stack.length;
  }
}
