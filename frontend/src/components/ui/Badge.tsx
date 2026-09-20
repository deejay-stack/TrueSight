import * as React from "react"
import { cn } from "./utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-[var(--app-accent)] text-[var(--app-on-accent)]": variant === "default",
          "border-transparent bg-[color-mix(in_srgb,var(--app-accent)_12%,var(--app-surface))] text-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_18%,var(--app-surface))]": variant === "secondary",
          "border-transparent bg-rose-500/15 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300": variant === "destructive",
          "border-transparent bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300": variant === "success",
          "border-transparent bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300": variant === "warning",
          "theme-border text-[var(--app-text)]": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
