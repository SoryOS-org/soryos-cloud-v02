/**
 * @soryos/ui
 * Button component - Multi-platform compatible with planet themes and animations.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "planet" | "glow";
  size?: "default" | "sm" | "lg" | "icon";
  planet?: "mercury" | "venus" | "earth" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto";
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, planet, loading, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    const planetGradients = {
      mercury: "bg-gradient-to-r from-gray-400 to-gray-600",
      venus: "bg-gradient-to-r from-yellow-400 to-orange-500",
      earth: "bg-gradient-to-r from-blue-500 to-green-500",
      mars: "bg-gradient-to-r from-red-500 to-orange-500",
      jupiter: "bg-gradient-to-r from-purple-500 to-pink-500",
      saturn: "bg-gradient-to-r from-yellow-500 to-amber-500",
      uranus: "bg-gradient-to-r from-cyan-500 to-blue-500",
      neptune: "bg-gradient-to-r from-blue-500 to-indigo-500",
      pluto: "bg-gradient-to-r from-gray-500 to-slate-500",
    };

    const planetHoverGradients = {
      mercury: "hover:bg-gradient-to-r hover:from-gray-500 hover:to-gray-700",
      venus: "hover:bg-gradient-to-r hover:from-yellow-500 hover:to-orange-600",
      earth: "hover:bg-gradient-to-r hover:from-blue-600 hover:to-green-600",
      mars: "hover:bg-gradient-to-r hover:from-red-600 hover:to-orange-600",
      jupiter: "hover:bg-gradient-to-r hover:from-purple-600 hover:to-pink-600",
      saturn: "hover:bg-gradient-to-r hover:from-yellow-600 hover:to-amber-600",
      uranus: "hover:bg-gradient-to-r hover:from-cyan-600 hover:to-blue-600",
      neptune: "hover:bg-gradient-to-r hover:from-blue-600 hover:to-indigo-600",
      pluto: "hover:bg-gradient-to-r hover:from-gray-600 hover:to-slate-600",
    };

    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
          {
            "h-10 py-2 px-4": size === "default",
            "h-9 px-3 rounded-md": size === "sm",
            "h-11 px-8 rounded-xl": size === "lg",
            "h-10 w-10": size === "icon",
            
            // Default variant
            "bg-primary text-primary-foreground hover:bg-primary/90": variant === "default",
            
            // Destructive variant
            "bg-destructive text-destructive-foreground hover:bg-destructive/90": variant === "destructive",
            
            // Outline variant
            "border border-input hover:bg-accent hover:text-accent-foreground": variant === "outline",
            
            // Secondary variant
            "bg-secondary text-secondary-foreground hover:bg-secondary/80": variant === "secondary",
            
            // Ghost variant
            "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
            
            // Link variant
            "underline-offset-4 hover:underline text-primary": variant === "link",
            
            // Planet variant
            "text-white shadow-lg hover:shadow-xl transition-shadow duration-300": variant === "planet",
            [planetGradients[planet || "earth"]]: variant === "planet",
            [planetHoverGradients[planet || "earth"]]: variant === "planet",
            
            // Glow variant
            "bg-primary/20 text-primary-foreground border border-primary/30 hover:bg-primary/30": variant === "glow",
            "ring-1 ring-primary/50": variant === "glow",
            
            // Loading state
            "opacity-70 cursor-not-allowed": loading,
          },
          className
        )}
        ref={ref}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading && (
          <svg
            className="-ml-2 mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {props.children}
      </Comp>
    );
  }
);

Button.displayName = "Button";

export { Button };

export type { ButtonProps };
