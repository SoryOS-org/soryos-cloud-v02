/**
 * @soryos/platform
 * Platform detection utilities for multi-platform support.
 */

import type { PlatformType, PlatformInfo, PlatformCapabilities, PlatformOrientation } from "./types";

/**
 * Detect the current platform type
 */
export function detectPlatformType(): PlatformType {
  if (typeof window === "undefined") {
    return "unknown";
  }

  // Check for Node.js (desktop/server)
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    return "desktop";
  }

  // Check for Electron (desktop)
  if (typeof window !== "undefined") {
    const userAgent = window.navigator.userAgent.toLowerCase();
    
    // Check for Electron
    if (userAgent.includes("electron")) {
      return "desktop";
    }
    
    // Check for mobile browsers
    if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
      return "mobile";
    }
    
    // Check for tablet browsers
    if (/ipad|tablet|playbook|silk|kindle/i.test(userAgent)) {
      return "tablet";
    }
    
    // Check for touch devices
    if (window.matchMedia && window.matchMedia("(pointer:coarse)").matches) {
      const maxTouchPoints = window.navigator.maxTouchPoints || 0;
      if (maxTouchPoints > 1) {
        // Multiple touch points likely means tablet
        if (window.innerWidth >= 768) {
          return "tablet";
        }
        return "mobile";
      }
    }
    
    // Default to web
    return "web";
  }

  return "unknown";
}

/**
 * Detect the operating system
 */
export function detectOS(): "windows" | "macos" | "linux" | "android" | "ios" | "unknown" {
  if (typeof window === "undefined") {
    // Node.js environment
    if (typeof process !== "undefined") {
      const platform = process.platform;
      if (platform === "win32") return "windows";
      if (platform === "darwin") return "macos";
      if (platform === "linux" || platform === "android") return "linux";
    }
    return "unknown";
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform.toLowerCase();

  if (platform.includes("win")) return "windows";
  if (platform.includes("mac")) return "macos";
  if (platform.includes("linux")) return "linux";
  if (userAgent.includes("android")) return "android";
  if (userAgent.includes("iphone") || userAgent.includes("ipad") || userAgent.includes("ipod")) return "ios";

  return "unknown";
}

/**
 * Detect browser information
 */
export function detectBrowser(): { name: string | null; version: string | null } {
  if (typeof window === "undefined") {
    return { name: null, version: null };
  }

  const userAgent = window.navigator.userAgent;
  
  // Browser detection patterns
  const browsers = [
    { name: "Chrome", pattern: /Chrome\/([\d.]+)/ },
    { name: "Firefox", pattern: /Firefox\/([\d.]+)/ },
    { name: "Safari", pattern: /Version\/([\d.]+).*Safari/ },
    { name: "Edge", pattern: /Edg\/([\d.]+)/ },
    { name: "Opera", pattern: /OPR\/([\d.]+)/ },
    { name: "Brave", pattern: /Brave\/([\d.]+)/ },
    { name: "Vivaldi", pattern: /Vivaldi\/([\d.]+)/ },
    { name: "Yandex", pattern: /YaBrowser\/([\d.]+)/ },
    { name: "DuckDuckGo", pattern: /DuckDuckGo\/([\d.]+)/ },
  ];

  for (const browser of browsers) {
    const match = userAgent.match(browser.pattern);
    if (match) {
      return { name: browser.name, version: match[1] };
    }
  }

  // Check for Safari on iOS
  if (/iPhone|iPad|iPod/i.test(userAgent) && /Safari/i.test(userAgent)) {
    const versionMatch = userAgent.match(/Version\/([\d.]+)/);
    return { name: "Safari", version: versionMatch ? versionMatch[1] : null };
  }

  return { name: null, version: null };
}

/**
 * Get comprehensive platform information
 */
export function getPlatformInfo(): PlatformInfo {
  const type = detectPlatformType();
  const os = detectOS();
  const { name: browser, version: browserVersion } = detectBrowser();

  return {
    type,
    isMobile: type === "mobile",
    isDesktop: type === "desktop",
    isTablet: type === "tablet",
    isWeb: type === "web",
    isNative: type === "mobile" || type === "desktop",
    isHybrid: false, // Could be true for frameworks like Capacitor or Cordova
    os,
    browser,
    browserVersion,
    screenWidth: typeof window !== "undefined" ? window.innerWidth : 0,
    screenHeight: typeof window !== "undefined" ? window.innerHeight : 0,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    touchSupport: typeof window !== "undefined" ? "ontouchstart" in window : false,
    pointerSupport: typeof window !== "undefined" ? "PointerEvent" in window : false,
    keyboardSupport: typeof window !== "undefined" ? "KeyboardEvent" in window : false,
  };
}

/**
 * Detect platform capabilities
 */
export function detectCapabilities(): PlatformCapabilities {
  if (typeof window === "undefined") {
    // Server-side, assume all capabilities
    return {
      fileSystem: true,
      clipboard: true,
      notifications: true,
      camera: false,
      microphone: false,
      geolocation: false,
      localStorage: false,
      sessionStorage: false,
      indexedDB: false,
      webWorkers: true,
      serviceWorkers: false,
      webAssembly: true,
      webGL: false,
      webRTC: false,
      webSockets: true,
      broadcastChannel: false,
      sharedWorkers: true,
      fileApi: true,
      blobApi: true,
    };
  }

  return {
    fileSystem: "FileSystem" in window || "FileReader" in window,
    clipboard: "clipboard" in navigator,
    notifications: "Notification" in window,
    camera: "mediaDevices" in navigator && "getUserMedia" in navigator.mediaDevices,
    microphone: "mediaDevices" in navigator && "getUserMedia" in navigator.mediaDevices,
    geolocation: "geolocation" in navigator,
    localStorage: "localStorage" in window,
    sessionStorage: "sessionStorage" in window,
    indexedDB: "indexedDB" in window,
    webWorkers: "Worker" in window,
    serviceWorkers: "serviceWorker" in navigator,
    webAssembly: "WebAssembly" in window,
    webGL: (() => {
      try {
        return "WebGLRenderingContext" in window;
      } catch {
        return false;
      }
    })(),
    webRTC: "RTCPeerConnection" in window,
    webSockets: "WebSocket" in window,
    broadcastChannel: "BroadcastChannel" in window,
    sharedWorkers: "SharedWorker" in window,
    fileApi: "File" in window,
    blobApi: "Blob" in window,
  };
}

/**
 * Check if a specific capability is available
 */
export function hasCapability(capability: keyof PlatformCapabilities): boolean {
  const capabilities = detectCapabilities();
  return capabilities[capability];
}

/**
 * Detect current screen orientation
 */
export function detectOrientation(): PlatformOrientation {
  if (typeof window === "undefined") {
    return "unknown";
  }

  if (window.matchMedia) {
    if (window.matchMedia("(orientation: portrait)").matches) {
      return "portrait";
    }
    if (window.matchMedia("(orientation: landscape)").matches) {
      return "landscape";
    }
  }

  // Fallback based on screen dimensions
  if (window.innerHeight > window.innerWidth) {
    return "portrait";
  }
  return "landscape";
}

/**
 * Check if the current device is a touch device
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return "ontouchstart" in window || 
         "ontouchmove" in window || 
         "ontouchend" in window ||
         (window.navigator.maxTouchPoints || 0) > 0;
}

/**
 * Check if the current device supports hover
 */
export function supportsHover(): boolean {
  if (typeof window === "undefined") {
    return true; // Assume desktop/server supports hover
  }

  return window.matchMedia && window.matchMedia("(hover:hover)").matches;
}

/**
 * Check if the current device has a fine pointer (mouse)
 */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.matchMedia && window.matchMedia("(pointer:fine)").matches;
}

/**
 * Check if the current device has a coarse pointer (touch)
 */
export function hasCoarsePointer(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia && window.matchMedia("(pointer:coarse)").matches;
}

/**
 * Detect if running in a mobile app wrapper (like Capacitor, Cordova, etc.)
 */
export function isMobileAppWrapper(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  
  // Check for common mobile app wrappers
  const wrappers = [
    "capacitor",
    "cordova",
    "phonegap",
    "ionic",
    "react native",
    "native script",
    "flutter",
    "xamarin",
  ];

  return wrappers.some((wrapper) => userAgent.includes(wrapper));
}

/**
 * Detect if running in a desktop app wrapper (like Electron, Tauri, etc.)
 */
export function isDesktopAppWrapper(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  
  // Check for common desktop app wrappers
  const wrappers = [
    "electron",
    "tauri",
    "nw.js",
    "node-webkit",
    "neutralino",
  ];

  return wrappers.some((wrapper) => userAgent.includes(wrapper));
}

/**
 * Get platform-specific storage prefix
 */
export function getStoragePrefix(): string {
  const platform = detectPlatformType();
  const os = detectOS();
  
  return `soryos_${platform}_${os}_`;
}
