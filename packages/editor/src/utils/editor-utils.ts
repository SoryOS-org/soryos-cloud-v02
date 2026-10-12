/**
 * @soryos/editor
 * Core editor utilities for multi-platform compatibility.
 */

import type { EditorSettings, EditorFile, EditorState, EditorTab } from "../types";

// Default editor settings
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 14,
  fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
  lineHeight: 1.5,
  tabSize: 2,
  useTabs: false,
  wordWrap: true,
  showLineNumbers: true,
  showGutter: true,
  showMinimap: false,
  showStatusBar: true,
  autoComplete: true,
  autoIndent: true,
  highlightActiveLine: true,
  highlightMatchingBrackets: true,
  theme: "system",
  planetTheme: "earth",
};

// Supported languages
export const SUPPORTED_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "java",
  "c",
  "cpp",
  "csharp",
  "go",
  "rust",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "dart",
  "scala",
  "elixir",
  "clojure",
  "haskell",
  "erlang",
  "lua",
  "perls",
  "r",
  "julia",
  "matlab",
  "sql",
  "html",
  "css",
  "scss",
  "less",
  "sass",
  "json",
  "yaml",
  "toml",
  "xml",
  "markdown",
  "text",
  "bash",
  "powershell",
  "dockerfile",
];

// Language extensions mapping
export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  java: "java",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  php: "php",
  rb: "ruby",
  swift: "swift",
  kt: "kotlin",
  dart: "dart",
  scala: "scala",
  ex: "elixir",
  exs: "elixir",
  clj: "clojure",
  cljs: "clojure",
  hs: "haskell",
  erl: "erlang",
  lua: "lua",
  pl: "perls",
  r: "r",
  jl: "julia",
  m: "matlab",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  sass: "sass",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  xml: "xml",
  md: "markdown",
  txt: "text",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ps1: "powershell",
  dockerfile: "dockerfile",
};

// Get language from file extension
export function getLanguageFromPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() || "";
  return LANGUAGE_EXTENSIONS[extension] || "text";
}

// Create a new editor file
export function createEditorFile(
  path: string,
  content: string = "",
  language?: string
): EditorFile {
  const fileLanguage = language || getLanguageFromPath(path);
  const name = path.split("/").pop() || "untitled";
  
  return {
    id: crypto.randomUUID(),
    path,
    name,
    content,
    language: fileLanguage,
    isDirty: false,
    isActive: false,
    encoding: "utf-8",
  };
}

// Create editor tab from file
export function createEditorTab(file: EditorFile): EditorTab {
  return {
    id: crypto.randomUUID(),
    fileId: file.id,
    title: file.name,
    isActive: file.isActive,
    isDirty: file.isDirty,
  };
}

// Initialize editor state
export function initializeEditorState(settings?: Partial<EditorSettings>): EditorState {
  return {
    files: [],
    activeFileId: null,
    tabs: [],
    settings: { ...DEFAULT_EDITOR_SETTINGS, ...settings },
    cursorPosition: { line: 1, column: 1 },
    selection: null,
    undoStack: [],
    redoStack: [],
  };
}

// Update file content
export function updateFileContent(
  state: EditorState,
  fileId: string,
  newContent: string
): EditorState {
  const updatedFiles = state.files.map((file) =>
    file.id === fileId ? { ...file, content: newContent, isDirty: true } : file
  );
  
  const updatedTabs = state.tabs.map((tab) =>
    tab.fileId === fileId ? { ...tab, isDirty: true } : tab
  );
  
  return {
    ...state,
    files: updatedFiles,
    tabs: updatedTabs,
  };
}

// Save file
export function saveFile(
  state: EditorState,
  fileId: string
): EditorState {
  const updatedFiles = state.files.map((file) =>
    file.id === fileId ? { ...file, isDirty: false } : file
  );
  
  const updatedTabs = state.tabs.map((tab) =>
    tab.fileId === fileId ? { ...tab, isDirty: false } : tab
  );
  
  return {
    ...state,
    files: updatedFiles,
    tabs: updatedTabs,
  };
}

// Open file
export function openFile(
  state: EditorState,
  fileId: string
): EditorState {
  // Close current active file
  const updatedFiles = state.files.map((file) => ({
    ...file,
    isActive: file.id === fileId,
  }));
  
  // Update tabs
  const updatedTabs = state.tabs.map((tab) => ({
    ...tab,
    isActive: tab.fileId === fileId,
  }));
  
  return {
    ...state,
    activeFileId: fileId,
    files: updatedFiles,
    tabs: updatedTabs,
  };
}

// Add new file
export function addFile(
  state: EditorState,
  file: EditorFile
): EditorState {
  const existingFileIndex = state.files.findIndex((f) => f.path === file.path);
  
  let updatedFiles: EditorFile[];
  if (existingFileIndex >= 0) {
    // Update existing file
    updatedFiles = state.files.map((f, index) =>
      index === existingFileIndex ? { ...f, ...file, isActive: false } : f
    );
  } else {
    // Add new file
    updatedFiles = [...state.files, file];
  }
  
  // If this is the first file, make it active
  const newActiveFileId = state.files.length === 0 ? file.id : state.activeFileId;
  
  // Update tabs
  const newTab = createEditorTab(file);
  const existingTabIndex = state.tabs.findIndex((t) => t.fileId === file.id);
  
  let updatedTabs: EditorTab[];
  if (existingTabIndex >= 0) {
    updatedTabs = state.tabs.map((t, index) =>
      index === existingTabIndex ? newTab : t
    );
  } else {
    updatedTabs = [...state.tabs, newTab];
  }
  
  return {
    ...state,
    files: updatedFiles,
    activeFileId: newActiveFileId,
    tabs: updatedTabs,
  };
}

// Close file
export function closeFile(
  state: EditorState,
  fileId: string
): EditorState {
  const fileIndex = state.files.findIndex((f) => f.id === fileId);
  if (fileIndex === -1) return state;
  
  const updatedFiles = state.files.filter((f) => f.id !== fileId);
  const updatedTabs = state.tabs.filter((t) => t.fileId !== fileId);
  
  // If we closed the active file, make the first remaining file active
  let newActiveFileId = state.activeFileId;
  if (state.activeFileId === fileId && updatedFiles.length > 0) {
    newActiveFileId = updatedFiles[0].id;
  } else if (state.activeFileId === fileId && updatedFiles.length === 0) {
    newActiveFileId = null;
  }
  
  // Update active state on remaining files
  const finalFiles = updatedFiles.map((file) => ({
    ...file,
    isActive: file.id === newActiveFileId,
  }));
  
  // Update active state on remaining tabs
  const finalTabs = updatedTabs.map((tab) => ({
    ...tab,
    isActive: tab.fileId === newActiveFileId,
  }));
  
  return {
    ...state,
    files: finalFiles,
    tabs: finalTabs,
    activeFileId: newActiveFileId,
  };
}

// Update editor settings
export function updateEditorSettings(
  state: EditorState,
  settings: Partial<EditorSettings>
): EditorState {
  return {
    ...state,
    settings: { ...state.settings, ...settings },
  };
}

// Get active file
export function getActiveFile(state: EditorState): EditorFile | null {
  if (!state.activeFileId) return null;
  return state.files.find((f) => f.id === state.activeFileId) || null;
}

// Get file by ID
export function getFileById(state: EditorState, fileId: string): EditorFile | null {
  return state.files.find((f) => f.id === fileId) || null;
}

// Get file by path
export function getFileByPath(state: EditorState, path: string): EditorFile | null {
  return state.files.find((f) => f.path === path) || null;
}
