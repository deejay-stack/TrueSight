import { useEffect, useRef,useState } from 'react';
import type { AcademicEnrollmentIntent } from '../../../services/academicEnrollmentService';
import { AuthorizedDocumentPreview } from '../../../components/documents/AuthorizedDocumentPreview';
import { Button } from '../../../components/ui/Button';
import { semesterLabel } from '../../../utils/curriculum';

type Props = {
  intents: AcademicEnrollmentIntent[];
  darkMode: boolean;
  reviewingId?: number | null;
  focusId?: string | null;
  onReview?: (intent: AcademicEnrollmentIntent, status: 'accepted' | 'rejected', note: string) => void;
};

function IntentCard({intent,darkMode,reviewingId,focusId,onReview}: Omit<Props,'intents'> & {intent:AcademicEnrollmentIntent}) {
  const [note,setNote]=useState(intent.review_note||'');
  const rejected=intent.teacher_status==='rejected';
  const busy=reviewingId!==null&&reviewingId!==undefined;
  const status=rejected?'Request rejected':intent.can_accept?'Awaiting teacher COR approval':'Enrollment currently restricted';
  return <article id={`academic-intent-${intent.id}`} tabIndex={-1} className={`min-w-0 space-y-4 rounded-xl border theme-border p-3 sm:p-5 ${focusId===String(intent.id)?'ring-2 ring-[var(--app-accent)]':''}`} aria-label={`Enrollment submission from ${intent.student_name}`}>
    <header className="min-w-0 space-y-1 break-words">
      <h4 className="font-semibold">{intent.student_name}</h4>
      <p className="text-sm theme-muted">{intent.subject_code} - {intent.subject_name}</p>
      <p role="status" className="text-sm font-medium">{status}</p>
    </header>
    <div className="min-w-0" aria-label="Certificate of Registration preview">
      <AuthorizedDocumentPreview documentType="academic-cor" documentId={String(intent.academic_request_id)} darkMode={darkMode} className="enrollment-cor-preview"/>
    </div>
    <section className="space-y-4 border-t theme-border pt-4 text-sm" aria-label="Student and enrollment information">
      <h5 className="font-semibold">Student and enrollment information</h5>
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>div]:min-w-0 [&_dd]:break-words [&_dt]:text-xs [&_dt]:uppercase [&_dt]:text-[var(--app-muted)]">
        <div><dt>Student</dt><dd>{intent.student_name}</dd><dd>{intent.student_email}</dd></div>
        <div><dt>Requested class</dt><dd>{intent.class_name}</dd><dd>{intent.class_code} / {semesterLabel(intent.semester)}</dd></div>
        <div><dt>Submitted</dt><dd>{new Date(intent.created_at).toLocaleString()}</dd><dd>{intent.cor_file_name}</dd></div>
        <div><dt>Declared academic information</dt><dd>{intent.department_code} / Year {intent.year_level} / Section {intent.section || 'not assigned'}</dd></div>
        <div><dt>Official academic information</dt><dd>{intent.official_department || 'not assigned'} / Year {intent.official_year || 'not assigned'}</dd></div>
        <div><dt>Academic verification</dt><dd>{intent.status==='approved'?'Verified':intent.status==='rejected'?'Rejected':intent.will_verify_academics?'Verified when you accept the COR':'Pending academic review'}</dd></div>
      </dl>
      {intent.review_note&&<p className="break-words">Teacher note: {intent.review_note}</p>}
      {!rejected&&intent.eligibility_message&&<p className="rounded-lg border theme-border p-3 break-words theme-muted">{intent.eligibility_message}</p>}
      {!rejected&&intent.can_accept&&<p className="text-sm theme-muted">Compare the subject, department, year level and section against the COR. Accepting confirms the matching academic information and officially enrolls the student in this class.</p>}
      {!rejected&&<div className="space-y-3">
        <label className="block space-y-1"><span>Review note (optional)</span><textarea value={note} maxLength={5000} disabled={busy} onChange={event=>setNote(event.target.value)} placeholder="Feedback for the student" className="theme-ring min-h-20 w-full rounded-lg border theme-border bg-[var(--app-surface)] p-3"/></label>
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Button type="button" className="h-auto min-h-10 whitespace-normal" disabled={busy||!onReview||!intent.can_accept} onClick={()=>onReview?.(intent,'accepted',note)}>{busy?'Saving...':'Accept COR and Enroll'}</Button>
          <Button type="button" className="h-auto min-h-10 whitespace-normal" variant="destructive" disabled={busy||!onReview} onClick={()=>onReview?.(intent,'rejected',note)}>Reject Request</Button>
        </div>
      </div>}
    </section>
  </article>;
}

export function AcademicEnrollmentIntents(props:Props) {
  const {intents,focusId}=props;
  const focused=useRef<string|null>(null);
  useEffect(()=>{
    if(!focusId||focused.current===focusId)return;
    const card=document.getElementById(`academic-intent-${focusId}`);
    if(card){focused.current=focusId;card.scrollIntoView({block:'start',behavior:'smooth'});card.focus({preventScroll:true});}
  },[focusId,intents]);
  if(!intents.length)return null;
  return <section className="theme-card min-w-0 space-y-4 rounded-xl border theme-border p-3 sm:p-5" aria-label="COR enrollment submissions">
    <h3 className="font-semibold">COR Enrollment Requests</h3>
    <p className="text-sm theme-muted">Review the COR, then accept or reject the request. Acceptance verifies the matching academic information and grants class access immediately. Conflicting official department/year assignments cannot be overwritten.</p>
    {intents.map(intent=><IntentCard key={intent.id} {...props} intent={intent}/>)}
  </section>;
}
