/**
 * @soryos/editor
 * Editor status bar component with planet-themed styling.
 */

"use client";

import React from "react";
import { cn } from "@soryos/ui";
import type { EditorSettings, EditorFile, PlanetEditorTheme } from "../types";

interface EditorStatusBarProps {
  file: EditorFile;
  cursorPosition: { line: number; column: number };
  selection: { start: { line: number; column: number }; end: { line: number; column: number } } | null;
  settings: EditorSettings;
  theme?: PlanetEditorTheme;
}

// Planet theme colors for status bar
const planetStatusBarColors = {
  mercury: "bg-gradient-to-r from-gray-700 to-gray-800",
  venus: "bg-gradient-to-r from-yellow-700 to-orange-800",
  earth: "bg-gradient-to-r from-blue-800 to-green-800",
  mars: "bg-gradient-to-r from-red-800 to-orange-800",
  jupiter: "bg-gradient-to-r from-purple-800 to-pink-800",
  saturn: "bg-gradient-to-r from-yellow-800 to-amber-800",
  uranus: "bg-gradient-to-r from-cyan-800 to-blue-800",
  neptune: "bg-gradient-to-r from-blue-800 to-indigo-800",
  pluto: "bg-gradient-to-r from-gray-800 to-slate-800",
};

const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
  file,
  cursorPosition,
  selection,
  settings,
  theme = "earth",
}) => {
  const colors = planetStatusBarColors[theme] || planetStatusBarColors.earth;

  // Calculate statistics
  const lines = file.content.split('\n').length;
  const characters = file.content.length;
  const words = file.content.trim() === '' ? 0 : file.content.trim().split(/\s+/).length;
  const size = new TextEncoder().encode(file.content).length;

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Get language icon
  const getLanguageIcon = (language: string): string => {
    const icons: Record<string, string> = {
      typescript: "🔵",
      javascript: "🟡",
      python: "🐍",
      java: "☕",
      go: "🔵",
      rust: "🦀",
      c: "🔵",
      cpp: "🔵",
      csharp: "🔵",
      php: "🐘",
      ruby: "🔴",
      swift: "🍎",
      kotlin: "🔵",
      dart: "🔵",
      scala: "🔴",
      html: "🌐",
      css: "🎨",
      json: "📋",
      yaml: "📄",
      markdown: "✏️",
      bash: "🐧",
      dockerfile: "🐳",
      text: "📝",
    };
    return icons[language] || "📄";
  };

  // Get encoding display name
  const getEncodingDisplay = (encoding: string): string => {
    const displayNames: Record<string, string> = {
      "utf-8": "UTF-8",
      "utf-16": "UTF-16",
      "base64": "Base64",
    };
    return displayNames[encoding] || encoding.toUpperCase();
  };

  return (
    <div 
      className={cn(
        "flex items-center justify-between px-4 py-2 text-sm",
        colors
      )}
    >
      {/* Left side */}
      <div className="flex items-center gap-4 text-white/90">
        <span className="flex items-center gap-2">
          <span>{getLanguageIcon(file.language)}</span>
          <span className="font-medium">{file.name}</span>
        </span>
        
        <span className="flex items-center gap-2">
          <span className="opacity-60">Encoding:</span>
          <span>{getEncodingDisplay(file.encoding)}</span>
        </span>
        
        <span className="flex items-center gap-2">
          <span className="opacity-60">Language:</span>
          <span>{file.language}</span>
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4 text-white/90">
        <span className="flex items-center gap-2">
          <span className="opacity-60">Lines:</span>
          <span>{lines}</span>
        </span>
        
        <span className="flex items-center gap-2">
          <span className="opacity-60">Words:</span>
          <span>{words}</span>
        </span>
        
        <span className="flex items-center gap-2">
          <span className="opacity-60">Chars:</span>
          <span>{characters}</span>
        </span>
        
        <span className="flex items-center gap-2">
          <span className="opacity-60">Size:</span>
          <span>{formatFileSize(size)}</span>
        </span>
        
        <span className="flex items-center gap-2">
          <span className="opacity-60">Cursor:</span>
          <span>
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </span>
        </span>
        
        {selection && (
          <span className="flex items-center gap-2">
            <span className="opacity-60">Selected:</span>
            <span>
              {selection.start.line}:{selection.start.column} - {selection.end.line}:{selection.end.column}
            </span>
          </span>
        )}
      </div>
    </div>
  );
};

export { EditorStatusBar };
export type { EditorStatusBarProps };
