import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  FileImage,
  Maximize2,
  RefreshCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { formatFileSize } from "../../../utils/documentPreview";
import { getDisplayInitials } from "../../../utils/profileImage";
import { getRoleThemeStyle } from "../../../theme/roleThemes";
import type { EnrollmentRequest } from "../services/teacherClassroomService";

type TeacherUploadsSectionProps = {
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
  return (
    <button
      type="button"
      onClick={() => onOpen(request)}
      className="theme-ring group flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)]"
    >
      {request.corDataUrl ? (
        <img
          src={request.corDataUrl}
          alt={`${request.studentName ?? "Student"} COR thumbnail`}
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
      ) : (
        <FileImage className="h-5 w-5 text-[var(--app-muted)]" />
      )}
    </button>
  );
}

export function TeacherUploadsSection({
  requests,
  isLoading,
  reviewingId,
  onRefresh,
  onAccept,
  onReject,
}: TeacherUploadsSectionProps) {
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const [selectedRequest, setSelectedRequest] =
    useState<EnrollmentRequest | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewImageError, setPreviewImageError] = useState(false);

  const openViewer = (request: EnrollmentRequest) => {
    setSelectedRequest(request);
    setRejectionNote(request.rejectionNote ?? "");
    setPreviewZoom(1);
    setPreviewImageError(false);
  };

  const closeViewer = () => {
    setSelectedRequest(null);
    setRejectionNote("");
    setPreviewZoom(1);
    setPreviewImageError(false);
  };

  useEffect(() => {
    if (!selectedRequest) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedRequest(null);
        setRejectionNote("");
        setPreviewZoom(1);
        setPreviewImageError(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedRequest]);

  useLayoutEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport || !selectedRequest) return;

    viewport.scrollLeft = Math.max(
      0,
      (viewport.scrollWidth - viewport.clientWidth) / 2,
    );
    viewport.scrollTop = Math.max(
      0,
      (viewport.scrollHeight - viewport.clientHeight) / 2,
    );
  }, [previewZoom, selectedRequest]);

  const pendingCount = requests.filter((request) => request.status === "pending").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--app-text)]">Uploads</h2>
          <p className="text-sm theme-muted">
            Review student COR submissions before class enrollment is granted.
          </p>
        </div>
        <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={["mr-2 h-4 w-4", isLoading ? "animate-spin" : ""].join(" ")} />
          Refresh
        </Button>
      </div>

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
            No COR enrollment requests yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b theme-border text-xs uppercase tracking-wide theme-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
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
                      <StatusBadge status={request.status} />
                    </td>
                    <td className="px-4 py-3">
                      <CorThumbnail request={request} onOpen={openViewer} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openViewer(request)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onAccept(request)}
                          disabled={request.status !== "pending" || reviewingId === request.id}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Accept
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
                        <StatusBadge status={request.status} />
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
                      className="w-full"
                      size="sm"
                      onClick={() => onAccept(request)}
                      disabled={request.status !== "pending" || reviewingId === request.id}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Accept
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

              <div className="flex min-h-0 flex-1 flex-col">
                <div
                  className="relative min-h-0 flex-1 overflow-hidden bg-[color-mix(in_srgb,var(--app-bg)_82%,black)]"
                >
                  <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_94%,transparent)] p-1 shadow-[var(--app-shadow)]">
                    <button
                      type="button"
                      title="Zoom out"
                      aria-label="Zoom out"
                      disabled={previewZoom <= 1}
                      onClick={() => setPreviewZoom((current) => Math.max(1, current - 0.25))}
                      className="theme-ring grid h-8 w-8 place-items-center rounded-md text-[var(--app-text)] transition hover:bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <span className="w-12 text-center text-xs font-semibold text-[var(--app-text)]">
                      {Math.round(previewZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      title="Zoom in"
                      aria-label="Zoom in"
                      disabled={previewZoom >= 3}
                      onClick={() => setPreviewZoom((current) => Math.min(3, current + 0.25))}
                      className="theme-ring grid h-8 w-8 place-items-center rounded-md text-[var(--app-text)] transition hover:bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Fit image"
                      aria-label="Fit image"
                      onClick={() => setPreviewZoom(1)}
                      className="theme-ring grid h-8 w-8 place-items-center rounded-md text-[var(--app-text)] transition hover:bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)]"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div ref={previewViewportRef} className="h-full w-full overflow-auto">
                  {selectedRequest.corDataUrl && !previewImageError ? (
                    <div
                      className="flex min-h-full min-w-full items-center justify-center p-2"
                      style={{
                        width: `${previewZoom * 100}%`,
                        height: `${previewZoom * 100}%`,
                      }}
                    >
                      <img
                        key={selectedRequest.corDataUrl}
                        src={selectedRequest.corDataUrl}
                        alt={`${selectedRequest.studentName ?? "Student"} COR`}
                        className="block h-full w-full object-contain object-center"
                        loading="eager"
                        decoding="sync"
                        onError={() => setPreviewImageError(true)}
                        style={{
                          display: "block",
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          objectPosition: "center",
                        }}
                      />
                    </div>
                  ) : (
                    <div className="grid h-full min-h-80 place-items-center px-6 text-center text-sm theme-muted">
                      {previewImageError
                        ? "The COR image could not be decoded. Refresh the uploads and open it again."
                        : "COR preview unavailable."}
                    </div>
                  )}
                  </div>
                </div>

                <div className="max-h-[42dvh] shrink-0 overflow-y-auto border-t theme-border px-4 py-2.5 text-xs">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
                  <div>
                    <p className="uppercase theme-muted">Sender</p>
                    <p className="font-semibold text-[var(--app-text)]">
                      {selectedRequest.studentName ?? "Student"}
                    </p>
                    <p className="truncate text-[var(--app-text)]" title={selectedRequest.studentEmail ?? "No email"}>
                      {selectedRequest.studentEmail ?? "No email"}
                    </p>
                  </div>
                  <div>
                    <p className="uppercase theme-muted">Class</p>
                    <p className="truncate font-semibold text-[var(--app-text)]">
                      {selectedRequest.className}
                    </p>
                    <p className="theme-muted">{selectedRequest.classCode}</p>
                  </div>
                  <div>
                    <p className="uppercase theme-muted">Submitted</p>
                    <p className="font-medium text-[var(--app-text)]">
                      {new Date(selectedRequest.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="uppercase theme-muted">File</p>
                    <p className="truncate font-medium text-[var(--app-text)]" title={selectedRequest.corFileName}>
                      {selectedRequest.corFileName}
                    </p>
                    <p className="theme-muted">
                      {formatFileSize(selectedRequest.corFileSize)}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 uppercase theme-muted">Status</p>
                    <StatusBadge status={selectedRequest.status} />
                  </div>
                  </div>
                  {selectedRequest.status === "pending" && (
                    <div className="mt-2 grid gap-2 border-t theme-border pt-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                      <div>
                      <label className="uppercase theme-muted">
                        Rejection note
                      </label>
                      <input
                        type="text"
                        value={rejectionNote}
                        onChange={(event) => setRejectionNote(event.target.value)}
                        placeholder="Optional note for the student"
                        className="theme-ring mt-1 h-9 w-full rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] px-3 text-xs text-[var(--app-text)]"
                      />
                      </div>
                    <div className="grid grid-cols-2 gap-2">
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
                        disabled={reviewingId === selectedRequest.id}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Accept
                      </Button>
                    </div>
                    </div>
                  )}
                </div>
              </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
