import { Info, Settings } from "lucide-react";

export const SUPPORT_SIDEBAR_LABEL = "System";

export const SUPPORT_SIDEBAR_ITEMS = [
  { key: "settings", label: "Settings", icon: Settings },
  { key: "about", label: "About", icon: Info },
] as const;
