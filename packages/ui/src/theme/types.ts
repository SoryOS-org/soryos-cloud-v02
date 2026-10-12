/**
 * @soryos/ui
 * Theme types and color definitions for multi-platform compatibility.
 */

export type ThemeMode = "light" | "dark" | "system";

export type ColorTheme =
  | "soryos"
  | "midnight"
  | "ocean"
  | "forest"
  | "violet"
  | "rose"
  | "amber"
  | "cosmic"
  | "neon"
  | "aurora"
  | "custom";

export type AccentColor =
  | "blue"
  | "purple"
  | "cyan"
  | "green"
  | "orange"
  | "red"
  | "pink"
  | "gold"
  | "silver"
  | "bronze";

export type UiDensity = "compact" | "normal" | "comfortable";

export type PlanetTheme = 
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto";

export interface CustomThemeColors {
  background: string;
  surface: string;
  foreground: string;
  primary: string;
  accent: string;
  border: string;
}

export interface AppearancePreferences {
  theme: ThemeMode;
  colorTheme: ColorTheme;
  accentColor: AccentColor;
  uiDensity: UiDensity;
  fontSize: number;
  customColors?: CustomThemeColors;
  planetTheme?: PlanetTheme;
}

export interface ThemeTokens {
  // Background colors
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  surfaceActive?: string;
  inputBg?: string;
  
  // Border colors
  border: string;
  borderSubtle: string;
  
  // Text colors
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  
  // Brand colors
  primary: string;
  primaryFg: string;
  accent: string;
  accentFg: string;
  
  // Status colors
  success: string;
  warning: string;
  error: string;
  info: string;
  
  // Specialized colors
  terminalBg: string;
  terminalFg: string;
  editorBg: string;
  editorFg: string;
  sidebarBg: string;
  sidebarFg: string;
  
  // Interaction colors
  selection: string;
  ring: string;
  
  // Planet theme colors (for cosmic UI)
  planetPrimary?: string;
  planetSecondary?: string;
  planetAccent?: string;
  
  // Card styling
  cardBg?: string;
  cardBorder?: string;
  cardShadow?: string;
}

export interface PlanetColorPalette {
  mercury: { primary: string; secondary: string; accent: string };
  venus: { primary: string; secondary: string; accent: string };
  earth: { primary: string; secondary: string; accent: string };
  mars: { primary: string; secondary: string; accent: string };
  jupiter: { primary: string; secondary: string; accent: string };
  saturn: { primary: string; secondary: string; accent: string };
  uranus: { primary: string; secondary: string; accent: string };
  neptune: { primary: string; secondary: string; accent: string };
  pluto: { primary: string; secondary: string; accent: string };
}
