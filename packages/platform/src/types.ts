/**
 * @soryos/platform
 * Types for multi-platform support.
 */

export type PlatformType = "web" | "mobile" | "desktop" | "tablet" | "unknown";

export type PlatformInfo = {
  type: PlatformType;
  isMobile: boolean;
  isDesktop: boolean;
  isTablet: boolean;
  isWeb: boolean;
  isNative: boolean;
  isHybrid: boolean;
  os: "windows" | "macos" | "linux" | "android" | "ios" | "unknown";
  browser: string | null;
  browserVersion: string | null;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  touchSupport: boolean;
  pointerSupport: boolean;
  keyboardSupport: boolean;
};

export type PlatformCapabilities = {
  fileSystem: boolean;
  clipboard: boolean;
  notifications: boolean;
  camera: boolean;
  microphone: boolean;
  geolocation: boolean;
  localStorage: boolean;
  sessionStorage: boolean;
  indexedDB: boolean;
  webWorkers: boolean;
  serviceWorkers: boolean;
  webAssembly: boolean;
  webGL: boolean;
  webRTC: boolean;
  webSockets: boolean;
  broadcastChannel: boolean;
  sharedWorkers: boolean;
  fileApi: boolean;
  blobApi: boolean;
};

export type PlatformFeature = keyof PlatformCapabilities;

export type PlatformAdapter<T> = {
  web: T;
  mobile?: T;
  desktop?: T;
  tablet?: T;
  default: T;
};

export type ResponsiveBreakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

export type ResponsiveValue<T> = {
  xs?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  "2xl"?: T;
  base: T;
};

export type TouchEventData = {
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel";
  touches: Touch[];
  changedTouches: Touch[];
  targetTouches: Touch[];
  timestamp: number;
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  velocityX: number;
  velocityY: number;
};

export type GestureType = 
  | "tap"
  | "doubleTap"
  | "longPress"
  | "swipe"
  | "pan"
  | "pinch"
  | "rotate";

export type GestureEvent = {
  type: GestureType;
  timestamp: number;
  x: number;
  y: number;
  deltaX?: number;
  deltaY?: number;
  velocityX?: number;
  velocityY?: number;
  scale?: number;
  rotation?: number;
  distance?: number;
};

export type KeyboardShortcut = {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
};

export type PlatformOrientation = "portrait" | "landscape" | "unknown";

export type PlatformTheme = {
  name: string;
  isDark: boolean;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    accent: string;
  };
};
