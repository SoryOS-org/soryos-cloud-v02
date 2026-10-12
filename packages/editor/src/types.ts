/**
 * @soryos/editor
 * Types for the code editor package.
 */

import type { ThemeTokens } from "@soryos/ui";

export type EditorTheme = "light" | "dark" | "system" | "planet";

export type PlanetEditorTheme = 
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto";

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  tabSize: number;
  useTabs: boolean;
  wordWrap: boolean;
  showLineNumbers: boolean;
  showGutter: boolean;
  showMinimap: boolean;
  showStatusBar: boolean;
  autoComplete: boolean;
  autoIndent: boolean;
  highlightActiveLine: boolean;
  highlightMatchingBrackets: boolean;
  theme: EditorTheme;
  planetTheme?: PlanetEditorTheme;
  customTokens?: Partial<ThemeTokens>;
}

export interface EditorFile {
  id: string;
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
  isActive: boolean;
  encoding: "utf-8" | "utf-16" | "base64";
}

export interface EditorTab {
  id: string;
  fileId: string;
  title: string;
  isActive: boolean;
  isDirty: boolean;
  icon?: string;
}

export interface EditorState {
  files: EditorFile[];
  activeFileId: string | null;
  tabs: EditorTab[];
  settings: EditorSettings;
  cursorPosition: { line: number; column: number };
  selection: { start: { line: number; column: number }; end: { line: number; column: number } } | null;
  undoStack: string[];
  redoStack: string[];
}

export interface SyntaxHighlightingOptions {
  enable: boolean;
  languages: string[];
  customThemes?: Record<string, {
    keywords: string;
    strings: string;
    comments: string;
    numbers: string;
    functions: string;
    variables: string;
  }>;
}

export interface EditorKeybindings {
  save: string;
  undo: string;
  redo: string;
  copy: string;
  cut: string;
  paste: string;
  selectAll: string;
  find: string;
  replace: string;
  newFile: string;
  openFile: string;
  closeTab: string;
  nextTab: string;
  previousTab: string;
}

export interface EditorEvent {
  type: "contentChange" | "fileOpen" | "fileClose" | "fileSave" | "settingsChange" | "themeChange";
  data: unknown;
  timestamp: number;
}

export interface EditorPlugin {
  id: string;
  name: string;
  description: string;
  initialize: (editor: unknown) => void;
  destroy: () => void;
  commands?: Record<string, () => void>;
}
