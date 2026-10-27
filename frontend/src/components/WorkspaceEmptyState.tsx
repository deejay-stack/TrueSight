import type { LucideIcon } from "lucide-react";

export function WorkspaceEmptyState({ icon: Icon, title, description }: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="workspace-empty-state">
      <div className="workspace-empty-icon" aria-hidden="true"><Icon strokeWidth={1.5} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
