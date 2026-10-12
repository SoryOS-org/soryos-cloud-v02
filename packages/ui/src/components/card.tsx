/**
 * @soryos/ui
 * Card component - Multi-platform compatible card with planet themes.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface CardProps extends React.ComponentProps<"div"> {
  variant?: "default" | "planet" | "glass" | "bordered" | "elevated";
  planet?: "mercury" | "venus" | "earth" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto";
  glow?: boolean;
}

function Card({ className, variant = "default", planet, glow = false, ...props }: CardProps) {
  const planetColors = {
    mercury: "bg-gradient-to-br from-gray-200 to-gray-400",
    venus: "bg-gradient-to-br from-yellow-200 to-orange-300",
    earth: "bg-gradient-to-br from-blue-200 to-green-300",
    mars: "bg-gradient-to-br from-red-200 to-orange-300",
    jupiter: "bg-gradient-to-br from-purple-200 to-pink-300",
    saturn: "bg-gradient-to-br from-yellow-200 to-amber-300",
    uranus: "bg-gradient-to-br from-cyan-200 to-blue-300",
    neptune: "bg-gradient-to-br from-blue-200 to-indigo-300",
    pluto: "bg-gradient-to-br from-gray-300 to-slate-400",
  };

  const baseClasses = cn(
    "text-card-foreground rounded-xl border shadow-sm",
    {
      "bg-card": variant === "default",
      "bg-white dark:bg-gray-900": variant === "default",
      "border-card-border": variant === "default",
      
      // Planet variant
      "border-0": variant === "planet",
      "shadow-lg": variant === "planet",
      [planetColors[planet || "earth"]]: variant === "planet" && planet,
      
      // Glass variant
      "bg-white/80 dark:bg-gray-900/80": variant === "glass",
      "backdrop-blur-lg": variant === "glass",
      "border-white/20 dark:border-gray-800/20": variant === "glass",
      
      // Bordered variant
      "border-2": variant === "bordered",
      "bg-card": variant === "bordered",
      
      // Elevated variant
      "shadow-xl": variant === "elevated",
      "border-0": variant === "elevated",
      
      // Glow effect
      "ring-2 ring-primary/20": glow,
      "ring-4 ring-primary/30 dark:ring-primary/40": glow && variant === "planet",
    },
    className
  );

  return (
    <div
      data-slot="card"
      className={baseClasses}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};

export type { CardProps };
