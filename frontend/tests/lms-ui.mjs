import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { RubricBuilder } = await vite.ssrLoadModule('/src/screens/teacher/components/RubricBuilder.tsx');
  const { ClassEnrollmentSettings } = await vite.ssrLoadModule('/src/screens/teacher/components/ClassEnrollmentSettings.tsx');
  const { ratingHtml, ratingCsv } = await vite.ssrLoadModule('/src/utils/ratingExport.ts');
  const { TeacherUploadsSection } = await vite.ssrLoadModule('/src/screens/teacher/components/TeacherUploadsSection.tsx');
  const { assignedSubjects } = await vite.ssrLoadModule('/src/utils/curriculum.ts');
  const { EligibleSubjects } = await vite.ssrLoadModule('/src/screens/student/components/EligibleSubjects.tsx');
  const studentCatalog={departments:[{code:'BSIT',name:'Information Technology'}],yearLevels:[{id:4,label:'4th Year'}],profile:{department_code:'BSIT',year_level:4,section:'A'},verificationRequests:[],subjects:[{id:1,code:'FIRST',name:'First semester fixture',semester:1},{id:2,code:'SECOND',name:'Second semester fixture',semester:2}],classes:[]};
  const enrollmentFields=renderToStaticMarkup(React.createElement(EligibleSubjects,{catalog:studentCatalog,error:'',semester:2,selection:{departmentCode:'BSIT',yearLevel:4},onSemesterChange(){},onSelectionChange(){},onSelect(){},onOpenSettings(){},onRefresh(){}}));
  assert.equal((enrollmentFields.match(/Official department:/g)||[]).length,1,'Official profile must appear only once.');
  assert.equal((enrollmentFields.match(/role="combobox"/g)||[]).length,2,'Only one department/year selector pair.');
  assert.match(enrollmentFields,/Second semester fixture/);assert.doesNotMatch(enrollmentFields,/First semester fixture/);
  assert.doesNotMatch(enrollmentFields,/type="file"|Academic Information and Verification|Request academic verification \/ correction/,'The upper catalog must not embed another COR or verification form.');
  const catalog = { subjects: Array.from({length:6},(_,i)=>({id:i+1,code:`TEST${i}`,name:`Synthetic subject ${i}`,active:true})), assignments: Array.from({length:6},(_,i)=>({subject_id:i+1,department_code:'BSIT',year_level:3,semester:i<3?1:2,active:true})) };
  assert.deepEqual(assignedSubjects(catalog,{departmentCode:'BSIT',yearLevel:3},1).map(s=>s.id),[1,2,3], 'Picker must include every matching first-semester subject.');
  assert.deepEqual(assignedSubjects(catalog,{departmentCode:'BSIT',yearLevel:3},2).map(s=>s.id),[4,5,6], 'Second-semester subjects must be separate.');
  assert.equal(assignedSubjects(catalog,{departmentCode:'BSHM',yearLevel:3},1).length,0);
  assert.equal(assignedSubjects(catalog,{departmentCode:'BSIT',yearLevel:2},1).length,0);
  const pendingQueue = renderToStaticMarkup(React.createElement(TeacherUploadsSection, { requests: [{ id: '1', studentName: 'Fixture Student', className: 'Actual Fixture Class', classCode: 'FIXTURE', status: 'pending', declaredDepartment: 'BSIT', declaredYear: 2, declaredSection: 'A', officialDepartment: null, submittedAt: '2026-10-23T00:00:00Z', verificationStatus: 'Pending Academic Verification', eligibleForApproval: false, eligibilityMessage: 'Academic verification required.', corSubmitted: true }], isLoading: false, reviewingId: null, onRefresh() {}, onAccept() {}, onReject() {} }));
  assert.match(pendingQueue, /Student Enrollment Requests/); assert.match(pendingQueue, /BSIT/); assert.match(pendingQueue, /Year 2/); assert.match(pendingQueue, /Section A/); assert.match(pendingQueue, /Pending Academic Verification/); assert.match(pendingQueue, /Approve Enrollment/); assert.match(pendingQueue, /disabled=""/);
  const intent={id:1,academic_request_id:2,class_id:3,semester:1,status:'pending',teacher_status:'pending',can_accept:true,eligible_for_approval:false,awaiting_verification:true,eligibility_message:'Academic verification required.',department_code:'BSIT',year_level:3,section:'A',created_at:'2026-10-24T00:00:00Z',cor_file_name:'fixture.png',student_name:'Waiting student',student_email:'fixture@example.invalid',official_department:null,official_year:null,class_name:'Owned class',class_code:'OWNED',subject_code:'CP5',subject_name:'Synthetic subject'};
  const uploadProps={requests:[],academicIntents:[intent],isLoading:false,reviewingId:null,onRefresh(){},onAccept(){},onReject(){},onReviewAcademic(){}};
  const preEnrollment=renderToStaticMarkup(React.createElement(TeacherUploadsSection,uploadProps));
  assert.match(preEnrollment,/Waiting student/);assert.match(preEnrollment,/Awaiting teacher COR approval/);assert.match(preEnrollment,/Certificate of Registration preview/);assert.match(preEnrollment,/Accept COR and Enroll/);assert.match(preEnrollment,/Reject Request/);
  assert.ok(preEnrollment.indexOf('Certificate of Registration preview')<preEnrollment.indexOf('Student and enrollment information'),'COR stays above the information, in document flow.');
  const readyMarkup=renderToStaticMarkup(React.createElement(TeacherUploadsSection,{...uploadProps,academicIntents:[{...intent,status:'approved',teacher_status:'accepted',official_department:'BSIT',official_year:3,eligible_for_approval:true,awaiting_verification:false,eligibility_message:null}]}));
  assert.match(readyMarkup,/Accept COR and Enroll/);assert.match(readyMarkup,/Reject Request/);
  const rejectedMarkup=renderToStaticMarkup(React.createElement(TeacherUploadsSection,{...uploadProps,academicIntents:[{...intent,teacher_status:'rejected',review_note:'Missing registered subject.'}]}));
  assert.match(rejectedMarkup,/Request rejected/);assert.match(rejectedMarkup,/Missing registered subject/);assert.doesNotMatch(rejectedMarkup,/Reject Request|Accept COR|Approve Enrollment/);
  const { notificationHasTarget,notificationTarget }=await vite.ssrLoadModule('/src/utils/notificationTarget.ts');
  const { ActivityNotificationsPopover }=await vite.ssrLoadModule('/src/components/ActivityNotificationsPopover.tsx');
  const notice={id:'9',type:'enrollment_request',classId:'3',className:'Owned class',academicIntentId:'1',activityId:'',activityTitle:'Activity unavailable',title:'COR awaiting verification',message:'Review the submitted COR.',eventAt:'2026-10-24T00:00:00Z',status:'read',relatedSubmissionId:null};
  assert.equal(notificationHasTarget(notice),true);assert.equal(notificationTarget('teacher',notice),'/teacher/teacher_screen/uploads?intent=1&notification=9');
  assert.equal(notificationTarget('teacher',{...notice,enrollmentRequestId:'42'}),'/teacher/teacher_screen/uploads?request=42&notification=9');
  assert.equal(notificationTarget('student',{...notice,type:'enrollment_review'}),'/student/student_screen/enrolled?intent=1&notification=9');
  assert.equal(notificationTarget('teacher',{...notice,type:'new_submission',relatedSubmissionId:'8'}),'/teacher/submissions/8');
  assert.equal(notificationTarget('student',{...notice,type:'new_activity',activityId:'11'}),'/student/classes/3/activities/11');
  assert.equal(notificationHasTarget({...notice,type:'new_activity',academicIntentId:null}),false);
  const notificationsMarkup=renderToStaticMarkup(React.createElement(ActivityNotificationsPopover,{notifications:[notice],open:true,loading:false,onToggle(){},onClose(){},onRefresh(){},onNotificationClick(){}}));
  assert.match(notificationsMarkup,/role="button" tabindex="0"/,'Enrollment notifications work without an activity ID.');assert.doesNotMatch(notificationsMarkup,/Activity unavailable/);
  const criteria = [{ id: 'a', title: 'Content', description: 'Explain the work', maxPoints: 30 }, { id: 'b', title: 'Presentation', description: 'Clear delivery', maxPoints: 70 }];
  const builder = renderToStaticMarkup(React.createElement(RubricBuilder, { value: criteria, onChange() {} }));
  assert.match(builder, /TOTAL/); assert.match(builder, />100<\//); assert.match(builder, /Move criterion 1 up/); assert.match(builder, /Move criterion 1 down/); assert.match(builder, /Remove/); assert.doesNotMatch(builder, /Add criterion/); assert.match(builder, /maximum points/);
  assert.match(builder, /<table/); assert.match(builder, /AI Assistance/); assert.match(builder, /AI-Assisted Scoring Settings/);
  const empty = renderToStaticMarkup(React.createElement(RubricBuilder, { value: [], onChange() {} }));
  assert.equal((empty.match(/maximum points/g) ?? []).length, 5);
  assert.equal((builder.match(/maximum points/g) ?? []).length, 3, 'A completed last row provides a blank row');
  const { RubricScoringTable } = await vite.ssrLoadModule('/src/screens/teacher/components/RubricScoringTable.tsx');
  const review = renderToStaticMarkup(React.createElement(RubricScoringTable, { criteria, scores: { a: '27' }, onChange() {}, enabled: true, generating: false, onGenerate() {}, assessment: { criteria: [{ criterionId: 'a', score: 25, explanation: 'Measured requirements', evidence: [] }], suggestedTotal: null, partialTotal: 25, totalPossible: 100, limitations: 'Teacher approval required', generatedAt: '2026-10-22T00:00:00Z', analysisReference: { submissionId: 1, submittedVersion: 1 } } }));
  assert.match(review, /Incomplete: subtotal 25/); assert.match(review, /Requires Teacher Evaluation/); assert.match(review, /Teacher&#x27;s Final Score/); assert.match(review, /1 unscored/);
  const settings = renderToStaticMarkup(React.createElement(ClassEnrollmentSettings, { classroom: { id: '1', gradeLevel: 'Grade 10', enrollmentOpen: false }, onSaved() {} }));
  assert.match(settings, /Loading academic options/); assert.doesNotMatch(settings, /Grade level/); assert.match(settings, /Existing enrollments are preserved/);
  const { AcademicSelectors } = await vite.ssrLoadModule('/src/components/AcademicSelectors.tsx');
  const selectors = renderToStaticMarkup(React.createElement(AcademicSelectors, { value: { departmentCode: 'BSIT', yearLevel: 4 }, onChange() {}, catalog: { departments: [{ code: 'BSIT', name: 'Information Technology' }], yearLevels: [{ id: 4, label: '4th Year' }] } }));
  assert.equal((selectors.match(/role="combobox"/g) ?? []).length, 2); assert.match(selectors, /4th Year/); assert.match(selectors, /BSIT/);
  const report = {
    studentName: 'Export test <script>alert(1)</script>', studentId: 'test-1', departmentCode: 'BSIT', yearLevel: 4, gradeLevel: '4th Year', section: 'Rizal', subject: 'English', activity: 'Presentation', teacherName: 'Teacher',
    submittedAt: '2026-10-22T01:00:00Z', criteria: criteria.map((c, i) => ({ ...c, earned: i ? 63 : 27 })), computedScore: 90, maxScore: 100, finalScore: 93, percentage: 93,
    rating: 'Excellent', feedback: '=HYPERLINK("malicious")', remarks: null, overridden: true, adjustmentNote: 'Participation', gradedAt: '2026-10-22T02:00:00Z', exportedAt: '2026-10-22T03:00:00Z', status: 'Graded',
  };
  let html = ratingHtml(report); const csv = ratingCsv(report);
  assert.match(html, /TRUESIGHT LEARNING MANAGEMENT SYSTEM/); assert.match(html, /STUDENT ACTIVITY RATING REPORT/);
  assert.match(html, /93\/100/); assert.match(html, /93%/); assert.match(html, /90\/100/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Asia\/Manila/); assert.match(html, /display:table-header-group/);
  assert.match(csv, /93/); assert.match(csv, /'=HYPERLINK/); assert.match(csv, /"Computed Total","","90","100"/);
  const many = Array.from({ length: 100 }, (_, i) => ({ id: String(i), title: `Criterion ${i}`, description: 'Long description with Unicode: ñ — '.repeat(100), maxPoints: 1, earned: 1 }));
  html = ratingHtml({ ...report, criteria: many, computedScore: 100, finalScore: 100, percentage: 100 });
  assert.equal((html.match(/<tr>/g) ?? []).length, 101); assert.match(html, /Criterion 99/); assert.match(html, /ñ/);
  const noRubric = ratingHtml({ ...report, criteria: [], computedScore: null, feedback: null });
  assert.match(noRubric, /No rubric was used/); assert.match(noRubric, /No feedback provided/); assert.doesNotMatch(noRubric, /Computed Total/);
  console.log('PASS: COR acceptance/enrollment and rejection controls, COR above student details, clickable enrollment notifications and specific destinations, rubric controls and total, PDF print markup, authoritative final/computed score serialization, HTML escaping, CSV formula protection, 100 long Unicode criteria, missing feedback and legacy reports');
} finally { await vite.close(); }
