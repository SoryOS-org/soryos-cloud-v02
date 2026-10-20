/**
 * Terminal UI primitives — bordered boxes, secret input, interactive picker.
 *
 * Mechanisms adapted from opencode's TUI (bordered prompt area, dialog
 * select with filter + cursor) but implemented in plain ANSI: no TUI
 * framework, no Solid, no opentui.
 */

import * as readline from "node:readline";
import { bold, cyan, dim, green, red, yellow } from "./ui";
import { TerminalInput, type TerminalKey } from "./input";

/* -------------------------------------------------------------------------- */
/* Boîtes bordées                                                             */
/* -------------------------------------------------------------------------- */

export interface BoxOptions {
  title?: string;
  /** Lignes du contenu (sans bordure). */
  lines?: string[];
  /** Largeur totale (bordures incluses). */
  width?: number;
}

/** Caractères de bordure (coins arrondis, comme opencode). */
const BOX = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
};

function visibleLength(text: string): number {
  // Ignore les codes ANSI pour l'alignement.
  return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").length;
}

function pad(text: string, width: number): string {
  const len = visibleLength(text);
  return len >= width ? text : text + " ".repeat(width - len);
}

/**
 * Dessine une boîte bordée (retourne les lignes, sans saut de ligne).
 */
export function drawBox(opts: BoxOptions): string[] {
  const width = Math.max(20, opts.width ?? 60);
  const inner = width - 4; // "│ " + " │"

  const title = opts.title
    ? ` ${opts.title} `
    : "";
  const topFill = Math.max(0, width - 2 - visibleLength(title));
  const top = `${BOX.topLeft}${title}${BOX.horizontal.repeat(topFill)}${BOX.topRight}`;

  const body = (opts.lines ?? []).map((line) => `${BOX.vertical} ${pad(line, inner)} ${BOX.vertical}`);

  return [top, ...body, `${BOX.bottomLeft}${BOX.horizontal.repeat(width - 2)}${BOX.bottomRight}`];
}

/** Affiche une boîte sur stderr. */
export function printBox(opts: BoxOptions): void {
  for (const line of drawBox(opts)) {
    process.stderr.write(`${line}\n`);
  }
}

/* -------------------------------------------------------------------------- */
/* Saisie de secret (masquée)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Lit une ligne en masquant la saisie (comme le champ password d'opencode).
 * @param prompt texte affiché avant la saisie
 * @param input gestionnaire partagé (créé à la demande si absent)
 * @returns la valeur saisie (vide si l'utilisateur annule)
 */
export async function readSecret(prompt: string, input?: TerminalInput): Promise<string> {
  const output = process.stderr;
  const terminal = input ?? new TerminalInput();
  const owned = !input;

  if (owned) terminal.start();
  output.write(prompt);

  return new Promise<string>((resolve) => {
    let value = "";

    const onKey = (key: TerminalKey) => {
      if (key.ctrl && (key.name === "c" || key.name === "d")) {
        output.write("\n");
        pop();
        if (owned) terminal.stop();
        resolve("");
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        output.write("\n");
        pop();
        if (owned) terminal.stop();
        resolve(value);
        return;
      }
      if (key.name === "backspace") {
        if (value.length) {
          value = value.slice(0, -1);
          output.write("\b \b");
        }
        return;
      }
      if (key.sequence && key.sequence >= " " && !key.ctrl && !key.meta) {
        value += key.sequence;
        output.write("*");
      }
    };

    const pop = terminal.push(onKey);
  });
}

/* -------------------------------------------------------------------------- */
/* Picker interactif                                                          */
/* -------------------------------------------------------------------------- */

export interface PickerOption<T> {
  value: T;
  title: string;
  description?: string;
  footer?: string;
  /** Groupe (affiché en tête de section). */
  category?: string;
}

export interface PickerOptions<T> {
  title: string;
  options: PickerOption<T>[];
  /** Ligne d'aide sous la liste. */
  hint?: string;
  /** Nombre d'options visibles. */
  visible?: number;
  /** Filtre activé (l'utilisateur tape pour filtrer). */
  filter?: boolean;
}

/**
 * Picker interactif : filtre au clavier, ↑/↓ pour naviguer, Entrée pour
 * choisir, Échap pour annuler.
 * @param input gestionnaire de clavier partagé (REPL + picker)
 * @returns la valeur choisie, ou null si annulé
 */
export async function pick<T>(
  opts: PickerOptions<T>,
  input: TerminalInput,
): Promise<T | null> {
  const visible = opts.visible ?? 10;
  const useFilter = opts.filter !== false && opts.options.length > visible;
  const output = process.stderr;

  let query = "";
  let index = 0;
  let offset = 0;
  let lastHeight = 0;

  const filtered = (): PickerOption<T>[] => {
    if (!query) return opts.options;
    const q = query.toLowerCase();
    return opts.options.filter((o) => {
      const hay = `${o.title} ${o.description ?? ""} ${o.category ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  };

  const render = () => {
    const list = filtered();

    if (index >= list.length) index = Math.max(0, list.length - 1);
    if (index < offset) offset = index;
    if (index >= offset + visible) offset = index - visible + 1;

    const lines: string[] = [];

    if (useFilter) {
      lines.push(`${dim("Filter:")} ${query}${dim("▌")}`);
    }

    if (!list.length) {
      lines.push(dim("  (no match)"));
    }

    let lastCategory: string | undefined;
    for (let i = offset; i < Math.min(list.length, offset + visible); i++) {
      const option = list[i];
      if (option.category && option.category !== lastCategory) {
        lastCategory = option.category;
        lines.push(dim(`  ${option.category}`));
      }
      const active = i === index;
      const marker = active ? cyan("❯") : " ";
      const title = active ? bold(cyan(option.title)) : option.title;
      const desc = option.description ? dim(` — ${truncate(option.description, 60)}`) : "";
      lines.push(`${marker} ${title}${desc}`);
    }

    if (list.length > visible) {
      lines.push(dim(`  … ${list.length - visible} more (↑/↓)`));
    }

    lines.push(dim(opts.hint ?? "↑/↓ navigate · enter select · esc cancel"));

    // Efface l'affichage précédent et redessine.
    if (lastHeight > 0) output.write(`\x1b[${lastHeight}A`);
    const box = drawBox({ title: opts.title, lines, width: 72 });
    for (const line of box) output.write(`${line}\n`);
    lastHeight = box.length;
  };

  return new Promise<T | null>((resolve) => {
    let done = false;

    const finish = (value: T | null) => {
      if (done) return;
      done = true;
      pop();
      if (lastHeight > 0) {
        output.write(`\x1b[${lastHeight}A`);
        output.write("\x1b[0J");
      }
      resolve(value);
    };

    const onKey = (key: TerminalKey) => {
      if (key.ctrl && key.name === "c") {
        finish(null);
        return;
      }
      if (key.name === "escape") {
        finish(null);
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        const list = filtered();
        const chosen = list[index];
        finish(chosen ? chosen.value : null);
        return;
      }
      if (key.name === "up") {
        index = Math.max(0, index - 1);
        render();
        return;
      }
      if (key.name === "down") {
        index = Math.min(filtered().length - 1, index + 1);
        render();
        return;
      }
      if (key.name === "backspace") {
        if (useFilter && query.length) {
          query = query.slice(0, -1);
          index = 0;
          offset = 0;
          render();
        }
        return;
      }
      if (useFilter && key.sequence && key.sequence >= " ") {
        query += key.sequence;
        index = 0;
        offset = 0;
        render();
      }
    };

    const pop = input.push(onKey);
    render();
  });
}

/** Tronque un texte long. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/* -------------------------------------------------------------------------- */
/* Confirmations                                                               */
/* -------------------------------------------------------------------------- */

/** Question oui/non (Entrée = oui par défaut). */
export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  return new Promise<boolean>((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(`${question} ${dim(`(${hint})`)} `, (answer) => {
      rl.close();
      const value = answer.trim().toLowerCase();
      if (!value) resolve(defaultYes);
      else resolve(value === "y" || value === "yes");
    });
  });
}

/** Message de succès (stderr). */
export function ok(message: string): void {
  process.stderr.write(`${green("✔")} ${message}\n`);
}

/** Message d'erreur (stderr). */
export function ko(message: string): void {
  process.stderr.write(`${red("✖")} ${message}\n`);
}

/** Message d'information (stderr). */
export function info(message: string): void {
  process.stderr.write(`${yellow("•")} ${message}\n`);
}
