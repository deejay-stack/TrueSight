// Protocol tests use a fake HTTP provider; they do NOT claim real sandbox execution.
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
const baseDir=path.resolve('.tmp/provider-contract');await mkdir(baseDir,{recursive:true});const directory=await mkdtemp(path.join(baseDir,'test-'));
let postCount=0,status=3,stdout='',providerError=false,large=false,held=null,started=null;const submissions=[],requestHeaders=[];
const server=http.createServer(async(req,res)=>{
  requestHeaders.push(req.headers);
  if(req.url==='/languages'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify([{id:1,name:'Java (OpenJDK 21)'},{id:2,name:'JavaScript (Node.js 22)'},{id:3,name:'Python (3.14)'},{id:4,name:'Dart (3.8.0)'}]));}
  if(req.url.startsWith('/submissions?')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks).toString());submissions.push(input);postCount++;
    if(held){const waiting=held;started?.();await waiting;}
    if(providerError){res.statusCode=500;return res.end(JSON.stringify({message:'private-provider-token-must-not-leak'}));}
    return res.end(JSON.stringify({status:{id:status,description:status===3?'Accepted':status===5?'Time Limit Exceeded':status===6?'Compilation Error':'Runtime Error (SIGFPE)'},stdout:large?'x'.repeat(520000):stdout,stderr:status===8?'division by zero':'',compile_output:status===6?'real compiler fixture message':'',time:'0.01',memory:1234,exit_code:status===3?0:1}));
  }
  res.statusCode=404;res.end('{}');
});
server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const url=`http://127.0.0.1:${server.address().port}`,approvalFile=path.join(directory,'approval.json');
process.env.CODE_EXECUTION_API_URL=url;process.env.CODE_EXECUTION_APPROVAL_FILE=approvalFile;
const online=process.env.CODE_TEST_PROVIDER==='onlinecompiler';
process.env.CODE_EXECUTION_PROVIDER=online?'onlinecompiler':'judge0';
if(online){delete process.env.CODE_EXECUTION_API_KEY;delete process.env.CODE_EXECUTION_API_KEY_HEADER;delete process.env.CODE_EXECUTION_API_HOST;process.env.ONLINE_COMPILER_API_KEY='protocol-fixture-key';}
else {process.env.CODE_EXECUTION_API_KEY='protocol-fixture-key';process.env.CODE_EXECUTION_API_KEY_HEADER='X-RapidAPI-Key';process.env.CODE_EXECUTION_API_HOST='protocol-fixture.p.rapidapi.com';}
const {executeCode,executionAvailability}=await import('../dist/services/CodeExecutionService.js');
let checks=0,pool,apiServer,cleanupFixtures,releaseHeld;const fixtureIds=[];
try{
  assert.equal((await executionAvailability('python')).enabled,false);checks++;
  await assert.rejects(executeCode({language:'python',sourceCode:'print(1)'}),e=>e.statusCode===503);assert.equal(postCount,0);checks++;
  const approval={apiUrl:url,verified:true,reviewedBy:'Protocol fixture only — no real sandbox is attested',verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+300000).toISOString(),languages:{java:true,javascript:true,python:true,dart:true},javaPublicClassNames:true,controls:Object.fromEntries(['dedicatedHost','unprivilegedIsolation','noHostMounts','noApplicationSecrets','networkDisabled','cpuMemoryLimits','processLimits','outputLimits','temporaryWorkspaceCleanup'].map(k=>[k,true]))};
  await writeFile(approvalFile,JSON.stringify(approval));assert.equal((await executionAvailability('java')).enabled,true);checks++;
  for(const language of ['java','javascript','python','dart']){
    stdout='actual  output\n\n';const source=`protocol fixture: ${language}`;
    const result=await executeCode({language,sourceCode:source,stdin:'input\n',limits:{cpuSeconds:2,memoryKb:64000}});
    assert.equal(result.stdout,stdout);assert.equal(result.output,stdout,'Teacher output must preserve trailing newlines too.');assert.equal(result.category,'success');const request=submissions.at(-1);assert.equal(request.source_code,source);assert.equal(request.stdin,'input\n');assert.equal(request.cpu_time_limit,2);
    if(online){for(const field of ['enable_network','memory_limit','max_file_size','max_processes_and_or_threads','number_of_runs'])assert.equal(request[field],undefined);assert.equal(result.effectiveLimits.memoryKb,524288);assert.equal(result.effectiveLimits.timeKind,'wall');assert.ok(result.notice.includes('fixed 512 MB'));}
    else {assert.equal(request.enable_network,false);assert.equal(request.memory_limit,64000);assert.equal(request.number_of_runs,1);assert.ok(request.max_processes_and_or_threads<=32);}
    checks++;
  }
  stdout='';const before=postCount;const empty=await executeCode({language:'javascript',sourceCode:'1 + 2;'});assert.equal(postCount,before+1);assert.equal(empty.stdout,'');assert.equal(empty.category,'success');checks++;
  assert.ok(requestHeaders.length);for(const headers of requestHeaders){if(online){assert.equal(headers.authorization,'protocol-fixture-key');assert.equal(headers['x-rapidapi-host'],undefined);}else{assert.equal(headers['x-rapidapi-key'],'protocol-fixture-key');assert.equal(headers['x-rapidapi-host'],'protocol-fixture.p.rapidapi.com');}}checks++;
  for(const [id,category]of [[5,'time_limit'],[6,'compilation_error'],[8,'runtime_error']]){status=id;assert.equal((await executeCode({language:'python',sourceCode:'fixture'})).category,category);checks++;}
  status=3;providerError=true;await assert.rejects(executeCode({language:'python',sourceCode:'fixture'}),e=>!e.message.includes('private-provider-token'));checks++;providerError=false;
  large=true;await assert.rejects(executeCode({language:'python',sourceCode:'fixture'}),e=>e.statusCode===502);large=false;checks++;
  approval.controls.networkDisabled=false;await writeFile(approvalFile,JSON.stringify(approval));assert.equal((await executionAvailability('python')).enabled,false);checks++;
  const {outputComparison,publicRunResult}=await import('../dist/services/CodeWorkbench.js');
  pool=(await import('../dist/config/db.js')).default;
  assert.equal((await pool.query('SELECT $1::json AS result',[JSON.stringify({stdout:'exact\0output\n'})])).rows[0].result.stdout,'exact\0output\n');checks++;
  assert.equal(outputComparison('15\n','15','strict').matched,false);assert.equal(outputComparison('15\r\n','15','trimEnd').matched,true);assert.equal(outputComparison('14','15','trimEnd').matched,false);checks+=3;
  const hidden={tests:[{hidden:true,name:'Secret name',stdin:'Secret input',expectedOutput:'Secret answer',passed:false,result:{stdout:'Secret input',stderr:'Secret answer',category:'runtime_error'}}],passed:0,total:1};
  const projected=publicRunResult(hidden);assert.ok(!JSON.stringify(projected).includes('Secret'));assert.equal(projected.tests[0].passed,false);checks++;
  approval.controls.networkDisabled=true;await writeFile(approvalFile,JSON.stringify(approval));
  const {default:express}=await import('express'),{default:cookieParser}=await import('cookie-parser');
  const {default:auth}=await import('../dist/routes/auth.js'),{default:classes}=await import('../dist/routes/classes.js');
  const {fixtureSubject,cleanupCurriculumFixtures}=await import('./curriculum-fixture.mjs');cleanupFixtures=cleanupCurriculumFixtures;
  const app=express();app.use(express.json());app.use(cookieParser());app.use('/auth',auth);app.use('/classes',classes);
  apiServer=app.listen(0,'127.0.0.1');await new Promise(r=>apiServer.once('listening',r));const api=`http://127.0.0.1:${apiServer.address().port}`,suffix=Date.now();
  const call=async(route,token,method='GET',body,expected=200)=>{const response=await fetch(api+route,{method,headers:{'Content-Type':'application/json',...(token?{Cookie:`token=${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.equal(response.status,expected,`${route}: ${JSON.stringify(data)}`);checks++;return data;};
  const accounts={};for(const role of ['teacher','student']){const body={name:`Contract ${role}`,role,email:`code-contract-${role}-${suffix}@example.invalid`,password:`Test-${suffix}!`};const registered=await call('/auth/signup',null,'POST',body,201);fixtureIds.push(registered.user.id);accounts[role]={id:registered.user.id,token:(await call('/auth/login',null,'POST',body)).token};}
  const t=accounts.teacher.token,s=accounts.student.token;await call('/classes/academic/options',t);
  const classroom=(await call('/classes',t,'POST',{departmentCode:'BSIT',yearLevel:1,semester:1,subjectId:await fixtureSubject('BSIT',1),description:'Provider protocol fixture'},201)).class;
  await pool.query('INSERT INTO class_enrollments(class_id,student_id)VALUES($1,$2)',[classroom.id,accounts.student.id]);
  const privateInput=`private-input-${suffix}`,privateAnswer=`private-answer-${suffix}`;
  const options={autoEvaluate:true,technicalPoints:50,testCases:[{name:'Public',stdin:'sample',expectedOutput:'15\n',hidden:false},{name:'Private',stdin:privateInput,expectedOutput:privateAnswer,hidden:true}]};
  const a=(await call(`/classes/${classroom.id}/activities`,t,'POST',{title:'Protocol activity',description:'Fixture only; provider does not execute programs.',instructor:'Contract teacher',submissionType:'code',programmingLanguage:'JavaScript',dueDate:'2099-01-01',maxScore:100,codeSettings:options},201)).activity;
  const source='// protocol fixture only\nconsole.log("fixture");\n';stdout='15\n';
  let signalStarted;const beginning=new Promise(r=>signalStarted=r);started=signalStarted;held=new Promise(r=>releaseHeld=r);
  const pending=fetch(api+`/classes/activities/${a.id}/submissions`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`token=${s}`},body:JSON.stringify({contentText:source})});
  await Promise.race([beginning,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Evaluation did not start.')),10000))]);
  const changed={...options,sampleOutput:'Changed while evaluation was pending'};
  let patchTimeout;try{await Promise.race([call(`/classes/activities/${a.id}/code/settings`,t,'PATCH',changed),new Promise((_,reject)=>{patchTimeout=setTimeout(()=>reject(new Error('Compiler job held an activity database lock.')),5000);})]);}finally{clearTimeout(patchTimeout);}
  await call(`/classes/activities/${a.id}/submissions`,s,'POST',{contentText:source},429);
  await call(`/classes/activities/${a.id}/code/run`,s,'POST',{sourceCode:source},429);
  held=null;releaseHeld();const stale=await pending;assert.equal(stale.status,409);checks++;await stale.json();
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM submissions WHERE activity_id=$1',[a.id])).rows[0].n,0);
  const submitted=(await call(`/classes/activities/${a.id}/submissions`,s,'POST',{contentText:source})).submission;
  assert.equal((await pool.query('SELECT teacher_score,grade_approved FROM submissions WHERE id=$1',[submitted.id])).rows[0].teacher_score,null);
  const studentHistory=(await call(`/classes/activities/${a.id}/code/history`,s)).runs;assert.ok(!JSON.stringify(studentHistory).includes(privateInput));assert.ok(!JSON.stringify(studentHistory).includes(privateAnswer));
  assert.equal(studentHistory[0].result.suggestedTechnicalScore,25);
  const teacherHistory=(await call(`/classes/activities/${a.id}/code/history?studentId=${accounts.student.id}`,t)).runs;assert.equal(teacherHistory[0].result.tests[1].stdin,privateInput);
  stdout='actual\0output\n';const run=await call(`/classes/activities/${a.id}/code/run`,s,'POST',{sourceCode:source,stdin:'own input'});assert.equal(run.result.stdout,stdout);assert.equal(run.result.stdin,'own input');
  assert.equal((await call(`/classes/activities/${a.id}/code/history`,s)).runs[0].result.stdout,stdout);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM submissions WHERE activity_id=$1',[a.id])).rows[0].n,1,'Run Code must not create another submission.');
  stdout='15\n';
  for(const language of ['Java','JavaScript','Python','Dart']){
    const activity=(await call(`/classes/${classroom.id}/activities`,t,'POST',{title:`Role execution ${language}`,description:'Protocol fixture only',instructor:'Contract teacher',submissionType:'code',programmingLanguage:language,dueDate:'2099-01-01',maxScore:100,codeSettings:{...options,autoEvaluate:false}},201)).activity;
    const prefix=`/classes/activities/${activity.id}/code`;
    for(const token of [s,t]){
      const executed=await call(prefix+'/run',token,'POST',{sourceCode:source,stdin:'role input'});
      assert.equal(executed.result.stdout,'15\n');assert.equal(executed.result.stdin,'role input');
    }
    let before=postCount;
    const practice=await call(prefix+'/tests',s,'POST',{sourceCode:source,includeHidden:true});
    assert.equal(practice.result.total,1);assert.equal(postCount-before,1);assert.ok(!JSON.stringify(practice).includes(privateInput));assert.ok(!JSON.stringify(practice).includes(privateAnswer));
    before=postCount;
    const review=await call(prefix+'/tests',t,'POST',{sourceCode:source});
    assert.equal(review.result.total,2);assert.equal(postCount-before,2);assert.equal(review.result.tests[1].stdin,privateInput);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM submissions WHERE activity_id=$1',[activity.id])).rows[0].n,0,'Teacher and student practice must not create official submissions.');
  }
  console.log(`PASS: ${checks} provider/evaluation/comparison/privacy contract checks using a fake provider only; both roles can Run and Test all four languages when configured, teacher tests include hidden cases, student tests remain public, stale settings rejected without holding DB locks, cross-action account concurrency limited and teacher grades unchanged. No real programs were executed or sandbox security claimed.`);
}finally{
  held=null;releaseHeld?.();
  if(pool&&fixtureIds.length)await pool.query("DELETE FROM users WHERE id=ANY($1::int[]) AND email LIKE 'code-contract-%@example.invalid'",[fixtureIds]);
  if(cleanupFixtures)await cleanupFixtures();if(apiServer)await new Promise(r=>apiServer.close(r));if(pool)await pool.end();
  await new Promise(r=>server.close(r));if(path.resolve(directory).startsWith(baseDir+path.sep))await rm(directory,{recursive:true,force:true});
}
