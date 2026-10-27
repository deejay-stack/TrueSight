import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import auth from '../dist/routes/auth.js';
import classes from '../dist/routes/classes.js';
import pool from '../dist/config/db.js';
import {fixtureSubject,cleanupCurriculumFixtures} from './curriculum-fixture.mjs';

const app=express();app.use(express.json({limit:'8mb'}));app.use(cookieParser());app.use('/auth',auth);app.use('/classes',classes);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`,suffix=Date.now(),ids=[];let checks=0,cases=0;
const departments=['BSIT','BSHM','BSCRIM','BSED','BEED'];
const cor={fileName:'fixture.png',fileType:'image/png',fileDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='};
async function call(path,token,method='GET',body,expected=200){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Cookie:`token=${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);checks++;return data;
}
async function account(name,role){
  const body={name,role,email:`cor-gate-${name}-${suffix}@example.invalid`,password:`Test-${suffix}!`};
  const user=(await call('/auth/signup',null,'POST',body,201)).user;ids.push(user.id);
  return {id:user.id,token:(await call('/auth/login',null,'POST',body)).token};
}
try{
  const teacher=await account('teacher','teacher');await call('/classes/academic/options',teacher.token);
  for(const departmentCode of departments)for(const yearLevel of [1,2,3,4])for(const semester of [1,2]){
    const student=await account(`${departmentCode}-${yearLevel}-${semester}`,'student');
    const subjectId=await fixtureSubject(departmentCode,yearLevel);
    if(semester===2)await pool.query('INSERT INTO curriculum_subjects(subject_id,department_code,year_level,semester) VALUES($1,$2,$3,2)',[subjectId,departmentCode,yearLevel]);
    const classroom=(await call('/classes',teacher.token,'POST',{departmentCode,yearLevel,semester,subjectId,description:'Synthetic COR enrollment regression fixture'},201)).class;
    const payload={departmentCode,yearLevel,semester,section:'COR-SECTION',code:classroom.code,forClassEnrollment:true,cor};
    const malformed={fileName:'bad.txt',fileType:'text/plain',fileDataUrl:'bad'};
    for(const changed of [{yearLevel:yearLevel===4?1:yearLevel+1},{departmentCode:departments[(departments.indexOf(departmentCode)+1)%5]},{semester:semester===1?2:1}]){
      const denied=await call('/classes/academic/verification-requests',student.token,'POST',{...payload,...changed,cor:malformed},403);
      assert.doesNotMatch(denied.message,/file type|base64|image format/i,'Academic mismatch must be checked before processing COR bytes.');
    }
    assert.equal((await call('/classes/academic/profile',student.token)).requests.length,0);
    const lookup=await call('/classes/join/lookup',student.token,'POST',{code:classroom.code});assert.equal(lookup.class.curriculum_active,true);assert.equal(lookup.class.year_level,yearLevel);
    let requestId;
    if(semester===1){
      const independent=(await call('/classes/academic/verification-requests',student.token,'POST',{departmentCode,yearLevel,section:payload.section},201)).request;
      await call(`/classes/academic/verification-requests/${independent.id}/cor`,student.token,'PATCH',{...payload,yearLevel:yearLevel===4?1:yearLevel+1},403);
      assert.equal((await call('/classes/academic/profile',student.token)).requests[0].cor_file_name,null);
      const saved=await call(`/classes/academic/verification-requests/${independent.id}/cor`,student.token,'PATCH',payload);assert.equal(saved.recipient.classId,classroom.id);requestId=independent.id;
    }else{
      const saved=await call('/classes/academic/verification-requests',student.token,'POST',payload,201);requestId=saved.request.id;assert.equal(saved.recipient.classId,classroom.id);
    }
    assert.equal((await call('/classes/enrolled',student.token)).classes.length,0);
    const intent=(await call('/classes/academic/enrollment-intents',teacher.token)).intents.find(i=>i.academic_request_id===requestId);
    assert.ok(intent.can_accept);assert.ok(intent.will_verify_academics);
    const accepted=await call(`/classes/academic/enrollment-intents/${intent.id}`,teacher.token,'PATCH',{status:'accepted'});assert.equal(accepted.enrolled,true);
    const profile=(await call('/classes/academic/profile',student.token)).profile;assert.equal(profile.department_code,departmentCode);assert.equal(profile.year_level,yearLevel);assert.equal(profile.section,payload.section);
    assert.ok((await call('/classes/enrolled',student.token)).classes.some(c=>c.id===classroom.id));
    const record=(await call('/classes/enrollment-requests/mine',student.token)).requests.find(r=>r.id===accepted.enrollmentRequestId);assert.equal(record.status,'accepted');assert.equal(record.verification_status,'Enrolled');
    await call(`/classes/${classroom.id}/activities`,student.token);cases++;
  }
  assert.equal(cases,40);assert.equal((await call('/classes/academic/options',teacher.token)).canReview,false);
  console.log(`PASS: ${checks} HTTP checks; all ${cases} department/year/semester combinations block mismatched COR submissions before file processing, preserve standalone verification, atomically route a valid COR, and grant official enrollment/activity access on assigned-teacher acceptance without global reviewer permission.`);
}finally{
  if(ids.length)await pool.query('DELETE FROM users WHERE id=ANY($1::int[]) AND email LIKE $2',[ids,`cor-gate-%-${suffix}@example.invalid`]);
  await cleanupCurriculumFixtures();await new Promise(r=>server.close(r));await pool.end();
}
