import { useState } from "react";
import type { ClassSubmission } from "../../../services/classService";
import { AuthorizedDocumentPreview } from "../../../components/documents/AuthorizedDocumentPreview";
import { AnalysisSummary } from "./AnalysisSummary";
import { TextEvidencePanel } from "./TextEvidencePanel";

export function SubmissionReviewWorkspace({ submission, darkMode }: { submission: ClassSubmission; darkMode: boolean }) {
  const [tab, setTab] = useState<"preview" | "analysis">("preview");
  const keyboardTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "preview" : event.key === "End" ? "analysis" : tab === "preview" ? "analysis" : "preview";
    setTab(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`#review-${next}-tab`)?.focus();
  };
  return <section className="submission-review-workspace" aria-label="Submission preview and AI analysis">
    <div className="submission-review-tabs" role="tablist" aria-label="Review views" onKeyDown={keyboardTab}>
      <button type="button" id="review-preview-tab" role="tab" tabIndex={tab === "preview" ? 0 : -1} aria-selected={tab === "preview"} aria-controls="review-preview" onClick={() => setTab("preview")}>Original preview</button>
      <button type="button" id="review-analysis-tab" role="tab" tabIndex={tab === "analysis" ? 0 : -1} aria-selected={tab === "analysis"} aria-controls="review-analysis" onClick={() => setTab("analysis")}>AI analysis &amp; evidence</button>
    </div>
    <div className="submission-review-columns" data-active-view={tab}>
      <div id="review-preview" role="tabpanel" aria-labelledby="review-preview-tab" className="submission-preview-column"><AuthorizedDocumentPreview documentType="submission" documentId={submission.id} code={submission.submissionType === "code"} language={submission.programmingLanguage} darkMode={darkMode} /></div>
      <div id="review-analysis" role="tabpanel" aria-labelledby="review-analysis-tab" className="submission-analysis-column"><AnalysisSummary submission={submission} /><TextEvidencePanel key={submission.updatedAt} details={submission.analysisDetails} /></div>
    </div>
  </section>;
}
