/**
 * @soryos/ui
 * TextArea component - Multi-platform input with enhanced styling.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "default" | "planet" | "glass" | "bordered";
  planet?: "mercury" | "venus" | "earth" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto";
  resize?: "none" | "vertical" | "horizontal" | "both";
}

const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, variant = "default", planet, resize = "vertical", ...props }, ref) => {
    const planetBorders = {
      mercury: "border-gray-400 focus:border-gray-600",
      venus: "border-yellow-400 focus:border-yellow-600",
      earth: "border-blue-500 focus:border-blue-700",
      mars: "border-red-500 focus:border-red-700",
      jupiter: "border-purple-500 focus:border-purple-700",
      saturn: "border-yellow-500 focus:border-yellow-700",
      uranus: "border-cyan-500 focus:border-cyan-700",
      neptune: "border-blue-500 focus:border-blue-700",
      pluto: "border-gray-500 focus:border-gray-700",
    };

    const resizeClasses = {
      none: "resize-none",
      vertical: "resize-y",
      horizontal: "resize-x",
      both: "resize",
    };

    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          {
            // Default variant
            "": variant === "default",
            
            // Planet variant
            "bg-white/5 dark:bg-gray-900/5": variant === "planet",
            "backdrop-blur-sm": variant === "planet",
            [planetBorders[planet || "earth"]]: variant === "planet",
            
            // Glass variant
            "bg-white/80 dark:bg-gray-900/80": variant === "glass",
            "backdrop-blur-lg": variant === "glass",
            "border-white/20 dark:border-gray-800/20": variant === "glass",
            
            // Bordered variant
            "border-2": variant === "bordered",
          },
          resizeClasses[resize],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

TextArea.displayName = "TextArea";

export { TextArea };

export type { TextAreaProps };
