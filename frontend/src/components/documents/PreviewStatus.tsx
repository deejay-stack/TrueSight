import { FileWarning, Loader2 } from "lucide-react";

export function PreviewStatus({ loading = false, message }: { loading?: boolean; message: string }) {
  const Icon = loading ? Loader2 : FileWarning;
  return <div className="document-preview-status" role={loading ? "status" : "alert"}>
    <Icon className={`h-7 w-7 text-[var(--app-accent)] ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
    <p>{message}</p>
  </div>;
}
