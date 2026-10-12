/**
 * @soryos/ui
 * Theme context for multi-platform theme management.
 */

"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ThemeMode, ColorTheme, AccentColor, UiDensity, AppearancePreferences, PlanetTheme } from "./types";
import { COLOR_THEMES, ACCENT_PALETTES, PLANET_PALETTES } from "./palettes";

interface ThemeContextType {
  theme: ThemeMode;
  colorTheme: ColorTheme;
  accentColor: AccentColor;
  uiDensity: UiDensity;
  fontSize: number;
  planetTheme: PlanetTheme;
  customColors?: Record<string, string>;
  setTheme: (theme: ThemeMode) => void;
  setColorTheme: (colorTheme: ColorTheme) => void;
  setAccentColor: (accentColor: AccentColor) => void;
  setUiDensity: (density: UiDensity) => void;
  setFontSize: (size: number) => void;
  setPlanetTheme: (planet: PlanetTheme) => void;
  toggleTheme: () => void;
}

const defaultPreferences: AppearancePreferences = {
  theme: "system",
  colorTheme: "soryos",
  accentColor: "blue",
  uiDensity: "normal",
  fontSize: 14,
  planetTheme: "earth",
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ThemeMode {
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function getCurrentTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return getSystemTheme();
  }
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AppearancePreferences>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("soryos-theme-preferences");
      if (saved) {
        try {
          return { ...defaultPreferences, ...JSON.parse(saved) };
        } catch {
          return defaultPreferences;
        }
      }
    }
    return defaultPreferences;
  });

  const [systemTheme, setSystemTheme] = useState<ThemeMode>(getSystemTheme());

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => setSystemTheme(mediaQuery.matches ? "dark" : "light");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("soryos-theme-preferences", JSON.stringify(preferences));
      
      // Apply theme to document
      const current = getCurrentTheme(preferences.theme);
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(current);
      
      // Set CSS variables for custom colors
      if (preferences.customColors) {
        Object.entries(preferences.customColors).forEach(([key, value]) => {
          document.documentElement.style.setProperty(`--${key}`, value);
        });
      }
    }
  }, [preferences]);

  const contextValue: ThemeContextType = {
    theme: preferences.theme,
    colorTheme: preferences.colorTheme,
    accentColor: preferences.accentColor,
    uiDensity: preferences.uiDensity,
    fontSize: preferences.fontSize,
    planetTheme: preferences.planetTheme || "earth",
    customColors: preferences.customColors,
    setTheme: (theme) => setPreferences({ ...preferences, theme }),
    setColorTheme: (colorTheme) => setPreferences({ ...preferences, colorTheme }),
    setAccentColor: (accentColor) => setPreferences({ ...preferences, accentColor }),
    setUiDensity: (uiDensity) => setPreferences({ ...preferences, uiDensity }),
    setFontSize: (fontSize) => setPreferences({ ...preferences, fontSize }),
    setPlanetTheme: (planetTheme) => setPreferences({ ...preferences, planetTheme }),
    toggleTheme: () => {
      const newTheme = preferences.theme === "light" ? "dark" : preferences.theme === "dark" ? "system" : "light";
      setPreferences({ ...preferences, theme: newTheme });
    },
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export function useThemeTokens() {
  const { theme, colorTheme, accentColor, planetTheme } = useTheme();
  const currentMode = getCurrentTheme(theme);
  const themeTokens = COLOR_THEMES[colorTheme]?.[currentMode] || COLOR_THEMES.soryos[currentMode];
  const accentPalette = ACCENT_PALETTES[accentColor] || ACCENT_PALETTES.blue;
  const planetPalette = PLANET_PALETTES[planetTheme] || PLANET_PALETTES.earth;

  return {
    ...themeTokens,
    ...accentPalette,
    ...planetPalette,
    mode: currentMode,
  };
}

export { ThemeContext };
