import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent } from '../../../components/ui/Card';
import { fetchRating, type RatingReport } from '../../../services/lmsService';
import { exportRating } from '../../../utils/ratingExport';

export function ActivityRating({ activityId }: { activityId: string }) {
  const [report, setReport] = useState<RatingReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; fetchRating(activityId).then(r => { if (active) { setReport(r); setError(''); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [activityId]);
  const download = async (format: 'pdf' | 'csv') => {
    setBusy(true);
    try { setReport(await exportRating(activityId, format)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to export rating.'); }
    finally { setBusy(false); }
  };
  return <Card className="theme-card"><CardContent className="space-y-3 p-5 text-sm">
    <h2 className="text-lg font-semibold">Activity Rating Report</h2>
    {report ? <>
      <p>{report.studentName} · Student {report.studentId}</p><p className="theme-muted">{report.departmentCode || 'Department unassigned'} / {report.gradeLevel || 'Year level unassigned'} · {report.section || 'Section unassigned'}</p>
      <p>{report.subject} · {report.activity}</p><p className="theme-muted">Teacher: {report.teacherName} · Submitted: {new Date(report.submittedAt).toLocaleString()}</p><p>Status: {report.status}</p>
      {report.criteria.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Criterion</th><th className="p-2">Earned</th><th className="p-2">Maximum</th></tr></thead><tbody>{report.criteria.map(c => <tr key={c.id} className="border-t theme-border"><td className="max-w-sm p-2 break-words">{c.title}<p className="whitespace-pre-wrap theme-muted">{c.description}</p></td><td className="p-2">{c.earned ?? 'Not scored'}</td><td className="p-2">{c.maxPoints}</td></tr>)}</tbody></table></div>}
      {report.computedScore !== null && <p>Automatically computed score: {report.computedScore}/{report.maxScore}</p>}
      <p className="font-semibold">Teacher-approved final score: {report.finalScore}/{report.maxScore} · {report.percentage}%</p>
      {report.rating && <p>Teacher rating: {report.rating}</p>}{report.overridden && <p className="whitespace-pre-wrap">Adjustment: {report.adjustmentNote || 'No note provided'}</p>}
      <p className="whitespace-pre-wrap">Feedback: {report.feedback || 'No feedback provided'}</p>
      <p className="whitespace-pre-wrap">Remarks: {report.remarks || 'No remarks'}</p>
      <p className="text-xs theme-muted">Reviewed {new Date(report.gradedAt).toLocaleString()}</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void download('pdf')}>Export Rating / PDF</Button><Button disabled={busy} variant="outline" onClick={() => void download('csv')}>Export CSV</Button></div><p className="text-xs theme-muted">Choose “Save as PDF” in the print dialog. Exports use the latest saved grade.</p>
    </> : <p className="theme-muted">{error || 'Loading approved rating...'}</p>}
  </CardContent></Card>;
}
