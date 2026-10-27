import { fetchRating, type RatingReport } from '../services/lmsService';

const escapeHtml = (v: unknown) => String(v ?? 'Not available').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const date = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
export function ratingHtml(r: RatingReport) {
  const pair = (label: string, value: unknown) => `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Student Activity Rating Report</title><style>
    @page { size: A4; margin: 18mm; } * { box-sizing: border-box; } body { color:#17233b; background:white; font:12pt/1.5 Arial,sans-serif; max-width:900px; margin:24px auto; padding:16px; }
    h1 {font-size:17pt;margin-bottom:0;color:#163e75} h2{font-size:14pt;margin-top:4px} p{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere} table{width:100%;border-collapse:collapse;margin:20px 0;table-layout:fixed} th,td{border:1px solid #b6c3d2;padding:9px;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap} th{background:#edf2f8} th:first-child{width:66%} thead{display:table-header-group} small{display:block;color:#425269} .totals{border-top:2px solid #163e75;padding-top:10px;break-inside:avoid} footer{margin-top:24px;color:#425269;font-size:10pt} @media print{body{padding:0;margin:0;max-width:none}}
    </style></head><body><h1>TRUESIGHT LEARNING MANAGEMENT SYSTEM</h1><h2>STUDENT ACTIVITY RATING REPORT</h2>
    ${pair('Student Name', r.studentName)}${pair('Student Identifier', r.studentId)}${pair('Department', r.departmentCode) + pair('Year Level', r.gradeLevel)}${pair('Section', r.section)}${pair('Subject', r.subject)}${pair('Activity', r.activity)}${pair('Teacher', r.teacherName)}${pair('Submitted', date(r.submittedAt))}${pair('Grading Status', r.status)}
    ${r.criteria.length ? `<table><thead><tr><th>Rubric Criteria</th><th>Earned</th><th>Maximum</th></tr></thead><tbody>${r.criteria.map(c => `<tr><td>${escapeHtml(c.title)}<small>${escapeHtml(c.description)}</small></td><td>${escapeHtml(c.earned)}</td><td>${c.maxPoints}</td></tr>`).join('')}</tbody></table>` : '<p>No rubric was used for this activity.</p>'}
    <div class="totals">${r.computedScore !== null ? pair('Computed Total', `${r.computedScore}/${r.maxScore}`) : ''}${pair('Teacher-Approved Final Score', `${r.finalScore}/${r.maxScore}`)}${pair('Final Percentage Rating', `${r.percentage}%`)}${r.rating ? pair('Teacher Rating', r.rating) : ''}${r.overridden ? pair('Adjustment Note', r.adjustmentNote || 'No note provided') : ''}</div>
    ${pair("Teacher's Feedback", r.feedback || 'No feedback provided')}${r.remarks ? pair('Remarks', r.remarks) : ''}<footer>${pair('Graded', date(r.gradedAt))}${pair('Date Exported', `${date(r.exportedAt)} (Asia/Manila)`)}</footer></body></html>`;
}
export function ratingCsv(r: RatingReport) {
  const rows: unknown[][] = [
    ['TRUESIGHT LEARNING MANAGEMENT SYSTEM'], ['STUDENT ACTIVITY RATING REPORT'],
    ['Student Name', r.studentName], ['Student Identifier', r.studentId], ['Department', r.departmentCode], ['Year Level', r.gradeLevel], ['Section', r.section], ['Subject', r.subject], ['Activity', r.activity], ['Teacher', r.teacherName], ['Submitted', r.submittedAt], ['Grading Status', r.status], [],
    ['Rubric Criteria', 'Description', 'Earned', 'Maximum'], ...r.criteria.map(c => [c.title, c.description, c.earned, c.maxPoints]),
    ['Computed Total', '', r.computedScore, r.maxScore], ['Teacher-Approved Final Score', '', r.finalScore, r.maxScore], ['Final Percentage Rating', `${r.percentage}%`], ['Teacher Rating', r.rating], ['Adjustment Note', r.overridden ? r.adjustmentNote : ''], ["Teacher's Feedback", r.feedback], ['Remarks', r.remarks], ['Graded', r.gradedAt], ['Date Exported', r.exportedAt],
  ];
  return '\uFEFF' + rows.map(row => row.map(value => { let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; return `"${text.replace(/"/g, '""')}"`; }).join(',')).join('\r\n');
}
export async function exportRating(id: string, format: 'pdf' | 'csv') {
  // Open during the click event to avoid popup blocking while fetching authoritative data.
  const preview = format === 'pdf' ? window.open('', '_blank') : null;
  if (format === 'pdf' && !preview) throw new Error('Allow popups to open the printable rating report.');
  try {
    const report = await fetchRating(id);
    if (preview) {
      preview.opener = null;
      preview.document.open(); preview.document.write(ratingHtml(report)); preview.document.close();
      preview.focus(); preview.print();
    } else {
      const url = URL.createObjectURL(new Blob([ratingCsv(report)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `TrueSight-activity-${id}-rating.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return report;
  } catch (e) { preview?.close(); throw e; }
}
