/**
 * @soryos/editor
 * Editor toolbar component with planet-themed buttons.
 */

"use client";

import React from "react";
import { cn } from "@soryos/ui";
import type { EditorSettings, PlanetEditorTheme } from "../types";
import { DEFAULT_EDITOR_SETTINGS } from "../utils/editor-utils";

interface EditorToolbarProps {
  settings: EditorSettings;
  onSettingsChange: (settings: Partial<EditorSettings>) => void;
  theme?: PlanetEditorTheme;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onFormat?: () => void;
  onNewFile?: () => void;
  onOpenFile?: () => void;
  onCloseFile?: () => void;
}

// Planet theme colors for toolbar
const planetToolbarColors = {
  mercury: {
    bg: "bg-gradient-to-r from-gray-200 to-gray-300",
    text: "text-gray-800",
    hover: "hover:from-gray-300 hover:to-gray-400",
  },
  venus: {
    bg: "bg-gradient-to-r from-yellow-200 to-orange-300",
    text: "text-yellow-900",
    hover: "hover:from-yellow-300 hover:to-orange-400",
  },
  earth: {
    bg: "bg-gradient-to-r from-blue-200 to-green-300",
    text: "text-blue-900",
    hover: "hover:from-blue-300 hover:to-green-400",
  },
  mars: {
    bg: "bg-gradient-to-r from-red-200 to-orange-300",
    text: "text-red-900",
    hover: "hover:from-red-300 hover:to-orange-400",
  },
  jupiter: {
    bg: "bg-gradient-to-r from-purple-200 to-pink-300",
    text: "text-purple-900",
    hover: "hover:from-purple-300 hover:to-pink-400",
  },
  saturn: {
    bg: "bg-gradient-to-r from-yellow-200 to-amber-300",
    text: "text-yellow-900",
    hover: "hover:from-yellow-300 hover:to-amber-400",
  },
  uranus: {
    bg: "bg-gradient-to-r from-cyan-200 to-blue-300",
    text: "text-cyan-900",
    hover: "hover:from-cyan-300 hover:to-blue-400",
  },
  neptune: {
    bg: "bg-gradient-to-r from-blue-200 to-indigo-300",
    text: "text-blue-900",
    hover: "hover:from-blue-300 hover:to-indigo-400",
  },
  pluto: {
    bg: "bg-gradient-to-r from-gray-300 to-slate-400",
    text: "text-gray-900",
    hover: "hover:from-gray-400 hover:to-slate-500",
  },
};

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  settings,
  onSettingsChange,
  theme = "earth",
  onSave,
  onUndo,
  onRedo,
  onFormat,
  onNewFile,
  onOpenFile,
  onCloseFile,
}) => {
  const colors = planetToolbarColors[theme] || planetToolbarColors.earth;

  // Handle font size change
  const handleFontSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSettingsChange({ fontSize: parseInt(e.target.value) });
  };

  // Handle font family change
  const handleFontFamilyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSettingsChange({ fontFamily: e.target.value });
  };

  // Handle theme change
  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSettingsChange({ theme: e.target.value as any, planetTheme: e.target.value as any });
  };

  // Toggle settings
  const toggleSetting = (key: keyof EditorSettings) => {
    onSettingsChange({ [key]: !settings[key] });
  };

  // Available font sizes
  const fontSizes = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24];

  // Available font families
  const fontFamilies = [
    { value: "'Fira Code', 'Monaco', 'Consolas', monospace", label: "Fira Code" },
    { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
    { value: "'Source Code Pro', monospace", label: "Source Code Pro" },
    { value: "'Cascadia Code', monospace", label: "Cascadia Code" },
    { value: "'Ubuntu Mono', monospace", label: "Ubuntu Mono" },
    { value: "monospace", label: "System Mono" },
  ];

  // Available themes
  const themes = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
    { value: "mercury", label: "Mercury" },
    { value: "venus", label: "Venus" },
    { value: "earth", label: "Earth" },
    { value: "mars", label: "Mars" },
    { value: "jupiter", label: "Jupiter" },
    { value: "saturn", label: "Saturn" },
    { value: "uranus", label: "Uranus" },
    { value: "neptune", label: "Neptune" },
    { value: "pluto", label: "Pluto" },
  ];

  return (
    <div 
      className={cn(
        "flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]",
        colors.bg,
        colors.text
      )}
    >
      {/* File actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onNewFile}
          className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-all",
            colors.hover
          )}
          title="New File (Ctrl+N)"
        >
          <span>+</span>
          <span>New</span>
        </button>
        
        <button
          onClick={onOpenFile}
          className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-all",
            colors.hover
          )}
          title="Open File (Ctrl+O)"
        >
          <span>📁</span>
          <span>Open</span>
        </button>
        
        <button
          onClick={onSave}
          className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-all",
            colors.hover
          )}
          title="Save (Ctrl+S)"
        >
          <span>💾</span>
          <span>Save</span>
        </button>
        
        <button
          onClick={onCloseFile}
          className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-all",
            colors.hover
          )}
          title="Close File (Ctrl+W)"
        >
          <span>✕</span>
          <span>Close</span>
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-white/30" />

      {/* Edit actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-all",
            colors.hover
          )}
          title="Undo (Ctrl+Z)"
        >
          <span>↩</span>
          <span>Undo</span>
        </button>
        
        <button
          onClick={onRedo}
          className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-all",
            colors.hover
          )}
          title="Redo (Ctrl+Y)"
        >
          <span>↪</span>
          <span>Redo</span>
        </button>
        
        <button
          onClick={onFormat}
          className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-all",
            colors.hover
          )}
          title="Format Code (Shift+Alt+F)"
        >
          <span>📐</span>
          <span>Format</span>
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-white/30" />

      {/* View settings */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span>Font:</span>
          <select
            value={settings.fontSize}
            onChange={handleFontSizeChange}
            className={cn(
              "px-2 py-1 rounded text-sm bg-white/20 border border-white/30",
              colors.text
            )}
          >
            {fontSizes.map((size) => (
              <option key={size} value={size}>{size}px</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span>Family:</span>
          <select
            value={settings.fontFamily}
            onChange={handleFontFamilyChange}
            className={cn(
              "px-2 py-1 rounded text-sm bg-white/20 border border-white/30",
              colors.text
            )}
          >
            {fontFamilies.map((font) => (
              <option key={font.value} value={font.value}>{font.label}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span>Theme:</span>
          <select
            value={settings.theme || settings.planetTheme || "system"}
            onChange={handleThemeChange}
            className={cn(
              "px-2 py-1 rounded text-sm bg-white/20 border border-white/30",
              colors.text
            )}
          >
            {themes.map((theme) => (
              <option key={theme.value} value={theme.value}>{theme.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-white/30" />

      {/* Toggle settings */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showLineNumbers}
            onChange={() => toggleSetting("showLineNumbers")}
            className="w-4 h-4 accent-white"
          />
          <span>Line Numbers</span>
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={settings.wordWrap}
            onChange={() => toggleSetting("wordWrap")}
            className="w-4 h-4 accent-white"
          />
          <span>Word Wrap</span>
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={settings.highlightActiveLine}
            onChange={() => toggleSetting("highlightActiveLine")}
            className="w-4 h-4 accent-white"
          />
          <span>Active Line</span>
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showStatusBar}
            onChange={() => toggleSetting("showStatusBar")}
            className="w-4 h-4 accent-white"
          />
          <span>Status Bar</span>
        </label>
      </div>
    </div>
  );
};

export { EditorToolbar };
export type { EditorToolbarProps };
