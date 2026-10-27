import type { ActivityNotification } from '../services/classService';

export function notificationHasTarget(notification:ActivityNotification) {
  return Boolean(notification.activityId||notification.relatedSubmissionId||notification.type==='enrollment_request'||notification.type==='enrollment_review');
}

export function notificationTarget(role:'teacher'|'student',notification:ActivityNotification):string|null {
  if(notification.type==='enrollment_request'||notification.type==='enrollment_review') {
    const query=new URLSearchParams();
    if(notification.enrollmentRequestId)query.set('request',notification.enrollmentRequestId);
    else if(notification.academicIntentId)query.set('intent',notification.academicIntentId);
    else if(notification.classId)query.set('class',notification.classId);
    query.set('notification',notification.id);
    return `/${role}/${role}_screen/${role==='teacher'?'uploads':'enrolled'}?${query}`;
  }
  if(role==='teacher'&&notification.relatedSubmissionId)return `/teacher/submissions/${encodeURIComponent(notification.relatedSubmissionId)}`;
  if(notification.activityId)return role==='teacher'?`/teacher/activities/${encodeURIComponent(notification.activityId)}`:`/student/classes/${encodeURIComponent(notification.classId)}/activities/${encodeURIComponent(notification.activityId)}`;
  return null;
}
