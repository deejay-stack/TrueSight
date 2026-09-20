import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "../../context/useAuth";

type GlobalThemeToggleProps = {
  className?: string;
};

export function GlobalThemeToggle({ className = "" }: GlobalThemeToggleProps) {
  const { darkMode, toggleTheme } = useAuth();

  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={toggleTheme}
      aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      className={[
        "theme-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
        "border theme-border transition-all duration-200",
        "bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)]",
        "text-[var(--app-accent)] shadow-[var(--app-shadow)]",
        className,
      ].join(" ")}
    >
      {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </motion.button>
  );
}
