import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "./utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(
          "ui-button theme-ring inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-[linear-gradient(135deg,var(--app-accent),var(--app-accent-2))] text-[var(--app-on-accent)] shadow-[var(--app-shadow)] hover:translate-y-[-1px]": variant === "default",
            "bg-rose-700 text-white shadow-[var(--app-shadow)] hover:bg-rose-800 hover:translate-y-[-1px]": variant === "destructive",
            "border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] text-[var(--app-text)] hover:bg-[color-mix(in_srgb,var(--app-accent)_8%,var(--app-surface))]": variant === "outline",
            "bg-[color-mix(in_srgb,var(--app-accent)_14%,transparent)] text-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_20%,transparent)]": variant === "secondary",
            "text-[var(--app-muted)] hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] hover:text-[var(--app-text)]": variant === "ghost",
            "text-[var(--app-accent)] underline-offset-4 hover:underline": variant === "link",
            "h-10 px-4 py-2": size === "default",
            "h-9 rounded-lg px-3": size === "sm",
            "h-12 rounded-xl px-8 text-base": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
