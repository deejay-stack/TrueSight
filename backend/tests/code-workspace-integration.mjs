import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import auth from '../dist/routes/auth.js';
import pool from '../dist/config/db.js';
import {fixtureSubject,cleanupCurriculumFixtures} from './curriculum-fixture.mjs';
process.env.CODE_EXECUTION_PROVIDER='judge0';process.env.CODE_EXECUTION_API_URL='';delete process.env.CODE_EXECUTION_APPROVAL_FILE;
const {default:classes}=await import('../dist/routes/classes.js');
const app=express();app.use(express.json({limit:'8mb'}));app.use(cookieParser());app.use('/auth',auth);app.use('/classes',classes);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`,suffix=Date.now(),users={};let checks=0;
async function call(route,token,method='GET',body,expected=200){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Cookie:`token=${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.equal(response.status,expected,`${route}: ${JSON.stringify(data)}`);checks++;return data;}
try{
  for(const [name,role]of [['teacher','teacher'],['student','student'],['other','student'],['unrelated','teacher']]){
    const body={name,role,email:`code-workspace-${name}-${suffix}@example.invalid`,password:`Test-${suffix}!`};
    const registered=await call('/auth/signup',null,'POST',body,201);users[name]={id:registered.user.id,token:(await call('/auth/login',null,'POST',body)).token};
  }
  const t=users.teacher.token,s=users.student.token,o=users.other.token,u=users.unrelated.token;
  await call('/classes/academic/options',t);
  const classroom=(await call('/classes',t,'POST',{subjectId:await fixtureSubject('BSIT',1),departmentCode:'BSIT',yearLevel:1,semester:1,description:'Code workspace fixture'},201)).class;
  await pool.query('INSERT INTO class_enrollments(class_id,student_id)VALUES($1,$2)',[classroom.id,users.student.id]);
  const definition={title:'Programming fixture',instructor:'Teacher',description:'Solve this programming problem.',submissionType:'code',dueDate:'2099-01-01',maxScore:100,allowResubmission:false};
  const hidden='HIDDEN-INPUT-'+suffix,secret='HIDDEN-EXPECTED-'+suffix;
  const codeSettings={testCases:[{name:'Sample',stdin:'5\n10\n',expectedOutput:'15\n',hidden:false},{name:'Private case',stdin:hidden,expectedOutput:secret,hidden:true}],sampleInput:'5\n10\n',sampleOutput:'15\n'};
  await call(`/classes/${classroom.id}/activities`,t,'POST',{...definition,programmingLanguage:'C++'},400);
  let lastActivityId,lastSnapshot;
  for(const [language,valid,invalid]of [['javascript','console.log("exact");\n','console.log('],['python','print("exact")\n','if True\n  print(1)'],['java','public class Greetings { public static void main(String[] args) { System.out.println("exact"); } }','public class {'],['dart',"void main() { print('exact'); }", "void main() { print('exact') }"]]){
    const a=(await call(`/classes/${classroom.id}/activities`,t,'POST',{...definition,programmingLanguage:language,codeSettings},201)).activity;
    lastActivityId=a.id;
    const prefix=`/classes/activities/${a.id}/code`;
    await call(prefix+'/workspace',null,'GET',undefined,401);await call(prefix+'/workspace',o,'GET',undefined,403);await call(prefix+'/workspace',u,'GET',undefined,403);
    const workspace=await call(prefix+'/workspace',s);assert.equal(workspace.language,language);assert.equal(workspace.execution.enabled,false);assert.equal(workspace.settings.testCases.length,1);assert.ok(!JSON.stringify(workspace).includes(hidden));assert.ok(!JSON.stringify(workspace).includes(secret));
    const teacherWorkspace=await call(prefix+'/workspace',t);assert.equal(teacherWorkspace.settings.testCases.length,2);
    await call(prefix+'/settings',s,'PATCH',{autoEvaluate:true},403);
    await call(prefix+'/settings',t,'PATCH',{...workspace.settings,autoEvaluate:true},409);
    await call(prefix+'/diagnostics',s,'POST',{sourceCode:valid,language:language==='python'?'java':'python'},403);
    assert.equal((await call(prefix+'/diagnostics',s,'POST',{sourceCode:valid})).diagnostics.filter(d=>d.severity==='error').length,0);
    assert.ok((await call(prefix+'/diagnostics',s,'POST',{sourceCode:invalid})).diagnostics.some(d=>d.severity==='error'));
    await call(prefix+'/settings',t,'PATCH',{...teacherWorkspace.settings,allowSyntaxErrors:false});
    await call(`/classes/activities/${a.id}/submissions`,s,'POST',{contentText:invalid},422);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM submissions WHERE activity_id=$1',[a.id])).rows[0].n,0);
    await call(prefix+'/settings',t,'PATCH',teacherWorkspace.settings);
    await call(prefix+'/diagnostics',o,'POST',{sourceCode:valid},403);
    await call(prefix+'/run',s,'POST',{sourceCode:valid,stdin:'',cpuSeconds:999,includeHidden:true},503);
    await call(prefix+'/tests',s,'POST',{sourceCode:valid,includeHidden:true,testCases:[{stdin:'spoof'}]},503);
    await call(prefix+'/run',t,'POST',{sourceCode:valid},503);
    await call(prefix+'/tests',t,'POST',{sourceCode:valid},503);
    await call(prefix+'/run',s,'POST',{sourceCode:valid,language:language==='python'?'java':'python'},403);
    const source='\n  '+valid+'\n';
    lastSnapshot=source;
    const draft=await call(prefix+'/draft',s,'PATCH',{sourceCode:source,stdin:'typed\n',expectedOutput:'expected\n',revision:0,baseSubmittedVersion:0,studentId:users.other.id});assert.equal(draft.revision,1);
    const restored=await call(prefix+'/workspace',s);assert.equal(restored.draft.source_text,source);assert.equal(restored.draft.stdin,'typed\n');
    await call(prefix+'/draft',s,'PATCH',{sourceCode:'stale',revision:0,baseSubmittedVersion:0},409);
    await call(prefix+'/draft',o,'PATCH',{sourceCode:'stolen',studentId:users.student.id,revision:1,baseSubmittedVersion:0},403);
    const version=(await call(prefix+'/workspace',s)).draft.revision;
    const simultaneous=await Promise.all(['first','second'].map(sourceCode=>fetch(base+prefix+'/draft',{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:`token=${s}`},body:JSON.stringify({sourceCode,revision:version,baseSubmittedVersion:0})})));
    assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);checks+=2;
    const revision=(await call(prefix+'/workspace',s)).draft.revision;
    await call(prefix+'/draft',s,'PATCH',{sourceCode:source,revision,baseSubmittedVersion:0});
    await call(`/classes/activities/${a.id}/submissions`,s,'POST',{contentText:source,language:language==='python'?'java':'python'},403);
    const submitted=(await call(`/classes/activities/${a.id}/submissions`,s,'POST',{contentText:source})).submission;assert.equal(submitted.content_text,source);
    const saved=(await pool.query('SELECT content_text,submitted_version,teacher_score FROM submissions WHERE id=$1',[submitted.id])).rows[0];assert.equal(saved.content_text,source);assert.equal(saved.submitted_version,1);assert.equal(saved.teacher_score,null);
    const records=await call(prefix+'/history',s);assert.equal(records.runs[0].purpose,'submission');assert.equal(records.runs[0].source_text,source);assert.equal(records.runs[0].result.status,'Not evaluated');assert.ok(!JSON.stringify(records).includes(secret));
    await call(prefix+'/history',o,'GET',undefined,403);
    assert.equal((await call(prefix+'/workspace',s)).draft,null);
    await call(prefix+'/draft',s,'PATCH',{sourceCode:'late overwrite',revision:0,baseSubmittedVersion:0},409);
    await call(`/classes/activities/${a.id}/submissions`,s,'POST',{contentText:'retry'},409);
    const privateRecords=await call(prefix+`/history?studentId=${users.student.id}`,t);assert.equal(privateRecords.runs[0].submitted_version,1);
  }
  await pool.query('INSERT INTO class_enrollments(class_id,student_id)VALUES($1,$2)',[classroom.id,users.other.id]);
  const peer=`/classes/activities/${lastActivityId}/code`;
  assert.equal((await call(peer+'/workspace',o)).draft,null);
  assert.equal((await call(peer+`/history?studentId=${users.student.id}`,o)).runs.length,0,'Enrolled peers cannot select another student history.');
  await call(peer+'/draft',o,'PATCH',{sourceCode:'peer source',revision:0,baseSubmittedVersion:0,studentId:users.student.id});
  assert.equal((await call(peer+'/history',s)).runs[0].source_text,lastSnapshot);
  await call('/classes/code/execute',s,'POST',{language:'python',sourceCode:'print(1)'},410);
  console.log(`PASS: ${checks} code-workspace HTTP checks: all four real diagnostics, assigned language/ownership, hidden-test privacy, safe disabled execution, private CAS drafts/races, exact official snapshots, locked attempts, versioned code records and unchanged teacher scores.`);
}finally{
  const ids=Object.values(users).map(u=>u.id);if(ids.length)await pool.query('DELETE FROM users WHERE id=ANY($1::int[]) AND email LIKE $2',[ids,`code-workspace-%-${suffix}@example.invalid`]);
  await cleanupCurriculumFixtures();await new Promise(r=>server.close(r));await pool.end();
}
