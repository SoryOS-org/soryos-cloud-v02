/**
 * @soryos/platform
 * Platform adapters for multi-platform compatibility.
 */

import type { PlatformAdapter } from "./types";
import { detectPlatformType, hasCapability } from "./detect";

/**
 * Create a platform adapter that provides platform-specific implementations
 */
export function createPlatformAdapter<T>(
  implementations: PlatformAdapter<T>
): T {
  const platform = detectPlatformType();
  
  // Return the most specific implementation available
  if (platform === "mobile" && implementations.mobile) {
    return implementations.mobile;
  }
  if (platform === "desktop" && implementations.desktop) {
    return implementations.desktop;
  }
  if (platform === "tablet" && implementations.tablet) {
    return implementations.tablet;
  }
  if (platform === "web" && implementations.web) {
    return implementations.web;
  }
  
  // Fallback to default
  return implementations.default;
}

/**
 * Storage adapter for multi-platform storage
 */
export interface StorageAdapter {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  getAllKeys: () => string[];
}

const webStorage: StorageAdapter = {
  getItem: (key: string) => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(key);
    }
    return null;
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  },
  removeItem: (key: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(key);
    }
  },
  clear: () => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  },
  getAllKeys: () => {
    if (typeof window !== "undefined") {
      return Object.keys(window.localStorage);
    }
    return [];
  },
};

const mobileStorage: StorageAdapter = {
  getItem: (key: string) => {
    if (typeof window !== "undefined") {
      // For mobile apps, try to use native storage if available
      if (window.Capacitor) {
        try {
          const value = window.Capacitor.Storage.get(key);
          return value || null;
        } catch {
          return window.localStorage.getItem(key);
        }
      }
      return window.localStorage.getItem(key);
    }
    return null;
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined") {
      if (window.Capacitor) {
        try {
          window.Capacitor.Storage.set(key, value);
          return;
        } catch {
          window.localStorage.setItem(key, value);
        }
      }
      window.localStorage.setItem(key, value);
    }
  },
  removeItem: (key: string) => {
    if (typeof window !== "undefined") {
      if (window.Capacitor) {
        try {
          window.Capacitor.Storage.remove(key);
          return;
        } catch {
          window.localStorage.removeItem(key);
        }
      }
      window.localStorage.removeItem(key);
    }
  },
  clear: () => {
    if (typeof window !== "undefined") {
      if (window.Capacitor) {
        try {
          window.Capacitor.Storage.clear();
          return;
        } catch {
          window.localStorage.clear();
        }
      }
      window.localStorage.clear();
    }
  },
  getAllKeys: () => {
    if (typeof window !== "undefined") {
      return Object.keys(window.localStorage);
    }
    return [];
  },
};

const desktopStorage: StorageAdapter = {
  getItem: (key: string) => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(key);
    }
    // For Node.js environment
    if (typeof process !== "undefined") {
      try {
        const fs = require("fs");
        const path = require("path");
        const storagePath = path.join(process.env.HOME || process.env.USERPROFILE || ".", ".soryos", "storage.json");
        if (fs.existsSync(storagePath)) {
          const storage = JSON.parse(fs.readFileSync(storagePath, "utf-8"));
          return storage[key] || null;
        }
      } catch {
        // Fallback to memory storage
        return null;
      }
    }
    return null;
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
      return;
    }
    // For Node.js environment
    if (typeof process !== "undefined") {
      try {
        const fs = require("fs");
        const path = require("path");
        const storageDir = path.join(process.env.HOME || process.env.USERPROFILE || ".", ".soryos");
        const storagePath = path.join(storageDir, "storage.json");
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(storageDir)) {
          fs.mkdirSync(storageDir, { recursive: true });
        }
        
        // Read existing storage
        let storage: Record<string, string> = {};
        if (fs.existsSync(storagePath)) {
          storage = JSON.parse(fs.readFileSync(storagePath, "utf-8"));
        }
        
        // Update storage
        storage[key] = value;
        
        // Write back to file
        fs.writeFileSync(storagePath, JSON.stringify(storage, null, 2));
      } catch {
        // Fallback to memory storage
        console.warn("Could not save to desktop storage");
      }
    }
  },
  removeItem: (key: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(key);
      return;
    }
    // For Node.js environment
    if (typeof process !== "undefined") {
      try {
        const fs = require("fs");
        const path = require("path");
        const storagePath = path.join(process.env.HOME || process.env.USERPROFILE || ".", ".soryos", "storage.json");
        
        if (fs.existsSync(storagePath)) {
          const storage = JSON.parse(fs.readFileSync(storagePath, "utf-8"));
          delete storage[key];
          fs.writeFileSync(storagePath, JSON.stringify(storage, null, 2));
        }
      } catch {
        // Fallback to memory storage
        console.warn("Could not remove from desktop storage");
      }
    }
  },
  clear: () => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
      return;
    }
    // For Node.js environment
    if (typeof process !== "undefined") {
      try {
        const fs = require("fs");
        const path = require("path");
        const storagePath = path.join(process.env.HOME || process.env.USERPROFILE || ".", ".soryos", "storage.json");
        
        if (fs.existsSync(storagePath)) {
          fs.unlinkSync(storagePath);
        }
      } catch {
        console.warn("Could not clear desktop storage");
      }
    }
  },
  getAllKeys: () => {
    if (typeof window !== "undefined") {
      return Object.keys(window.localStorage);
    }
    // For Node.js environment
    if (typeof process !== "undefined") {
      try {
        const fs = require("fs");
        const path = require("path");
        const storagePath = path.join(process.env.HOME || process.env.USERPROFILE || ".", ".soryos", "storage.json");
        
        if (fs.existsSync(storagePath)) {
          const storage = JSON.parse(fs.readFileSync(storagePath, "utf-8"));
          return Object.keys(storage);
        }
      } catch {
        return [];
      }
    }
    return [];
  },
};

/**
 * Get the appropriate storage adapter for the current platform
 */
export function getStorageAdapter(): StorageAdapter {
  const platform = detectPlatformType();
  
  switch (platform) {
    case "mobile":
      return mobileStorage;
    case "desktop":
      return desktopStorage;
    case "tablet":
      return webStorage; // Tablets use web storage
    case "web":
    default:
      return webStorage;
  }
}

/**
 * File system adapter for multi-platform file operations
 */
export interface FileSystemAdapter {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  listFiles: (path: string) => Promise<string[]>;
  createDirectory: (path: string) => Promise<void>;
  deleteDirectory: (path: string) => Promise<void>;
  fileExists: (path: string) => Promise<boolean>;
  directoryExists: (path: string) => Promise<boolean>;
  getFileInfo: (path: string) => Promise<{ size: number; modified: Date } | null>;
}

const webFileSystem: FileSystemAdapter = {
  readFile: async (path: string) => {
    // Web browsers don't have direct file system access
    // This would need to use the File API with user interaction
    throw new Error("File system access not available in web browsers without user interaction");
  },
  writeFile: async (path: string, content: string) => {
    // Web browsers can't write files directly
    // This would need to use the download API
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() || "file.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  deleteFile: async (path: string) => {
    throw new Error("Cannot delete files in web browsers");
  },
  listFiles: async (path: string) => {
    throw new Error("Cannot list files in web browsers without user interaction");
  },
  createDirectory: async (path: string) => {
    throw new Error("Cannot create directories in web browsers");
  },
  deleteDirectory: async (path: string) => {
    throw new Error("Cannot delete directories in web browsers");
  },
  fileExists: async (path: string) => false,
  directoryExists: async (path: string) => false,
  getFileInfo: async (path: string) => null,
};

const desktopFileSystem: FileSystemAdapter = {
  readFile: async (path: string) => {
    if (typeof window !== "undefined") {
      // In Electron or similar
      if (window.electron) {
        return window.electron.fs.readFile(path, "utf-8");
      }
      throw new Error("Desktop file system access not available");
    }
    
    // Node.js environment
    if (typeof process !== "undefined") {
      const fs = require("fs");
      return fs.readFileSync(path, "utf-8");
    }
    
    throw new Error("File system access not available");
  },
  writeFile: async (path: string, content: string) => {
    if (typeof window !== "undefined") {
      if (window.electron) {
        return window.electron.fs.writeFile(path, content, "utf-8");
      }
      throw new Error("Desktop file system access not available");
    }
    
    if (typeof process !== "undefined") {
      const fs = require("fs");
      fs.writeFileSync(path, content, "utf-8");
      return;
    }
    
    throw new Error("File system access not available");
  },
  deleteFile: async (path: string) => {
    if (typeof window !== "undefined") {
      if (window.electron) {
        return window.electron.fs.unlink(path);
      }
      throw new Error("Desktop file system access not available");
    }
    
    if (typeof process !== "undefined") {
      const fs = require("fs");
      fs.unlinkSync(path);
      return;
    }
    
    throw new Error("File system access not available");
  },
  listFiles: async (path: string) => {
    if (typeof window !== "undefined") {
      if (window.electron) {
        return window.electron.fs.readdir(path);
      }
      throw new Error("Desktop file system access not available");
    }
    
    if (typeof process !== "undefined") {
      const fs = require("fs");
      return fs.readdirSync(path);
    }
    
    throw new Error("File system access not available");
  },
  createDirectory: async (path: string) => {
    if (typeof window !== "undefined") {
      if (window.electron) {
        return window.electron.fs.mkdir(path, { recursive: true });
      }
      throw new Error("Desktop file system access not available");
    }
    
    if (typeof process !== "undefined") {
      const fs = require("fs");
      fs.mkdirSync(path, { recursive: true });
      return;
    }
    
    throw new Error("File system access not available");
  },
  deleteDirectory: async (path: string) => {
    if (typeof window !== "undefined") {
      if (window.electron) {
        return window.electron.fs.rmdir(path, { recursive: true });
      }
      throw new Error("Desktop file system access not available");
    }
    
    if (typeof process !== "undefined") {
      const fs = require("fs");
      fs.rmdirSync(path, { recursive: true });
      return;
    }
    
    throw new Error("File system access not available");
  },
  fileExists: async (path: string) => {
    if (typeof window !== "undefined") {
      if (window.electron) {
        return window.electron.fs.existsSync(path);
      }
      return false;
    }
    
    if (typeof process !== "undefined") {
      const fs = require("fs");
      return fs.existsSync(path);
    }
    
    return false;
  },
  directoryExists: async (path: string) => {
    if (typeof window !== "undefined") {
      if (window.electron) {
        return window.electron.fs.existsSync(path) && window.electron.fs.statSync(path).isDirectory();
      }
      return false;
    }
    
    if (typeof process !== "undefined") {
      const fs = require("fs");
      return fs.existsSync(path) && fs.statSync(path).isDirectory();
    }
    
    return false;
  },
  getFileInfo: async (path: string) => {
    if (typeof window !== "undefined") {
      if (window.electron) {
        const stats = window.electron.fs.statSync(path);
        return {
          size: stats.size,
          modified: new Date(stats.mtime),
        };
      }
      return null;
    }
    
    if (typeof process !== "undefined") {
      const fs = require("fs");
      const stats = fs.statSync(path);
      return {
        size: stats.size,
        modified: stats.mtime,
      };
    }
    
    return null;
  },
};

/**
 * Get the appropriate file system adapter for the current platform
 */
export function getFileSystemAdapter(): FileSystemAdapter {
  const platform = detectPlatformType();
  
  switch (platform) {
    case "desktop":
      return desktopFileSystem;
    case "mobile":
    case "tablet":
    case "web":
    default:
      return webFileSystem;
  }
}
