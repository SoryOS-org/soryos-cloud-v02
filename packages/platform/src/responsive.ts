/**
 * @soryos/platform
 * Responsive design utilities for multi-platform layouts.
 */

import type { ResponsiveBreakpoint, ResponsiveValue } from "./types";
import { detectPlatformType, getPlatformInfo } from "./detect";

// Breakpoint values in pixels
export const BREAKPOINTS: Record<ResponsiveBreakpoint, number> = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

/**
 * Get the current breakpoint based on screen width
 */
export function getCurrentBreakpoint(): ResponsiveBreakpoint {
  if (typeof window === "undefined") {
    return "md"; // Default to medium for server-side rendering
  }

  const width = window.innerWidth;
  
  if (width >= BREAKPOINTS["2xl"]) return "2xl";
  if (width >= BREAKPOINTS.xl) return "xl";
  if (width >= BREAKPOINTS.lg) return "lg";
  if (width >= BREAKPOINTS.md) return "md";
  if (width >= BREAKPOINTS.sm) return "sm";
  
  return "xs";
}

/**
 * Get the appropriate value for the current breakpoint
 */
export function getResponsiveValue<T>(
  responsiveValue: ResponsiveValue<T>
): T {
  const breakpoint = getCurrentBreakpoint();
  
  // Return the most specific value available
  if (responsiveValue[breakpoint] !== undefined) {
    return responsiveValue[breakpoint]!;
  }
  
  // Fallback to base value
  return responsiveValue.base;
}

/**
 * Check if the current breakpoint matches or is larger than the specified breakpoint
 */
export function isBreakpointUp(breakpoint: ResponsiveBreakpoint): boolean {
  if (typeof window === "undefined") {
    return true; // Assume true for server-side rendering
  }

  const currentBreakpoint = getCurrentBreakpoint();
  const breakpoints = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
  const currentIndex = breakpoints.indexOf(currentBreakpoint);
  const targetIndex = breakpoints.indexOf(breakpoint);
  
  return currentIndex >= targetIndex;
}

/**
 * Check if the current breakpoint matches or is smaller than the specified breakpoint
 */
export function isBreakpointDown(breakpoint: ResponsiveBreakpoint): boolean {
  if (typeof window === "undefined") {
    return false; // Assume false for server-side rendering
  }

  const currentBreakpoint = getCurrentBreakpoint();
  const breakpoints = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
  const currentIndex = breakpoints.indexOf(currentBreakpoint);
  const targetIndex = breakpoints.indexOf(breakpoint);
  
  return currentIndex <= targetIndex;
}

/**
 * Check if the current breakpoint is exactly the specified breakpoint
 */
export function isBreakpointOnly(breakpoint: ResponsiveBreakpoint): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return getCurrentBreakpoint() === breakpoint;
}

/**
 * Check if the current breakpoint is between two breakpoints (inclusive)
 */
export function isBreakpointBetween(
  minBreakpoint: ResponsiveBreakpoint,
  maxBreakpoint: ResponsiveBreakpoint
): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const currentBreakpoint = getCurrentBreakpoint();
  const breakpoints = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
  const currentIndex = breakpoints.indexOf(currentBreakpoint);
  const minIndex = breakpoints.indexOf(minBreakpoint);
  const maxIndex = breakpoints.indexOf(maxBreakpoint);
  
  return currentIndex >= minIndex && currentIndex <= maxIndex;
}

/**
 * Platform-specific responsive values
 */
export function getPlatformResponsiveValue<T>(
  values: {
    mobile?: T;
    tablet?: T;
    desktop?: T;
    web?: T;
    default: T;
  }
): T {
  const platform = detectPlatformType();
  
  switch (platform) {
    case "mobile":
      return values.mobile || values.default;
    case "tablet":
      return values.tablet || values.mobile || values.default;
    case "desktop":
      return values.desktop || values.default;
    case "web":
      return values.web || values.default;
    default:
      return values.default;
  }
}

/**
 * Create a responsive class name based on breakpoints
 */
export function createResponsiveClass(
  prefix: string,
  values: ResponsiveValue<string>
): string {
  const breakpoint = getCurrentBreakpoint();
  const baseValue = values.base;
  const breakpointValue = values[breakpoint];
  
  const value = breakpointValue || baseValue;
  return `${prefix}-${value}`;
}

/**
 * Create responsive classes for multiple properties
 */
export function createResponsiveClasses(
  properties: Record<string, ResponsiveValue<string>>
): string {
  const classes: string[] = [];
  
  for (const [prefix, values] of Object.entries(properties)) {
    const value = getResponsiveValue(values);
    classes.push(`${prefix}-${value}`);
  }
  
  return classes.join(" ");
}

/**
 * Get platform-specific layout classes
 */
export function getPlatformLayoutClasses(): {
  container: string;
  sidebar: string;
  main: string;
  header: string;
  footer: string;
} {
  const platform = detectPlatformType();
  const info = getPlatformInfo();
  
  switch (platform) {
    case "mobile":
      return {
        container: "w-full h-screen overflow-hidden",
        sidebar: "fixed inset-0 z-50 transform translate-x-full transition-transform duration-300",
        main: "w-full h-full",
        header: "h-14",
        footer: "h-16",
      };
    case "tablet":
      return {
        container: "w-full h-screen overflow-hidden flex",
        sidebar: "w-64 h-full shrink-0",
        main: "flex-1 overflow-auto",
        header: "h-16",
        footer: "h-16",
      };
    case "desktop":
      return {
        container: "w-full h-screen overflow-hidden flex",
        sidebar: "w-80 h-full shrink-0",
        main: "flex-1 overflow-auto",
        header: "h-16",
        footer: "h-16",
      };
    case "web":
    default:
      return {
        container: "w-full h-screen overflow-hidden flex",
        sidebar: info.screenWidth >= 768 ? "w-80 h-full shrink-0" : "fixed inset-0 z-50 transform translate-x-full transition-transform duration-300",
        main: "flex-1 overflow-auto",
        header: info.screenWidth >= 768 ? "h-16" : "h-14",
        footer: "h-16",
      };
  }
}

/**
 * Get platform-specific spacing values
 */
export function getPlatformSpacing(): {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
} {
  const platform = detectPlatformType();
  
  switch (platform) {
    case "mobile":
      return {
        xs: 8,
        sm: 12,
        md: 16,
        lg: 24,
        xl: 32,
      };
    case "tablet":
      return {
        xs: 12,
        sm: 16,
        md: 24,
        lg: 32,
        xl: 48,
      };
    case "desktop":
      return {
        xs: 16,
        sm: 24,
        md: 32,
        lg: 48,
        xl: 64,
      };
    case "web":
    default:
      // Use responsive values based on screen size
      if (typeof window !== "undefined") {
        const width = window.innerWidth;
        if (width >= 1280) {
          return {
            xs: 16,
            sm: 24,
            md: 32,
            lg: 48,
            xl: 64,
          };
        }
        if (width >= 768) {
          return {
            xs: 12,
            sm: 16,
            md: 24,
            lg: 32,
            xl: 48,
          };
        }
        return {
          xs: 8,
          sm: 12,
          md: 16,
          lg: 24,
          xl: 32,
        };
      }
      return {
        xs: 12,
        sm: 16,
        md: 24,
        lg: 32,
        xl: 48,
      };
  }
}

/**
 * Get platform-specific font sizes
 */
export function getPlatformFontSizes(): {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
} {
  const platform = detectPlatformType();
  
  switch (platform) {
    case "mobile":
      return {
        xs: 10,
        sm: 12,
        md: 14,
        lg: 16,
        xl: 18,
      };
    case "tablet":
      return {
        xs: 12,
        sm: 14,
        md: 16,
        lg: 18,
        xl: 20,
      };
    case "desktop":
      return {
        xs: 12,
        sm: 14,
        md: 16,
        lg: 18,
        xl: 24,
      };
    case "web":
    default:
      return {
        xs: 12,
        sm: 14,
        md: 16,
        lg: 18,
        xl: 20,
      };
  }
}
