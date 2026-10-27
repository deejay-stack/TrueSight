// Opt-in HTTP integration against the real managed provider, using only new fixtures.
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
dotenv.config({quiet:true});
assert.equal(process.env.TRUESIGHT_LIVE_CODE_TEST,'1','Opt in with TRUESIGHT_LIVE_CODE_TEST=1.');
const {default:pool}=await import('../dist/config/db.js');
const {default:auth}=await import('../dist/routes/auth.js'),{default:classes}=await import('../dist/routes/classes.js');
const {executionAvailability}=await import('../dist/services/CodeExecutionService.js');
const {fixtureSubject,cleanupCurriculumFixtures}=await import('./curriculum-fixture.mjs');
for(const language of ['java','javascript','python','dart'])assert.equal((await executionAvailability(language)).enabled,true,`${language} is not verified.`);
const app=express();app.use(express.json());app.use(cookieParser());app.use('/auth',auth);app.use('/classes',classes);
const existingBase=process.env.TRUESIGHT_LIVE_API_BASE;
if(existingBase)assert.ok(['localhost','127.0.0.1'].includes(new URL(existingBase).hostname),'Existing API verification is restricted to the local application.');
const server=existingBase?null:app.listen(0,'127.0.0.1');if(server)await new Promise(r=>server.once('listening',r));
const base=existingBase??`http://127.0.0.1:${server.address().port}`,suffix=Date.now(),users={};let assertions=0,lastRun=0;
const statusOnly=process.env.TRUESIGHT_CODE_STATUS_ONLY==='1';
async function call(route,token,method='GET',body,expected=200,cost=0){
  if(cost){const pause=Math.max(0,lastRun+2300-Date.now());if(pause)await new Promise(r=>setTimeout(r,pause));lastRun=Date.now()+2300*(cost-1);}
  const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Cookie:`token=${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();assert.equal(response.status,expected,`${route}: HTTP ${response.status}; ${data.message??''}`);assertions++;return data;
}
try{
  for(const role of ['teacher','student']){
    const body={name:`Live code ${role}`,role,email:`onlinecompiler-live-${role}-${suffix}@example.invalid`,password:`Fixture-${suffix}!`};
    const registered=await call('/auth/signup',null,'POST',body,201);users[role]={id:registered.user.id,token:(await call('/auth/login',null,'POST',body)).token};
  }
  const t=users.teacher.token,s=users.student.token;
  await call('/classes/academic/options',t);
  const classroom=(await call('/classes',t,'POST',{subjectId:await fixtureSubject('BSIT',1),departmentCode:'BSIT',yearLevel:1,semester:1,description:'Real provider integration fixture'},201)).class;
  await pool.query('INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)',[classroom.id,users.student.id]);
  const options={comparison:'strict',testCases:[{name:'Public sample',stdin:'5\n10\n',expectedOutput:'15\n',hidden:false},{name:`PRIVATE-${suffix}`,stdin:'17\n23\n',expectedOutput:'40\n',hidden:true}]};
  for(const [language,source]of [
    ['Java','import java.util.Scanner; public class Calculator { public static void main(String[] a){Scanner s=new Scanner(System.in);System.out.println(s.nextInt()+s.nextInt());}}'],
    ['JavaScript','const v=require("node:fs").readFileSync(0,"utf8").trim().split(/\\s+/).map(Number);console.log(v[0]+v[1]);'],
    ['Python','print(int(input())+int(input()))'],
    ['Dart',"import 'dart:io';void main(){print(int.parse(stdin.readLineSync()!)+int.parse(stdin.readLineSync()!));}"]
  ]){
    const a=(await call(`/classes/${classroom.id}/activities`,t,'POST',{title:`Live ${language}`,instructor:'Live fixture teacher',description:'Authored smoke fixture only',submissionType:'code',programmingLanguage:language,dueDate:'2099-01-01',maxScore:100,codeSettings:options},201)).activity;
    const prefix=`/classes/activities/${a.id}/code`;
    for(const token of [s,t]){
      const workspace=await call(prefix+'/workspace',token);assert.equal(workspace.execution.enabled,true);assert.equal(workspace.execution.policy.fixedMemoryKb,524288);
      if(statusOnly)continue;
      const run=(await call(prefix+'/run',token,'POST',{sourceCode:source,stdin:'5\n10\n'},200,1)).result;
      assert.equal(run.stdout,'15\n');assert.equal(run.category,'success');assert.equal(run.effectiveLimits.timeKind,'wall');assert.equal(run.effectiveLimits.memoryKb,524288);
    }
    if(statusOnly){console.log(`PASS: running application's ${language} availability enabled for both roles.`);continue;}
    const practice=(await call(prefix+'/tests',s,'POST',{sourceCode:source,includeHidden:true},200,1)).result;
    assert.equal(practice.total,1);assert.equal(practice.passed,1);assert.ok(!JSON.stringify(practice).includes(`PRIVATE-${suffix}`));
    const review=(await call(prefix+'/tests',t,'POST',{sourceCode:source},200,2)).result;
    assert.equal(review.total,2);assert.equal(review.passed,2);assert.equal(review.tests[1].stdin,'17\n23\n');assert.equal(review.limits.memoryKb,524288);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM submissions WHERE activity_id=$1',[a.id])).rows[0].n,0);
    if(language==='Dart'){
      await call(prefix+'/settings',t,'PATCH',{...options,autoEvaluate:true,technicalPoints:50});
      const submitted=(await call(`/classes/activities/${a.id}/submissions`,s,'POST',{contentText:source},200,2)).submission;
      const row=(await pool.query('SELECT teacher_score,grade_approved,content_text FROM submissions WHERE id=$1',[submitted.id])).rows[0];
      assert.equal(row.teacher_score,null);assert.equal(row.grade_approved,false);assert.equal(row.content_text,source);
      const history=(await call(prefix+'/history',s)).runs,record=history.find(r=>r.purpose==='submission');
      assert.equal(record.result.suggestedTechnicalScore,50);assert.equal(record.result.tests[1].stdin,undefined);assert.ok(!JSON.stringify(history).includes(`PRIVATE-${suffix}`));
    }
    console.log(`PASS: real ${language} Run Code and Run Tests through student/teacher HTTP routes; public/hidden boundaries and fixed provider limits verified.`);
  }
  console.log(statusOnly?`PASS: ${assertions} local application status responses; both roles enabled for all four languages.`:`PASS: ${assertions} live HTTP responses plus output/privacy/grade assertions; both roles, all four languages, optional final evaluation. Only authored fixtures were sent.`);
}finally{
  const ids=Object.values(users).map(u=>u.id);if(ids.length)await pool.query('DELETE FROM users WHERE id=ANY($1::int[]) AND email LIKE $2',[ids,`onlinecompiler-live-%-${suffix}@example.invalid`]);
  await cleanupCurriculumFixtures();if(server)await new Promise(r=>server.close(r));await pool.end();
}
