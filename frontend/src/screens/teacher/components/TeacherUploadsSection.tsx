import { useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  FileImage,
  RefreshCw,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { formatFileSize } from "../../../utils/documentPreview";
import { getDisplayInitials } from "../../../utils/profileImage";
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

const getStatusIcon = (status: EnrollmentRequest["status"]) => {
  if (status === "accepted") return CheckCircle2;
  if (status === "rejected") return AlertCircle;
  return Clock3;
};

function StatusBadge({ status }: { status: EnrollmentRequest["status"] }) {
  const Icon = getStatusIcon(status);

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
  const [selectedRequest, setSelectedRequest] =
    useState<EnrollmentRequest | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");

  const openViewer = (request: EnrollmentRequest) => {
    setSelectedRequest(request);
    setRejectionNote(request.rejectionNote ?? "");
  };

  const closeViewer = () => {
    setSelectedRequest(null);
    setRejectionNote("");
  };

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
                          onClick={() => onReject(request)}
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

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openViewer(request)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View COR
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
                      onClick={() => onReject(request)}
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

      <Dialog open={Boolean(selectedRequest)} onOpenChange={(open) => !open && closeViewer()}>
        <DialogContent className="theme-surface flex max-h-[calc(100vh-2rem)] w-[calc(100vw-1.5rem)] max-w-6xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-3rem)]">
          {selectedRequest && (
            <>
              <DialogHeader className="shrink-0 border-b theme-border px-5 py-4 pr-12">
                <DialogTitle>Certificate of Registration</DialogTitle>
                <DialogDescription>
                  {selectedRequest.studentName ?? "Student"} - {selectedRequest.className}
                </DialogDescription>
              </DialogHeader>

              <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="flex min-h-[45vh] items-center justify-center overflow-auto bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4">
                  {selectedRequest.corDataUrl ? (
                    <img
                      src={selectedRequest.corDataUrl}
                      alt={`${selectedRequest.studentName ?? "Student"} COR`}
                      className="mx-auto block max-h-[calc(100vh-13rem)] max-w-full rounded-lg object-contain shadow-[var(--app-shadow)] lg:max-h-[calc(100vh-8rem)]"
                    />
                  ) : (
                    <div className="grid min-h-80 place-items-center text-sm theme-muted">
                      COR preview unavailable.
                    </div>
                  )}
                </div>

                <div className="max-h-[32vh] space-y-3 overflow-y-auto border-t theme-border p-5 text-sm lg:max-h-none lg:border-l lg:border-t-0">
                  <div>
                    <p className="text-xs uppercase tracking-wide theme-muted">Student</p>
                    <p className="font-semibold text-[var(--app-text)]">
                      {selectedRequest.studentName ?? "Student"}
                    </p>
                    <p className="text-xs theme-muted">
                      {selectedRequest.studentEmail ?? "No email"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide theme-muted">Class</p>
                    <p className="font-semibold text-[var(--app-text)]">
                      {selectedRequest.className}
                    </p>
                    <p className="text-xs theme-muted">{selectedRequest.classCode}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide theme-muted">Submitted</p>
                    <p className="text-[var(--app-text)]">
                      {new Date(selectedRequest.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide theme-muted">File</p>
                    <p className="break-words text-[var(--app-text)]">
                      {selectedRequest.corFileName}
                    </p>
                    <p className="text-xs theme-muted">
                      {formatFileSize(selectedRequest.corFileSize)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide theme-muted">Status</p>
                    <StatusBadge status={selectedRequest.status} />
                  </div>
                  {selectedRequest.status === "pending" && (
                    <div>
                      <label className="text-xs uppercase tracking-wide theme-muted">
                        Rejection note
                      </label>
                      <textarea
                        value={rejectionNote}
                        onChange={(event) => setRejectionNote(event.target.value)}
                        rows={3}
                        placeholder="Optional note for the student"
                        className="theme-ring mt-1 w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] px-3 py-2 text-sm text-[var(--app-text)]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {selectedRequest.status === "pending" && (
                <DialogFooter className="shrink-0 border-t theme-border px-5 py-4">
                  <Button
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
                    onClick={() => {
                      onAccept(selectedRequest);
                      closeViewer();
                    }}
                    disabled={reviewingId === selectedRequest.id}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Accept
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
