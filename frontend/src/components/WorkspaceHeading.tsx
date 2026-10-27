import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function WorkspaceHeading({ eyebrow, title, description, icon: Icon, actions }: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-section-heading">
      <div className="workspace-section-copy">
        <p className="design-eyebrow"><span className="integrity-dot" />{eyebrow}</p>
        <h2>{title}</h2>
        <p className="workspace-section-description">{description}</p>
      </div>
      <div className="workspace-section-actions">{actions}</div>
      <div className="workspace-section-emblem" aria-hidden="true"><Icon strokeWidth={1.25} /></div>
    </header>
  );
}
