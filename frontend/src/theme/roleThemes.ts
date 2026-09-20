import type { CSSProperties } from "react";
import type { UserRole } from "../context/auth-types";

export type RoleTheme = {
  role: UserRole;
  label: string;
  counterpartLabel: string;
  accent: string;
  accent2: string;
  tint: string;
  border: string;
  ring: string;
  glow: string;
  bg: string;
  bgSoft: string;
  surface: string;
  surfaceStrong: string;
  shadow: string;
  darkAccent: string;
  darkAccent2: string;
  darkBorder: string;
  darkRing: string;
  darkGlow: string;
  darkBg: string;
  darkBgSoft: string;
  darkSurface: string;
  darkSurfaceStrong: string;
  darkShadow: string;
};

export type RoleThemeStyle = CSSProperties & Record<`--${string}`, string>;

export const roleThemes: Record<UserRole, RoleTheme> = {
  student: {
    role: "student",
    label: "Student",
    counterpartLabel: "Teacher",
    accent: "#5746c6",
    accent2: "#3857b6",
    tint: "#eeebff",
    border: "#b8bdcf",
    ring: "rgba(37, 99, 235, 0.28)",
    glow: "0 0 36px rgba(87, 70, 198, 0.10), 0 0 74px rgba(37, 99, 235, 0.16)",
    bg: "#f8f9fc",
    bgSoft: "#f0f1f8",
    surface: "#ffffff",
    surfaceStrong: "#f5f5fa",
    shadow: "0 4px 18px rgba(26, 24, 48, 0.045)",
    darkAccent: "#b9adff",
    darkAccent2: "#95bdff",
    darkBorder: "#656477",
    darkRing: "rgba(34, 211, 238, 0.32)",
    darkGlow: "0 0 42px rgba(185, 173, 255, 0.10), 0 0 90px rgba(37, 99, 235, 0.14)",
    darkBg: "#101014",
    darkBgSoft: "#14141c",
    darkSurface: "#18181f",
    darkSurfaceStrong: "#202029",
    darkShadow: "0 8px 24px rgba(0, 0, 0, 0.16)",
  },
  teacher: {
    role: "teacher",
    label: "Teacher",
    counterpartLabel: "Student",
    accent: "#6d3bc3",
    accent2: "#4b52bd",
    tint: "#f0eaff",
    border: "#bbb6cb",
    ring: "rgba(109, 40, 217, 0.3)",
    glow: "0 0 36px rgba(109, 59, 195, 0.10), 0 0 82px rgba(109, 40, 217, 0.2)",
    bg: "#f9f8fc",
    bgSoft: "#f1eef8",
    surface: "#ffffff",
    surfaceStrong: "#f6f4fa",
    shadow: "0 4px 18px rgba(26, 24, 48, 0.045)",
    darkAccent: "#c2b1ff",
    darkAccent2: "#a6baff",
    darkBorder: "#696276",
    darkRing: "rgba(196, 181, 253, 0.34)",
    darkGlow: "0 0 42px rgba(194, 177, 255, 0.10), 0 0 92px rgba(109, 40, 217, 0.24)",
    darkBg: "#101014",
    darkBgSoft: "#15141c",
    darkSurface: "#18171f",
    darkSurfaceStrong: "#211f2b",
    darkShadow: "0 8px 24px rgba(0, 0, 0, 0.16)",
  },
};

const isDocumentDark = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark");

export const getRoleThemeStyle = (role: UserRole, darkMode = isDocumentDark()): RoleThemeStyle => {
  const theme = roleThemes[role];
  const accent = darkMode ? theme.darkAccent : theme.accent;
  const accent2 = darkMode ? theme.darkAccent2 : theme.accent2;
  const border = darkMode ? theme.darkBorder : theme.border;
  const ring = darkMode ? theme.darkRing : theme.ring;
  const glow = darkMode ? theme.darkGlow : theme.glow;
  const bg = darkMode ? theme.darkBg : theme.bg;
  const bgSoft = darkMode ? theme.darkBgSoft : theme.bgSoft;
  const surface = darkMode ? theme.darkSurface : theme.surface;
  const surfaceStrong = darkMode ? theme.darkSurfaceStrong : theme.surfaceStrong;
  const shadow = darkMode ? theme.darkShadow : theme.shadow;

  return {
    "--app-text": darkMode ? "#f8fafc" : "#0f172a",
    "--app-muted": darkMode ? "#a8b5c8" : "#435268",
    "--app-on-accent": darkMode ? "#0f172a" : "#ffffff",
    "--auth-accent": accent,
    "--auth-accent-2": accent2,
    "--auth-tint": theme.tint,
    "--app-accent": accent,
    "--app-accent-2": accent2,
    "--app-border": border,
    "--app-ring": ring,
    "--app-glow": glow,
    "--app-bg": bg,
    "--app-bg-soft": bgSoft,
    "--app-surface": surface,
    "--app-surface-strong": surfaceStrong,
    "--app-shadow": shadow,
  };
};
