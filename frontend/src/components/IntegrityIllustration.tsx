import { Braces, FileText, Image, ScanLine, ShieldCheck } from "lucide-react";

/** Decorative illustration; it never represents a live analysis result. */
export function IntegrityIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`integrity-art ${compact ? "integrity-art-compact" : ""}`} aria-hidden="true">
      <div className="integrity-orbit integrity-orbit-outer" />
      <div className="integrity-orbit integrity-orbit-inner" />
      <div className="integrity-sheet integrity-sheet-back" />
      <div className="integrity-sheet integrity-sheet-front">
        <div className="flex items-center justify-between border-b theme-border pb-4">
          <span className="design-eyebrow">A clearer perspective</span>
          <ShieldCheck className="h-5 w-5 text-[var(--app-accent)]" />
        </div>
        <div className="integrity-lines"><i /><i /><i /><i /><i /></div>
        <div className="integrity-scan"><ScanLine className="h-5 w-5" /><span>Insight beyond the score</span></div>
        <div className="integrity-lines integrity-lines-short"><i /><i /><i /></div>
        <div className="integrity-sheet-footer"><span className="integrity-dot" />Human judgment at the center</div>
      </div>
      <div className="integrity-file integrity-file-text"><FileText className="h-5 w-5" /><span>Text</span></div>
      <div className="integrity-file integrity-file-code"><Braces className="h-5 w-5" /><span>Code</span></div>
      <div className="integrity-file integrity-file-image"><Image className="h-5 w-5" /><span>Images</span></div>
      <span className="integrity-coordinate">SUBMIT / UNDERSTAND / REVIEW</span>
    </div>
  );
}
