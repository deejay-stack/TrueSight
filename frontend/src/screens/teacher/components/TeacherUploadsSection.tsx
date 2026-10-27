import { AuthorizedDocumentPreview } from "../../../components/documents/AuthorizedDocumentPreview";
import { previewKind } from "../../../utils/filePreview";
import { FileCheck2, AlertCircle, Check, CheckCircle2, Clock3, Eye, FileImage, RefreshCw, X } from "lucide-react";
import { WorkspaceHeading } from "../../../components/WorkspaceHeading";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { formatFileSize } from "../../../utils/documentPreview";
import { getDisplayInitials } from "../../../utils/profileImage";
import { getRoleThemeStyle } from "../../../theme/roleThemes";
import { semesterLabel } from "../../../utils/curriculum";
import { AcademicEnrollmentIntents } from './AcademicEnrollmentIntents';
import type { AcademicEnrollmentIntent } from '../../../services/academicEnrollmentService';
import { fetchDocumentPreview, type EnrollmentRequest } from "../services/teacherClassroomService";

type TeacherUploadsSectionProps = {
  academicIntents?: AcademicEnrollmentIntent[];
  reviewingAcademicId?: number|null;
  onReviewAcademic?: (intent:AcademicEnrollmentIntent,status:'accepted'|'rejected',note:string)=>void;
  focusIntentId?: string|null;
  focusRequestId?: string|null;
  darkMode?: boolean;
  requests: EnrollmentRequest[];
  isLoading: boolean;
  reviewingId: string | null;
  onRefresh: () => void;
  onAccept: (request: EnrollmentRequest) => void;
  onReject: (request: EnrollmentRequest, rejectionNote?: string) => void;
};

const getStatusBadge = (
  status: EnrollmentRequest["status"],
): "success" | "destructive" | "warning" => {
  if (status === "accepted") return "success";
  if (status === "rejected") return "destructive";
  return "warning";
};

const STATUS_ICONS = {
  accepted: CheckCircle2,
  rejected: AlertCircle,
  pending: Clock3,
} as const;

function StatusBadge({ status }: { status: EnrollmentRequest["status"] }) {
  const Icon = STATUS_ICONS[status];

  return (
    <Badge variant={getStatusBadge(status)}>
      <Icon className="mr-1 h-3.5 w-3.5" />
      {status}
    </Badge>
  );
}

function CorThumbnail({
  request,
  onOpen,
}: {
  request: EnrollmentRequest;
  onOpen: (request: EnrollmentRequest) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<{ id: string; dataUrl: string } | null>(null);
  const isImage = previewKind({ fileName: request.corFileName ?? "", fileType: request.corFileType }) === "image";
  const dataUrl = request.corDataUrl || (preview?.id === request.id ? preview.dataUrl : null);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button || !isImage || request.corDataUrl) return;

    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void fetchDocumentPreview("cor", request.id).then((document) => {
        if (active && document.dataUrl) setPreview({ id: request.id, dataUrl: document.dataUrl });
      }).catch(() => {
        // Keep the file icon; opening the full viewer reports access failures.
      });
    });
    observer.observe(button);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [request.id, request.corDataUrl, isImage]);

  return (
    <button
      ref={buttonRef}
      type="button"
      data-cor-id={request.id}
      aria-label={`Preview COR submitted by ${request.studentName ?? "Student"}`}
      onClick={() => onOpen(request)}
      className="theme-ring group flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)]"
    >
      {dataUrl && isImage ? (
        <img
          src={dataUrl}
          alt={`${request.studentName ?? "Student"} COR thumbnail`}
          className="h-full w-full object-contain p-1 transition group-hover:scale-105"
        />
      ) : (
        <FileImage className="h-5 w-5 text-[var(--app-muted)]" />
      )}
    </button>
  );
}

export function TeacherUploadsSection({
  academicIntents = [],
  reviewingAcademicId,
  onReviewAcademic,
  focusIntentId,
  focusRequestId,
  darkMode = false,
  requests,
  isLoading,
  reviewingId,
  onRefresh,
  onAccept,
  onReject,
}: TeacherUploadsSectionProps) {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(focusRequestId||null);
  const selectedRequest = requests.find(r => r.id === selectedRequestId) ?? null;
  const [rejectionNote, setRejectionNote] = useState("");

  const openViewer = (request: EnrollmentRequest) => {
    setSelectedRequestId(request.id);
    setRejectionNote(request.rejectionNote ?? "");
  };

  const closeViewer = () => {
    setSelectedRequestId(null);
    setRejectionNote("");
  };

  useEffect(() => {
    if (!selectedRequest) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedRequestId(null);
        setRejectionNote("");
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedRequest]);


  const pendingCount = requests.filter((request) => request.status === "pending").length;

  return (
    <div className="space-y-5">
      <WorkspaceHeading
        eyebrow="CLASSROOM / ENROLLMENT"
        title="Student Enrollment Requests"
        description="Review student registration documents and manage enrollment requests."
        icon={FileCheck2}
        actions={
          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={["mr-2 h-4 w-4", isLoading ? "animate-spin" : ""].join(" ")} />
            Refresh
          </Button>
        }
      />

      <AcademicEnrollmentIntents intents={academicIntents} darkMode={darkMode} reviewingId={reviewingAcademicId} onReview={onReviewAcademic} focusId={focusIntentId}/>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="theme-card">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide theme-muted">Pending</p>
            <p className="mt-2 text-3xl font-bold text-[var(--app-text)]">
              {pendingCount}
            </p>
          </CardContent>
        </Card>
        <Card className="theme-card sm:col-span-2">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide theme-muted">Visibility</p>
            <p className="mt-2 text-sm theme-muted">
              Only requests for classes you own appear here.
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Card className="theme-card">
          <CardContent className="p-6 text-sm theme-muted">
            Loading enrollment uploads...
          </CardContent>
        </Card>
      ) : requests.length === 0 ? (
        <Card className="theme-card">
          <CardContent className="p-6 text-sm theme-muted">
            No separate class approval requests. Saved COR enrollment submissions appear above.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] lg:block">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="border-b theme-border text-xs uppercase tracking-wide theme-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Department / Year / Section</th>
                  <th className="px-4 py-3 font-semibold">Class</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">COR</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y theme-border">
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border theme-border">
                          {request.studentProfileImageUrl ? (
                            <AvatarImage
                              src={request.studentProfileImageUrl}
                              alt={request.studentName ?? "Student"}
                            />
                          ) : null}
                          <AvatarFallback className="text-xs font-semibold text-[var(--app-text)]">
                            {getDisplayInitials(request.studentName ?? "Student")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--app-text)]">
                            {request.studentName ?? "Student"}
                          </p>
                          <p className="truncate text-xs theme-muted">
                            {request.studentEmail ?? "No email"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{request.declaredDepartment || 'Not recorded'} / Year {request.declaredYear || 'not recorded'} / Section {request.declaredSection || 'unassigned'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--app-text)]">
                        {request.className}
                      </p>
                      <p className="text-xs theme-muted">{request.classCode}</p>
                    </td>
                    <td className="px-4 py-3 theme-muted">
                      {new Date(request.submittedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={request.status} /><p className="mt-1 text-xs theme-muted">{request.verificationStatus}</p><p className="mt-1 text-xs theme-muted">{request.eligibilityMessage}</p>
                    </td>
                    <td className="px-4 py-3">
                      <CorThumbnail request={request} onOpen={openViewer} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-44 flex-col items-stretch gap-2">
                        <Button size="sm" variant="outline" onClick={() => openViewer(request)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onAccept(request)}
                          disabled={request.status !== "pending" || reviewingId === request.id || request.eligibleForApproval === false}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Approve Enrollment
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openViewer(request)}
                          disabled={request.status !== "pending" || reviewingId === request.id}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {requests.map((request) => (
              <Card key={request.id} className="theme-card">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 border theme-border">
                      {request.studentProfileImageUrl ? (
                        <AvatarImage
                          src={request.studentProfileImageUrl}
                          alt={request.studentName ?? "Student"}
                        />
                      ) : null}
                      <AvatarFallback className="text-xs font-semibold text-[var(--app-text)]">
                        {getDisplayInitials(request.studentName ?? "Student")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[var(--app-text)]">
                          {request.studentName ?? "Student"}
                        </p>
                        <StatusBadge status={request.status} /><p className="mt-1 text-xs theme-muted">{request.verificationStatus}</p><p className="mt-1 text-xs theme-muted">{request.eligibilityMessage}</p>
                      </div>
                      <p className="text-xs theme-muted">
                        {request.studentEmail ?? "No email"}
                      </p>
                      <p className="mt-2 text-sm text-[var(--app-text)]">
                        {request.className}
                      </p>
                      <p className="text-xs theme-muted">
                        {request.classCode} - {new Date(request.submittedAt).toLocaleString()}
                      </p>
                    </div>
                    <CorThumbnail request={request} onOpen={openViewer} />
                  </div>

                  <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
                    <Button className="w-full" size="sm" variant="outline" onClick={() => openViewer(request)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View COR
                    </Button>
                    <Button
                      className="h-auto min-h-9 w-full whitespace-normal"
                      size="sm"
                      onClick={() => onAccept(request)}
                      disabled={request.status !== "pending" || reviewingId === request.id || request.eligibleForApproval === false}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve Enrollment
                    </Button>
                    <Button
                      className="w-full"
                      size="sm"
                      variant="destructive"
                      onClick={() => openViewer(request)}
                      disabled={request.status !== "pending" || reviewingId === request.id}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {selectedRequest && createPortal(
        <div
          className="role-theme-page fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-2 sm:p-3"
          style={getRoleThemeStyle("teacher")}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeViewer();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cor-preview-title"
            className="theme-surface flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-lg border theme-border bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--app-shadow)]"
          >
              <header className="relative shrink-0 border-b theme-border px-4 py-3 pr-12">
                <h2 id="cor-preview-title" className="text-lg font-semibold text-[var(--app-text)]">
                  Certificate of Registration
                </h2>
                <p className="mt-1 text-xs theme-muted">
                  {selectedRequest.studentName ?? "Student"} - {selectedRequest.className}
                </p>
                <button
                  type="button"
                  onClick={closeViewer}
                  title="Close preview"
                  aria-label="Close preview"
                  className="theme-ring absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md text-[var(--app-muted)] transition hover:bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] hover:text-[var(--app-text)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="p-3 sm:p-5">
                  <AuthorizedDocumentPreview
                    key={selectedRequest.id}
                    documentType="cor"
                    documentId={selectedRequest.id}
                    darkMode={darkMode}
                    className="enrollment-cor-preview"
                  />
                </div>

                <section aria-labelledby="cor-student-details" className="space-y-5 border-t theme-border p-4 text-sm sm:p-5">
                  <h3 id="cor-student-details" className="text-base font-semibold">Student and enrollment information</h3>
                  <div className="rounded-lg border theme-border p-4">
                    <p className="text-xs uppercase theme-muted">Requested official subject</p>
                    <p className="font-semibold">{selectedRequest.subjectCode || 'Unmapped'} — {selectedRequest.subjectName || 'Curriculum configuration required'}</p>
                    <p>Required: {selectedRequest.requiredDepartment || 'Unassigned department'} / Year {selectedRequest.requiredYear || 'unassigned'}</p>
                    <p>{semesterLabel(selectedRequest.semester ?? 1)}</p>
                    <p className="mt-2 theme-muted">Compare this subject code and the academic information against the COR before approval. Subject registration is reviewed manually; no automatic COR match is claimed.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>div]:min-w-0">
                  <div className="space-y-1">
                    <p className="uppercase theme-muted">Sender</p>
                    <p className="font-semibold text-[var(--app-text)]">
                      {selectedRequest.studentName ?? "Student"}
                    </p>
                    <p className="break-words text-[var(--app-text)]">
                      {selectedRequest.studentEmail ?? "No email"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="uppercase theme-muted">Class</p>
                    <p className="break-words font-semibold text-[var(--app-text)]">
                      {selectedRequest.className}
                    </p>
                    <p className="theme-muted">{selectedRequest.classCode}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="uppercase theme-muted">Submitted</p>
                    <p className="font-medium text-[var(--app-text)]">
                      {new Date(selectedRequest.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="uppercase theme-muted">File</p>
                    <p className="break-words font-medium text-[var(--app-text)]">
                      {selectedRequest.corFileName}
                    </p>
                    <p className="theme-muted">
                      {formatFileSize(selectedRequest.corFileSize)}
                    </p>
                  </div>
                  </div>
                  <div className="grid gap-4 rounded-lg border theme-border p-4 sm:grid-cols-2 lg:grid-cols-3 [&>div]:min-w-0">
                    <div className="space-y-1">
                      <p className="uppercase theme-muted">Declared academic information</p>
                      <p className="break-words">{selectedRequest.declaredDepartment || 'Not recorded'} / Year {selectedRequest.declaredYear || 'not recorded'} / Section {selectedRequest.declaredSection || 'unassigned'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="uppercase theme-muted">Official academic information</p>
                      <p className="break-words">{selectedRequest.officialDepartment || 'Unassigned'} / Year {selectedRequest.officialYear || 'unassigned'} / Section {selectedRequest.officialSection || 'unassigned'}</p>
                    </div>
                    <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                      <p className="uppercase theme-muted">Status</p>
                      <StatusBadge status={selectedRequest.status} />
                      <p>{selectedRequest.verificationStatus}</p>
                      <p className="theme-muted">{selectedRequest.eligibilityMessage}</p>
                    </div>
                  </div>
                  {selectedRequest.status === "pending" && (
                    <div className="grid gap-4 border-t theme-border pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                      <div>
                      <label htmlFor="cor-rejection-note" className="uppercase theme-muted">
                        Rejection note
                      </label>
                      <input
                        id="cor-rejection-note"
                        type="text"
                        value={rejectionNote}
                        onChange={(event) => setRejectionNote(event.target.value)}
                        placeholder="Optional note for the student"
                        className="theme-ring mt-2 h-10 w-full rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] px-3 text-sm text-[var(--app-text)]"
                      />
                      </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        className="w-full"
                        variant="destructive"
                        onClick={() => {
                          onReject(selectedRequest, rejectionNote.trim() || undefined);
                          closeViewer();
                        }}
                        disabled={reviewingId === selectedRequest.id}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        className="w-full"
                        onClick={() => {
                          onAccept(selectedRequest);
                          closeViewer();
                        }}
                        disabled={reviewingId === selectedRequest.id || selectedRequest.eligibleForApproval === false}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Approve Enrollment
                      </Button>
                    </div>
                    </div>
                  )}
                </section>
              </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
