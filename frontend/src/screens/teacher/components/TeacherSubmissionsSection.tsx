import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, WandSparkles } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import {
  analyzeAllClassSubmissions,
  analyzeSingleSubmission,
  fetchClassSubmissions,
  type ClassSubmission,
  type TeacherClass,
} from "../services/teacherClassroomService";

type Props = {
  classes: TeacherClass[];
  isLoadingClasses: boolean;
  online: boolean;
  onAnalyzed: () => void;
};

export function TeacherSubmissionsSection({ classes, isLoadingClasses, online, onAnalyzed }: Props) {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<ClassSubmission[]>([]);
  const [classId, setClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const analysisLock = useRef(false);

  useEffect(() => {
    if (isLoadingClasses) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(classes.map(async (classroom) => {
      const rows = await fetchClassSubmissions(classroom.id);
      return rows.map((row) => ({ ...row, classId: classroom.id, className: classroom.name }));
    })).then((groups) => {
      if (!cancelled) setSubmissions(groups.flat().sort((a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()));
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setSubmissions([]);
        setError(reason instanceof Error ? reason.message : "Failed to load submissions.");
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [classes, isLoadingClasses, refresh]);

  const visible = submissions.filter((submission) => !classId || submission.classId === classId);
  const busy = analyzing !== null;
  const isLoading = loading || isLoadingClasses;

  const analyze = async (submissionId?: string) => {
    if (analysisLock.current || isLoading || !online) return;
    analysisLock.current = true;
    setAnalyzing(submissionId ?? "all");
    try {
      if (submissionId) {
        const result = await analyzeSingleSubmission(submissionId);
        if (result.analysisDetails?.analysisStatus === "failed") toast.error("AI detection temporarily unavailable.");
        else toast.success("Submission analyzed.");
      } else {
        const classIds = [...new Set(visible.map((row) => row.classId).filter((id): id is string => Boolean(id)))];
        let updated = 0;
        let failed = 0;
        let unavailableClasses = 0;
        // Reuse the existing class-wide analysis endpoint, one class at a time.
        for (const id of classIds) {
          try {
            const result = await analyzeAllClassSubmissions(id);
            updated += result.updated;
            failed += result.failed;
          } catch {
            unavailableClasses += 1;
          }
        }
        if (failed || unavailableClasses) {
          toast.error(`${updated} analyzed; ${failed} analyses unavailable${unavailableClasses ? `; ${unavailableClasses} classes could not be processed` : ""}.`);
        } else toast.success(`Analysis complete. ${updated} submissions processed.`);
      }
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Failed to analyze submission.");
    } finally {
      analysisLock.current = false;
      setAnalyzing(null);
      setRefresh((value) => value + 1);
      onAnalyzed();
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-[var(--app-text)]">Student Submissions</h2>
        <p className="text-sm theme-muted">Open a submission to review its content and AI analysis.</p>
      </div>
      <Card className="theme-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <label htmlFor="submission-class" className="block text-sm font-medium text-[var(--app-text)]">Class</label>
              <select id="submission-class" value={classId} onChange={(event) => setClassId(event.target.value)} disabled={busy}
                className="theme-ring max-w-full rounded-xl border theme-border bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)]">
                <option value="">All classes</option>
                {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy || isLoading} onClick={() => setRefresh((value) => value + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
              </Button>
              <Button disabled={busy || isLoading || !online || visible.length === 0} onClick={() => void analyze()}>
                {analyzing === "all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                {analyzing === "all" ? "Analyzing all…" : "Analyze all"}
              </Button>
            </div>
          </div>
          <p className="text-xs theme-muted">Analyze all runs AI analysis for all submissions in {classId ? "the selected class" : "all your classes"}.</p>
          {!online && <p className="text-sm theme-muted">Reconnect to run AI analysis.</p>}
          {isLoading ? <p role="status" className="text-sm theme-muted">Loading submissions...</p> : error ? (
            <p role="alert" className="text-sm text-rose-500">{error} Use Refresh to try again.</p>
          ) : visible.length === 0 ? <p className="text-sm theme-muted">No submissions in {classId ? "this class" : "your classes"} yet.</p> : (
            <div className="overflow-x-auto rounded-xl border theme-border">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Student submissions, newest first</caption>
                <thead className="border-b theme-border bg-[color-mix(in_srgb,var(--app-accent)_8%,var(--app-surface))] text-[var(--app-text)]">
                  <tr>{["Student", "Activity", "Class", "Submitted", "Analysis", "AI probability", "Actions"].map((heading) =>
                    <th key={heading} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {visible.map((submission) => {
                    const failed = submission.analysisDetails?.analysisStatus === "failed";
                    return (
                      <tr key={submission.id} onClick={() => navigate(`/teacher/submissions/${submission.id}`)}
                        className="cursor-pointer border-b theme-border last:border-0 hover:bg-[color-mix(in_srgb,var(--app-accent)_6%,var(--app-surface))]">
                        <td className="px-4 py-3"><p className="font-medium text-[var(--app-text)]">{submission.studentName}</p><p className="text-xs theme-muted">{submission.studentEmail}</p></td>
                        <td className="px-4 py-3">
                          <Link className="theme-ring rounded font-medium text-[var(--app-accent)] hover:underline" to={`/teacher/submissions/${submission.id}`} onClick={(event) => event.stopPropagation()}>{submission.activityTitle}</Link>
                          <p className="text-xs capitalize theme-muted">{submission.submissionType}</p>
                        </td>
                        <td className="px-4 py-3 theme-muted">{submission.className}</td>
                        <td className="whitespace-nowrap px-4 py-3 theme-muted">{new Date(submission.submittedAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-[var(--app-text)]">{failed ? "Unavailable" : submission.status.toLowerCase() === "analyzed" ? "Analyzed" : "Pending"}</td>
                        <td className="px-4 py-3 text-[var(--app-text)]">{typeof submission.aiProbability === "number" ? `${submission.aiProbability.toFixed(2)}%` : "—"}</td>
                        <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                          <div className="flex items-center gap-3">
                            <Link className="theme-ring whitespace-nowrap rounded text-[var(--app-accent)] hover:underline" to={`/teacher/submissions/${submission.id}/analysis`}>View analysis</Link>
                            <Button size="sm" variant="outline" disabled={busy || !online} onClick={() => void analyze(submission.id)} aria-label={`Analyze submission by ${submission.studentName} for ${submission.activityTitle}`}>
                              {analyzing === submission.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                              {analyzing === submission.id ? "Analyzing…" : "Analyze submission"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
