/**
 * @soryos/platform
 * Keyboard utilities for multi-platform keyboard support.
 */

import type { KeyboardShortcut } from "./types";
import { detectPlatformType, isMobileAppWrapper, isDesktopAppWrapper } from "./detect";

/**
 * Common keyboard shortcuts for different platforms
 */
export const COMMON_SHORTCUTS: Record<string, KeyboardShortcut> = {
  // File operations
  save: { key: "s", ctrlKey: true },
  saveAs: { key: "s", ctrlKey: true, shiftKey: true },
  newFile: { key: "n", ctrlKey: true },
  openFile: { key: "o", ctrlKey: true },
  closeFile: { key: "w", ctrlKey: true },
  closeAllFiles: { key: "w", ctrlKey: true, shiftKey: true },
  
  // Edit operations
  undo: { key: "z", ctrlKey: true },
  redo: { key: "y", ctrlKey: true },
  copy: { key: "c", ctrlKey: true },
  cut: { key: "x", ctrlKey: true },
  paste: { key: "v", ctrlKey: true },
  selectAll: { key: "a", ctrlKey: true },
  find: { key: "f", ctrlKey: true },
  replace: { key: "h", ctrlKey: true },
  
  // Navigation
  goBack: { key: "ArrowLeft", altKey: true },
  goForward: { key: "ArrowRight", altKey: true },
  goToLine: { key: "g", ctrlKey: true },
  
  // View
  zoomIn: { key: "+", ctrlKey: true },
  zoomOut: { key: "-", ctrlKey: true },
  resetZoom: { key: "0", ctrlKey: true },
  toggleFullScreen: { key: "f11" },
  
  // Code editor specific
  formatCode: { key: "f", ctrlKey: true, shiftKey: true },
  commentCode: { key: "/", ctrlKey: true },
  uncommentCode: { key: "/", ctrlKey: true, shiftKey: true },
  indentCode: { key: "Tab", shiftKey: true },
  outdentCode: { key: "Tab", shiftKey: true, ctrlKey: true },
  
  // Debug
  toggleDevTools: { key: "i", ctrlKey: true, shiftKey: true },
  reload: { key: "r", ctrlKey: true },
  forceReload: { key: "r", ctrlKey: true, shiftKey: true },
};

/**
 * Platform-specific keyboard shortcuts
 */
export const PLATFORM_SHORTCUTS: Record<string, Record<string, KeyboardShortcut>> = {
  web: {
    // Web-specific shortcuts
    openDevTools: { key: "i", ctrlKey: true, shiftKey: true },
    refresh: { key: "r", ctrlKey: true },
    hardRefresh: { key: "r", ctrlKey: true, shiftKey: true },
    newTab: { key: "t", ctrlKey: true },
    closeTab: { key: "w", ctrlKey: true },
    nextTab: { key: "Tab", ctrlKey: true },
    previousTab: { key: "Tab", ctrlKey: true, shiftKey: true },
  },
  mobile: {
    // Mobile-specific shortcuts (using virtual keyboard)
    showKeyboard: { key: "Enter" },
    hideKeyboard: { key: "Escape" },
    nextField: { key: "Tab" },
    previousField: { key: "Tab", shiftKey: true },
  },
  desktop: {
    // Desktop-specific shortcuts
    quit: { key: "q", ctrlKey: true },
    preferences: { key: ",", ctrlKey: true },
    toggleSidebar: { key: "b", ctrlKey: true },
    toggleTerminal: { key: "`" },
    newWindow: { key: "n", ctrlKey: true },
    closeWindow: { key: "w", ctrlKey: true, shiftKey: true },
  },
  tablet: {
    // Tablet-specific shortcuts
    ...COMMON_SHORTCUTS,
    toggleVirtualKeyboard: { key: "k", ctrlKey: true },
  },
};

/**
 * Get the appropriate keyboard shortcut for the current platform
 */
export function getKeyboardShortcut(shortcutName: string): KeyboardShortcut | undefined {
  const platform = detectPlatformType();
  
  // Check platform-specific shortcuts first
  const platformShortcuts = PLATFORM_SHORTCUTS[platform];
  if (platformShortcuts && platformShortcuts[shortcutName]) {
    return platformShortcuts[shortcutName];
  }
  
  // Fallback to common shortcuts
  return COMMON_SHORTCUTS[shortcutName];
}

/**
 * Check if a keyboard event matches a shortcut
 */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: KeyboardShortcut
): boolean {
  // Check if the key matches
  if (event.key !== shortcut.key) {
    return false;
  }
  
  // Check modifier keys
  if (shortcut.ctrlKey !== undefined && event.ctrlKey !== shortcut.ctrlKey) {
    return false;
  }
  
  if (shortcut.shiftKey !== undefined && event.shiftKey !== shortcut.shiftKey) {
    return false;
  }
  
  if (shortcut.altKey !== undefined && event.altKey !== shortcut.altKey) {
    return false;
  }
  
  if (shortcut.metaKey !== undefined && event.metaKey !== shortcut.metaKey) {
    return false;
  }
  
  return true;
}

/**
 * Create a keyboard event handler for shortcuts
 */
export function createKeyboardHandler(
  shortcuts: Record<string, () => void>,
  options: { preventDefault?: boolean; stopPropagation?: boolean } = {}
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    // Skip if typing in an input field
    if (event.target instanceof HTMLInputElement || 
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement) {
      // Allow some shortcuts to work in input fields
      const allowedInInput = ["copy", "cut", "paste", "selectAll", "undo", "redo"];
      const shortcutNames = Object.keys(shortcuts);
      const isAllowed = allowedInInput.some(name => shortcutNames.includes(name));
      if (!isAllowed) return;
    }

    // Find matching shortcut
    for (const [shortcutName, handler] of Object.entries(shortcuts)) {
      const shortcut = getKeyboardShortcut(shortcutName);
      if (shortcut && matchesShortcut(event, shortcut)) {
        if (options.preventDefault !== false) {
          event.preventDefault();
        }
        if (options.stopPropagation !== false) {
          event.stopPropagation();
        }
        handler();
        return;
      }
    }
  };
}

/**
 * Get the modifier key name for the current platform
 */
export function getModifierKeyName(modifier: "ctrl" | "shift" | "alt" | "meta"): string {
  const platform = detectPlatformType();
  
  if (platform === "macos" || platform === "desktop") {
    // On macOS, the meta key is Command, ctrl is Control
    if (modifier === "meta") return "⌘";
    if (modifier === "ctrl") return "⌃";
    if (modifier === "alt") return "⌥";
    if (modifier === "shift") return "⇧";
  }
  
  // Default names for Windows/Linux
  if (modifier === "ctrl") return "Ctrl";
  if (modifier === "shift") return "Shift";
  if (modifier === "alt") return "Alt";
  if (modifier === "meta") return "Win";
  
  return modifier;
}

/**
 * Format a keyboard shortcut for display
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  
  if (shortcut.ctrlKey) parts.push(getModifierKeyName("ctrl"));
  if (shortcut.shiftKey) parts.push(getModifierKeyName("shift"));
  if (shortcut.altKey) parts.push(getModifierKeyName("alt"));
  if (shortcut.metaKey) parts.push(getModifierKeyName("meta"));
  
  // Format the key
  let key = shortcut.key;
  
  // Special key names
  const keyNames: Record<string, string> = {
    "ArrowUp": "↑",
    "ArrowDown": "↓",
    "ArrowLeft": "←",
    "ArrowRight": "→",
    "Enter": "↵",
    "Escape": "Esc",
    "Backspace": "⌫",
    "Delete": "⌦",
    "Tab": "⇥",
    "Space": "␣",
    "PageUp": "Page↑",
    "PageDown": "Page↓",
    "Home": "⇱",
    "End": "⇲",
  };
  
  if (keyNames[key]) {
    key = keyNames[key];
  } else if (key.length === 1) {
    key = key.toUpperCase();
  }
  
  parts.push(key);
  
  return parts.join("+");
}

/**
 * Check if the current platform uses the meta key (Command on macOS)
 */
export function usesMetaKey(): boolean {
  const platform = detectPlatformType();
  const os = detectPlatformType(); // This should be detectOS()
  
  // For now, assume macOS uses meta key
  return os === "macos" || isDesktopAppWrapper();
}

/**
 * Create a mnemonic shortcut (for menu items)
 */
export function createMnemonicShortcut(
  text: string,
  shortcut: string | KeyboardShortcut
): { text: string; shortcut: string } {
  if (typeof shortcut === "string") {
    return { text, shortcut };
  }
  
  return { text, shortcut: formatShortcut(shortcut) };
}

/**
 * Get platform-specific keyboard layout
 */
export function getKeyboardLayout(): {
  name: string;
  isQwerty: boolean;
  isAzerty: boolean;
  isQwertz: boolean;
  isDvorak: boolean;
} {
  if (typeof window === "undefined") {
    return {
      name: "unknown",
      isQwerty: true,
      isAzerty: false,
      isQwertz: false,
      isDvorak: false,
    };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const language = window.navigator.language.toLowerCase();

  // Check for AZERTY (French, Belgian)
  if (language.includes("fr") || language.includes("be")) {
    return {
      name: "azerty",
      isQwerty: false,
      isAzerty: true,
      isQwertz: false,
      isDvorak: false,
    };
  }

  // Check for QWERTZ (German, Austrian, Swiss)
  if (language.includes("de") || language.includes("at") || language.includes("ch")) {
    return {
      name: "qwertz",
      isQwerty: false,
      isAzerty: false,
      isQwertz: true,
      isDvorak: false,
    };
  }

  // Check for Dvorak (rare, but possible)
  if (userAgent.includes("dvorak") || language.includes("dvorak")) {
    return {
      name: "dvorak",
      isQwerty: false,
      isAzerty: false,
      isQwertz: false,
      isDvorak: true,
    };
  }

  // Default to QWERTY
  return {
    name: "qwerty",
    isQwerty: true,
    isAzerty: false,
    isQwertz: false,
    isDvorak: false,
  };
}

/**
 * Check if a key is a modifier key
 */
export function isModifierKey(key: string): boolean {
  const modifierKeys = ["Control", "Shift", "Alt", "Meta", "Ctrl", "AltGraph"];
  return modifierKeys.includes(key);
}

/**
 * Check if a key is a navigation key
 */
export function isNavigationKey(key: string): boolean {
  const navigationKeys = [
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "PageUp", "PageDown", "Home", "End",
    "Tab", "Enter", "Escape"
  ];
  return navigationKeys.includes(key);
}

/**
 * Check if a key is a function key
 */
export function isFunctionKey(key: string): boolean {
  return /^F[1-9][0-9]?$/.test(key);
}
