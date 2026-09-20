import { GraduationCap, MessageSquareText, Network, ShieldCheck } from "lucide-react";

type AppLogoProps = {
  variant?: "full" | "icon";
  tone?: "light" | "dark";
  className?: string;
  iconClassName?: string;
};

export function AppLogo({
  variant = "full",
  tone = "light",
  className = "",
  iconClassName = "",
}: AppLogoProps) {
  const textTone = tone === "dark" ? "text-white" : "text-[var(--app-text)]";
  const mutedTone = tone === "dark" ? "text-white/72" : "text-[var(--app-muted)]";

  return (
    <div className={`inline-flex min-w-0 items-center gap-3 ${className}`}>
      <div
        className={[
          "relative grid shrink-0 place-items-center overflow-hidden rounded-2xl",
          "bg-[linear-gradient(135deg,var(--app-accent),var(--app-accent-2))] text-[var(--app-on-accent)] shadow-[var(--app-shadow)]",
          iconClassName || "h-12 w-12",
        ].join(" ")}
        aria-hidden="true"
      >
        <ShieldCheck className="absolute h-[72%] w-[72%] opacity-25" strokeWidth={1.5} />
        <GraduationCap className="h-[48%] w-[48%]" strokeWidth={2.1} />
        <MessageSquareText
          className="absolute bottom-[16%] right-[15%] h-[28%] w-[28%]"
          strokeWidth={2.2}
        />
        <Network
          className="absolute left-[13%] top-[14%] h-[24%] w-[24%] opacity-90"
          strokeWidth={2.2}
        />
      </div>

      {variant === "full" && (
        <div className="min-w-0 leading-none">
          <p className={`truncate text-lg font-extrabold ${textTone}`}>TrueSight</p>
          <p className={`mt-1 truncate text-[11px] font-semibold uppercase ${mutedTone}`}>
            Classroom Integrity
          </p>
        </div>
      )}
    </div>
  );
}
