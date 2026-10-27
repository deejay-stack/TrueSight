import { AuthorizedDocumentPreview } from "../../../components/documents/AuthorizedDocumentPreview";
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { lmsRequest } from '../../../services/lmsService';
type Review = { cor_file_name?: string | null; enrollment_requests?: { id: number; className: string; corFileName: string }[]; id: number; student_name: string; student_email: string; department_code: string; year_level: number; section: string | null; status: string; official_department: string | null; official_year: number | null };
export function AcademicReviewPanel({ darkMode = false }: { darkMode?: boolean }) {
  const [allowed, setAllowed] = useState(false); const [requests, setRequests] = useState<Review[]>([]); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => { const r = await lmsRequest<{ requests: Review[] }>('/academic/review'); setRequests(r.requests); };
  useEffect(() => { let active = true; lmsRequest<{ canReview: boolean }>('/academic/options').then(r => { if (active && r.canReview) { setAllowed(true); void load().catch(e => toast.error(e.message)); } }).catch(() => {}); return () => { active = false; }; }, []);
  const review = async (id: number, status: string) => { setBusy(true); try { await lmsRequest(`/academic/review/${id}`, { status, note }); await load(); toast.success('Academic verification reviewed.'); } catch(e) { toast.error(e instanceof Error ? e.message : 'Unable to review.'); } finally { setBusy(false); } };
  if (!allowed) return null;
  return <section className="theme-card space-y-3 rounded-xl border theme-border p-4"><h3 className="font-semibold">Academic Verification — Authorized Staff</h3>
    <label className="block text-sm">Review note (optional)<Input value={note} maxLength={5000} onChange={e => setNote(e.target.value)} /></label>
    {requests.filter(r => r.status === 'pending').map(r => <div key={r.id} className="space-y-2 border-t theme-border pt-3 text-sm"><p>{r.student_name} · {r.student_email}</p><p>Requested: {r.department_code}, year {r.year_level}, section {r.section || 'unassigned'}</p>{r.cor_file_name && <details><summary className="cursor-pointer font-semibold">View academic-profile COR: {r.cor_file_name}</summary><AuthorizedDocumentPreview documentType="academic-cor" documentId={String(r.id)} darkMode={darkMode} /></details>}{r.enrollment_requests?.map(e => <details key={e.id}><summary className="cursor-pointer font-semibold">{e.className}: View submitted COR ({e.corFileName})</summary><AuthorizedDocumentPreview documentType="cor" documentId={String(e.id)} darkMode={darkMode} /></details>)}<p>Current official: {r.official_department || 'unassigned'}, year {r.official_year || 'unassigned'}</p><div className="flex gap-2"><Button disabled={busy} onClick={() => void review(r.id,'approved')}>Approve</Button><Button disabled={busy} variant="outline" onClick={() => void review(r.id,'rejected')}>Reject</Button></div></div>)}
    {!requests.some(r => r.status === 'pending') && <p className="text-sm theme-muted">No pending academic verification requests.</p>}
    <Button size="sm" variant="outline" onClick={() => void load().catch(e => toast.error(e.message))}>Refresh requests</Button>
  </section>;
}
