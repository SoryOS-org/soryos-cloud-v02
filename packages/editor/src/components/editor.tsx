/**
 * @soryos/editor
 * Main code editor component with multi-platform support.
 */

"use client";

import React, { useState, useEffect, useRef, useCallback, KeyboardEvent, ClipboardEvent } from "react";
import { cn } from "@soryos/ui";
import type { 
  EditorSettings, 
  EditorFile, 
  EditorState,
  EditorTab,
  PlanetEditorTheme
} from "../types";
import {
  DEFAULT_EDITOR_SETTINGS,
  createEditorFile,
  createEditorTab,
  initializeEditorState,
  updateFileContent,
  saveFile,
  openFile,
  addFile,
  closeFile,
  updateEditorSettings,
  getActiveFile,
  getFileById,
  getFileByPath,
} from "../utils/editor-utils";
import { tokenize, getTokenClass } from "../utils/syntax-highlighting";
import { getLanguageFromPath, SUPPORTED_LANGUAGES } from "../utils/editor-utils";

interface CodeEditorProps {
  className?: string;
  initialFiles?: EditorFile[];
  initialSettings?: Partial<EditorSettings>;
  onChange?: (state: EditorState) => void;
  onFileSave?: (file: EditorFile) => void;
  onFileOpen?: (file: EditorFile) => void;
  onSettingsChange?: (settings: EditorSettings) => void;
  theme?: PlanetEditorTheme;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  className,
  initialFiles = [],
  initialSettings = {},
  onChange,
  onFileSave,
  onFileOpen,
  onSettingsChange,
  theme = "earth",
}) => {
  // State management
  const [state, setState] = useState<EditorState>(() => {
    const initialState = initializeEditorState(initialSettings);
    
    // Add initial files
    let resultState = initialState;
    for (const file of initialFiles) {
      resultState = addFile(resultState, file);
    }
    
    // Open the first file if available
    if (initialFiles.length > 0) {
      resultState = openFile(resultState, initialFiles[0].id);
    }
    
    return resultState;
  });

  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [selection, setSelection] = useState<{ start: { line: number; column: number }; end: { line: number; column: number } } | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Planet theme color mapping
  const planetColors = {
    mercury: "bg-gradient-to-br from-gray-100 to-gray-200 dark:bg-gradient-to-br dark:from-gray-800 dark:to-gray-900",
    venus: "bg-gradient-to-br from-yellow-50 to-orange-100 dark:bg-gradient-to-br dark:from-yellow-900/20 dark:to-orange-900/20",
    earth: "bg-gradient-to-br from-blue-50 to-green-50 dark:bg-gradient-to-br dark:from-blue-900/20 dark:to-green-900/20",
    mars: "bg-gradient-to-br from-red-50 to-orange-50 dark:bg-gradient-to-br dark:from-red-900/20 dark:to-orange-900/20",
    jupiter: "bg-gradient-to-br from-purple-50 to-pink-50 dark:bg-gradient-to-br dark:from-purple-900/20 dark:to-pink-900/20",
    saturn: "bg-gradient-to-br from-yellow-50 to-amber-50 dark:bg-gradient-to-br dark:from-yellow-900/20 dark:to-amber-900/20",
    uranus: "bg-gradient-to-br from-cyan-50 to-blue-50 dark:bg-gradient-to-br dark:from-cyan-900/20 dark:to-blue-900/20",
    neptune: "bg-gradient-to-br from-blue-50 to-indigo-50 dark:bg-gradient-to-br dark:from-blue-900/20 dark:to-indigo-900/20",
    pluto: "bg-gradient-to-br from-gray-50 to-slate-50 dark:bg-gradient-to-br dark:from-gray-900/20 dark:to-slate-900/20",
  };

  // Sync state changes to parent
  useEffect(() => {
    if (onChange) {
      onChange(state);
    }
  }, [state, onChange]);

  // Sync settings changes to parent
  useEffect(() => {
    if (onSettingsChange) {
      onSettingsChange(state.settings);
    }
  }, [state.settings, onSettingsChange]);

  // Handle file content changes
  const handleContentChange = useCallback((fileId: string, newContent: string) => {
    setState((prevState) => {
      const newState = updateFileContent(prevState, fileId, newContent);
      
      // Sync cursor position if this is the active file
      if (fileId === prevState.activeFileId) {
        // Update cursor position based on textarea selection
        if (textareaRef.current) {
          const { selectionStart, selectionEnd, value } = textareaRef.current;
          const lines = value.split('\n');
          let line = 0;
          let column = 0;
          let charCount = 0;
          
          for (let i = 0; i < lines.length; i++) {
            if (charCount + lines[i].length >= selectionStart) {
              line = i;
              column = selectionStart - charCount;
              break;
            }
            charCount += lines[i].length + 1; // +1 for newline
          }
          
          setCursorPosition({ line: line + 1, column: column + 1 });
          
          if (selectionStart !== selectionEnd) {
            let endLine = 0;
            let endColumn = 0;
            charCount = 0;
            
            for (let i = 0; i < lines.length; i++) {
              if (charCount + lines[i].length >= selectionEnd) {
                endLine = i;
                endColumn = selectionEnd - charCount;
                break;
              }
              charCount += lines[i].length + 1;
            }
            
            setSelection({
              start: { line: line + 1, column: column + 1 },
              end: { line: endLine + 1, column: endColumn + 1 },
            });
          } else {
            setSelection(null);
          }
        }
      }
      
      return newState;
    });
  }, []);

  // Handle file save
  const handleSave = useCallback((fileId: string) => {
    setState((prevState) => {
      const newState = saveFile(prevState, fileId);
      const file = getFileById(newState, fileId);
      if (file && onFileSave) {
        onFileSave(file);
      }
      return newState;
    });
  }, [onFileSave]);

  // Handle file open
  const handleFileOpen = useCallback((fileId: string) => {
    setState((prevState) => {
      const newState = openFile(prevState, fileId);
      const file = getFileById(newState, fileId);
      if (file && onFileOpen) {
        onFileOpen(file);
      }
      return newState;
    });
  }, [onFileOpen]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>, fileId: string) => {
    // Save with Ctrl+S or Cmd+S
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave(fileId);
    }

    // Tab key handling
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        const { selectionStart, selectionEnd, value } = textarea;
        const beforeCursor = value.substring(0, selectionStart);
        const afterCursor = value.substring(selectionEnd);
        const spaces = ' '.repeat(state.settings.tabSize);
        
        textarea.value = beforeCursor + spaces + afterCursor;
        textarea.selectionStart = selectionStart + spaces.length;
        textarea.selectionEnd = selectionEnd + spaces.length;
        
        // Trigger content change
        const newContent = textarea.value;
        handleContentChange(fileId, newContent);
        
        // Update local state
        setState((prevState) => {
          const file = getFileById(prevState, fileId);
          if (file) {
            const newFile = { ...file, content: newContent };
            const files = prevState.files.map((f) => f.id === fileId ? newFile : f);
            return { ...prevState, files };
          }
          return prevState;
        });
      }
    }
  }, [handleSave, handleContentChange, state.settings.tabSize]);

  // Render line numbers
  const renderLineNumbers = (file: EditorFile) => {
    const lines = file.content.split('\n');
    return (
      <div 
        ref={lineNumbersRef}
        className="select-none text-right text-sm text-[var(--text-muted)] w-12 py-2 pr-2 overflow-hidden"
        style={{ lineHeight: `${state.settings.lineHeight * 100}%` }}
      >
        {lines.map((_, index) => (
          <div key={index} className="h-[var(--line-height)]">
            {index + 1}
          </div>
        ))}
      </div>
    );
  };

  // Render syntax highlighted content
  const renderSyntaxHighlightedContent = (file: EditorFile) => {
    const lines = file.content.split('\n');
    const highlightResult = tokenize(file.content, file.language);
    
    return (
      <div className="relative">
        {lines.map((line, lineIndex) => {
          const lineTokens = highlightResult.lines[lineIndex] || [];
          
          return (
            <div 
              key={lineIndex}
              className="flex h-[var(--line-height)]"
            >
              {lineTokens.length > 0 ? (
                lineTokens.map((token, tokenIndex) => (
                  <span 
                    key={tokenIndex}
                    className={cn(
                      getTokenClass(token.type as any),
                      "whitespace-pre"
                    )}
                  >
                    {token.value}
                  </span>
                ))
              ) : (
                <span className="whitespace-pre">{line || ' '}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Get active file
  const activeFile = getActiveFile(state);

  // Render editor for a specific file
  const renderEditor = (file: EditorFile) => {
    return (
      <div 
        className={cn(
          "flex-1 flex overflow-hidden border border-[var(--border)] rounded-lg",
          planetColors[theme] || planetColors.earth
        )}
      >
        {/* Line numbers */}
        {state.settings.showLineNumbers && renderLineNumbers(file)}
        
        {/* Editor content */}
        <div className="flex-1 overflow-auto p-4">
          <textarea
            ref={textareaRef}
            value={file.content}
            onChange={(e) => handleContentChange(file.id, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, file.id)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              "w-full h-full bg-transparent border-none outline-none resize-none",
              "font-[var(--font-family)] text-[var(--editor-fg)]",
              "text-[var(--font-size)] leading-[var(--line-height)]",
              "placeholder:text-[var(--text-muted)]",
              "focus:ring-0 focus:outline-none",
              {
                "font-mono": state.settings.fontFamily.includes("Mono"),
              }
            )}
            style={{
              fontSize: `${state.settings.fontSize}px`,
              lineHeight: `${state.settings.lineHeight * 100}%`,
              fontFamily: state.settings.fontFamily,
              tabSize: state.settings.tabSize,
            }}
            spellCheck={false}
            wrap={state.settings.wordWrap ? "soft" : "off"}
          />
          
          {/* Syntax highlighted overlay */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {renderSyntaxHighlightedContent(file)}
          </div>
        </div>
      </div>
    );
  };

  // Render tabs
  const renderTabs = () => {
    return (
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-2 py-1 overflow-x-auto">
        {state.tabs.map((tab) => {
          const file = getFileById(state, tab.fileId);
          return (
            <button
              key={tab.id}
              onClick={() => handleFileOpen(tab.fileId)}
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
                {
                  "bg-[var(--surface-hover)] text-[var(--foreground)]": tab.isActive,
                  "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]": !tab.isActive,
                }
              )}
            >
              {tab.isDirty && (
                <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />
              )}
              <span className="truncate max-w-[200px]">{tab.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.fileId);
                }}
                className="text-xs opacity-50 hover:opacity-100 hover:text-[var(--error)]"
              >
                ×
              </button>
            </button>
          );
        })}
        
        {/* New file button */}
        <button
          onClick={handleNewFile}
          className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] transition-colors"
        >
          <span>+</span>
          <span>New File</span>
        </button>
      </div>
    );
  };

  // Handle new file creation
  const handleNewFile = () => {
    const newFile = createEditorFile(
      `untitled-${state.files.length + 1}.ts`,
      "",
      "typescript"
    );
    setState((prevState) => {
      const newState = addFile(prevState, newFile);
      return openFile(newState, newFile.id);
    });
  };

  // Handle tab close
  const handleCloseTab = (fileId: string) => {
    setState((prevState) => {
      const file = getFileById(prevState, fileId);
      if (file && file.isDirty) {
        // For now, just close without saving
        // In a real implementation, you might want to show a confirmation dialog
      }
      return closeFile(prevState, fileId);
    });
  };

  // Render status bar
  const renderStatusBar = () => {
    if (!activeFile) return null;
    
    const lines = activeFile.content.split('\n').length;
    const characters = activeFile.content.length;
    
    return (
      <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border)] bg-[var(--surface-elevated)] text-sm text-[var(--text-muted)]">
        <div className="flex items-center gap-4">
          <span>{activeFile.name}</span>
          <span>{activeFile.language}</span>
          <span>{activeFile.encoding}</span>
        </div>
        
        <div className="flex items-center gap-4">
          <span>Lines: {lines}</span>
          <span>Chars: {characters}</span>
          <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
          {selection && (
            <span>
              Selected: {selection.start.line}:{selection.start.column} - {selection.end.line}:{selection.end.column}
            </span>
          )}
        </div>
      </div>
    );
  };

  if (!activeFile) {
    return (
      <div className={cn("flex flex-col h-full bg-[var(--editor-bg)]", className)}>
        <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
          <p>No file open. Create a new file or open an existing one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-[var(--editor-bg)]", className)}>
      {/* Tabs */}
      {state.settings.showLineNumbers && renderTabs()}
      
      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {renderEditor(activeFile)}
      </div>
      
      {/* Status Bar */}
      {state.settings.showStatusBar && renderStatusBar()}
    </div>
  );
};

export { CodeEditor };
export type { CodeEditorProps };
