import * as React from "react"
import { cn } from "../..//utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "ui-input theme-ring flex h-10 w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] px-3 py-2 text-sm text-[var(--app-text)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--app-muted)]/85 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
