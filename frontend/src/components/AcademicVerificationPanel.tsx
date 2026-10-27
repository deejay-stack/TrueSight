import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AcademicSelectors, type AcademicSelection } from './AcademicSelectors';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { lmsRequest } from '../services/lmsService';
import { prepareFileUpload, type PreparedFileUpload } from '../utils/documentPreview';
import { AuthorizedDocumentPreview } from './documents/AuthorizedDocumentPreview';
type Profile = { department_code: string | null; year_level: number | null; section: string | null };
type Request = { id: number; status: string; department_code: string; year_level: number; note: string | null; cor_file_name?: string | null };
export function AcademicVerificationPanel() {
  const [profile, setProfile] = useState<Profile | null>(null); const [requests, setRequests] = useState<Request[]>([]);
  const [selection, setSelection] = useState<AcademicSelection>({ departmentCode: '', yearLevel: 0 }); const [section, setSection] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [cor, setCor] = useState<PreparedFileUpload | null>(null);
  const [preparing, setPreparing] = useState(false);
  const selectCor = async (file?: File) => {
    if (!file) return;
    setPreparing(true);
    try { setCor(await prepareFileUpload(file, () => {}, 'cor-upload')); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to prepare COR.'); }
    finally { setPreparing(false); }
  };
  const load = async () => { try { const r = await lmsRequest<{ profile: Profile; requests: Request[] }>('/academic/profile'); setProfile(r.profile); setRequests(r.requests); setSelection(old => old.departmentCode || old.yearLevel ? old : { departmentCode: r.profile.department_code ?? '', yearLevel: r.profile.year_level ?? 0 }); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load academic profile.'); } };
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 15000); return () => clearInterval(timer); }, []);
  const pending = requests.find(r => r.status === 'pending');
  const attachCor = async () => {
    if (!pending || !cor) return;
    setBusy(true);
    try { await lmsRequest(`/academic/verification-requests/${pending.id}/cor`, { cor }); await load(); toast.success('Supporting academic COR saved.'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to save academic COR.'); }
    finally { setBusy(false); }
  };
  const submit = async () => { setBusy(true); try { await lmsRequest('/academic/verification-requests', { ...selection, section: section ?? profile?.section ?? '', ...(cor ? { cor } : {}) }, 'POST'); toast.success('Academic verification request submitted for authorized staff review.'); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to submit verification.'); } finally { setBusy(false); } };
  return <section className="space-y-3 rounded-xl border theme-border p-4 text-sm" aria-label="Academic profile and verification">
    <h3 className="font-semibold">Academic Information and Verification</h3>
    {error && <p role="alert">{error}</p>}
    <p>Official department: {profile?.department_code ?? 'Not assigned'} · Year level: {profile?.year_level ? `${profile.year_level}${['st','nd','rd','th'][profile.year_level-1]} Year` : 'Not assigned'} · Section: {profile?.section || 'Not assigned'}</p>
    <p className="theme-muted">Class enrollment requires verified department and year information. You can request academic verification here, with a supporting COR, independently of any class code.</p>
    {pending ? <div><p role="status">Pending verification: {pending.department_code}, year {pending.year_level}. The official profile will update after approval.</p>{pending.cor_file_name && <details><summary className="cursor-pointer">View academic COR: {pending.cor_file_name}</summary><AuthorizedDocumentPreview documentType="academic-cor" documentId={String(pending.id)} darkMode={false} /></details>}{!pending.cor_file_name && <div className="mt-2 space-y-2"><label className="block">Attach supporting COR to this academic request<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || preparing} className="block w-full py-2" onChange={e => void selectCor(e.target.files?.[0])} /></label>{cor && <p>{cor.fileName}</p>}<Button disabled={busy || preparing || !cor} onClick={() => void attachCor()}>Save supporting COR</Button></div>}</div> : <>
      <AcademicSelectors value={selection} onChange={setSelection} />
      <label className="block">Section (optional)<Input maxLength={120} value={section ?? profile?.section ?? ''} onChange={e => setSection(e.target.value)} placeholder="Section if assigned" /></label>
      <label className="block">Supporting COR (optional, PNG/JPEG/WEBP, up to 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || preparing} className="block w-full py-2" onChange={e => void selectCor(e.target.files?.[0])} /></label>
      {cor && <p>{cor.fileName} - ready for academic-profile review</p>}
      <Button type="button" disabled={busy || preparing || !selection.departmentCode || !selection.yearLevel} onClick={() => void submit()}>{busy ? 'Submitting...' : 'Request academic verification / correction'}</Button>
    </>}
    {requests[0] && requests[0].status !== 'pending' && <p>Latest request: {requests[0].status}{requests[0].note ? ` — ${requests[0].note}` : ''}</p>}
    <Button type="button" size="sm" variant="outline" onClick={() => void load()}>Refresh academic profile</Button>
  </section>;
}
