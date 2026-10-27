import pool from '../config/db.js';
import {createHash} from 'node:crypto';
import {CodeExecutionError,executeCode,executionAvailability,executionPolicy,normalizeExecutionLanguage} from './CodeExecutionService.js';
import {diagnoseCode} from './CodeDiagnostics.js';

export type CodeTest={name:string;stdin:string;expectedOutput:string;hidden:boolean};
export type CodeSettings={sampleInput:string;sampleOutput:string;expectedOutput:string|null;comparison:'strict'|'trimEnd';allowStudentExpected:boolean;testCases:CodeTest[];cpuSeconds:number;memoryKb:number;allowSyntaxErrors:boolean;autoEvaluate:boolean;requirePassingTests:boolean;technicalPoints:number|null};
const fail=(message:string,status=400):never=>{throw new CodeExecutionError(message,status);};
export const codeDefaults:CodeSettings={sampleInput:'',sampleOutput:'',expectedOutput:null,comparison:'strict',allowStudentExpected:false,testCases:[],cpuSeconds:3,memoryKb:128000,allowSyntaxErrors:true,autoEvaluate:false,requirePassingTests:false,technicalPoints:null};
function text(value:unknown,max=20000){if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>max)fail(`Text must be at most ${max} bytes.`);if((value as string).includes('\0'))fail('Source and input fields must contain text without NUL characters. Use an escaped character in source code instead.');return value as string;}
export function codeSettings(value:any):CodeSettings {
  const v={...codeDefaults,...value};
  if(!Array.isArray(v.testCases)||v.testCases.length>10)fail('Provide at most 10 test cases.');
  if(!['strict','trimEnd'].includes(v.comparison))fail('Select a supported output comparison.');
  for(const key of ['allowStudentExpected','allowSyntaxErrors','autoEvaluate','requirePassingTests'])if(typeof v[key]!=='boolean')fail('Invalid code activity option.');
  if(!Number.isInteger(v.cpuSeconds)||v.cpuSeconds<1||v.cpuSeconds>5||!Number.isInteger(v.memoryKb)||v.memoryKb<64000||v.memoryKb>256000)fail('Execution limits must be 1–5 seconds and 64000–256000 KB.');
  if(v.technicalPoints!==null&&(!Number.isFinite(v.technicalPoints)||v.technicalPoints<=0||v.technicalPoints>10000))fail('Technical assessment points must be a positive number.');
  const tests=v.testCases.map((t:any)=>{if(typeof t.hidden!=='boolean')fail('Choose public or hidden for each test.');return {name:text(t.name,120),stdin:text(t.stdin),expectedOutput:text(t.expectedOutput),hidden:t.hidden};});
  if((v.autoEvaluate||v.requirePassingTests)&&!tests.length)fail('Automatic evaluation requires at least one test case.');
  if(v.requirePassingTests&&!v.autoEvaluate)fail('Enable automatic evaluation before requiring passing tests.');
  return {sampleInput:text(v.sampleInput),sampleOutput:text(v.sampleOutput),expectedOutput:v.expectedOutput===null?null:text(v.expectedOutput),comparison:v.comparison,allowStudentExpected:v.allowStudentExpected,testCases:tests,cpuSeconds:v.cpuSeconds,memoryKb:v.memoryKb,allowSyntaxErrors:v.allowSyntaxErrors,autoEvaluate:v.autoEvaluate,requirePassingTests:v.requirePassingTests,technicalPoints:v.technicalPoints};
}
export const publicCodeSettings=(settings:CodeSettings)=>({...settings,testCases:settings.testCases.filter(t=>!t.hidden),technicalPoints:settings.technicalPoints});
export async function ensureCodeSchema(){
  await pool.query(`CREATE TABLE IF NOT EXISTS activity_code_settings(activity_id INTEGER PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,settings JSONB NOT NULL DEFAULT '{}'::jsonb,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS code_drafts(activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_text TEXT NOT NULL,stdin TEXT NOT NULL DEFAULT '',expected_output TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,base_submitted_version INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(activity_id,student_id));
    CREATE TABLE IF NOT EXISTS code_runs(id BIGSERIAL PRIMARY KEY,activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,submitted_version INTEGER,purpose VARCHAR(20) NOT NULL CHECK(purpose IN ('run','tests','submission')),language VARCHAR(20) NOT NULL,
      source_text TEXT NOT NULL,source_hash VARCHAR(64) NOT NULL,result JSON NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    DO $$ BEGIN IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='code_runs' AND column_name='result' AND data_type='jsonb') THEN
      ALTER TABLE code_runs ALTER COLUMN result TYPE JSON USING result::json;
    END IF; END $$;
    CREATE INDEX IF NOT EXISTS code_runs_owner_activity ON code_runs(student_id,activity_id,created_at DESC);`);
}
export async function codeActivity(db:Pick<typeof pool,'query'>,id:number,user:any,lock=false){
  if(!Number.isSafeInteger(id)||id<1)fail('Invalid activity ID.');
  const a=(await db.query(`SELECT a.id,a.class_id,a.submission_type,a.allow_resubmission,a.max_score,a.programming_language,a.due_date,c.teacher_id FROM activities a JOIN classes c ON c.id=a.class_id WHERE a.id=$1${lock?' FOR SHARE OF a,c':''}`,[id])).rows[0];
  if(!a)fail('Activity not found.',404);
  if(user.role==='teacher'){if(a.teacher_id!==Number(user.id))fail('Activity not found in your classes.',403);}
  else if(user.role!=='student'||!(await db.query('SELECT 1 FROM class_enrollments WHERE class_id=$1 AND student_id=$2',[a.class_id,user.id])).rows.length)fail('You are not enrolled in this class.',403);
  if(a.submission_type!=='code')fail('This is not a programming activity.');
  const language=normalizeExecutionLanguage(a.programming_language);
  if(!language)fail('This older activity has no supported programming language. Its submissions are preserved; ask the teacher to configure the language.');
  const settings=codeSettings((await db.query('SELECT settings FROM activity_code_settings WHERE activity_id=$1',[id])).rows[0]?.settings);
  return {activity:a,language,settings,userId:Number(user.id)};
}
export const codeConfigurationKey=(context:Awaited<ReturnType<typeof codeActivity>>)=>JSON.stringify([context.language,context.settings,context.activity.class_id,context.activity.allow_resubmission,context.activity.max_score]);
export function activityLanguage(body:any,language:string){if(body.language!==undefined&&normalizeExecutionLanguage(body.language)!==language)fail('Use the programming language assigned to this activity.',403);}
export const codeSource=(value:unknown)=>text(value,100000);
export function outputComparison(actual:string,expected:string,mode:'strict'|'trimEnd'){
  const normalize=(s:string)=>mode==='trimEnd'?s.replace(/\r\n/g,'\n').trimEnd():s;
  return {matched:normalize(actual)===normalize(expected),expected,actual,normalization:mode};
}
let executing=0;
const waiting:Array<()=>void>=[];
const runningAccounts=new Set<number>(),executionCounts=new Map<number,{start:number;count:number}>();
async function accountExecution<T>(userId:number,work:()=>Promise<T>):Promise<T>{
  if(runningAccounts.has(userId))fail('A program is already running for this account. Wait for it to finish.',429);
  const now=Date.now();if(executionCounts.size>2000)for(const [id,v]of executionCounts)if(now-v.start>=60000)executionCounts.delete(id);
  let usage=executionCounts.get(userId);if(!usage||now-usage.start>=60000){usage={start:now,count:0};executionCounts.set(userId,usage);}
  if(++usage.count>12)fail('Execution request limit reached. Try again in a minute.',429);
  runningAccounts.add(userId);try{return await work();}finally{runningAccounts.delete(userId);}
}
async function executionSlot<T>(work:()=>Promise<T>):Promise<T>{
  if(executing>=2){if(waiting.length>=8)fail('The execution queue is full. Try again shortly.',429);await new Promise<void>(resolve=>waiting.push(resolve));}
  else executing++;
  try{return await work();}finally{const next=waiting.shift();if(next)next();else executing--;}
}
export async function runProgram(context:Awaited<ReturnType<typeof codeActivity>>,source:string,stdin:unknown,expected?:unknown){
  const input=stdin===undefined?'':text(stdin);
  if(expected!==undefined&&!context.settings.allowStudentExpected)fail('Student-provided expected output is not enabled.',403);
  const result=await accountExecution(context.userId,()=>executionSlot(()=>executeCode({language:context.language,sourceCode:source,stdin:input,limits:context.settings})));
  const target=expected!==undefined?text(expected):context.settings.expectedOutput;
  return {...result,stdin:input,comparison:target!==null&&result.category==='success'&&!result.outputTruncated?outputComparison(result.stdout,target,context.settings.comparison):null};
}
export async function runCodeTests(context:Awaited<ReturnType<typeof codeActivity>>,source:string,includeHidden=false){
  const tests=context.settings.testCases.filter(t=>includeHidden||!t.hidden);
  if(!tests.length)fail('No permitted test cases are configured for this activity.');
  return accountExecution(context.userId,async()=>{
  const results=[];
  for(const test of tests){
    const result=await executionSlot(()=>executeCode({language:context.language,sourceCode:source,stdin:test.stdin,limits:context.settings}));
    results.push({...test,result,passed:result.category==='success'&&!result.outputTruncated&&outputComparison(result.stdout,test.expectedOutput,context.settings.comparison).matched});
  }
  const passed=results.filter(t=>t.passed).length;
  const policy=executionPolicy();
  return {tests:results,passed,total:results.length,comparison:context.settings.comparison,limits:{timeSeconds:context.settings.cpuSeconds,timeKind:policy.timeKind,memoryKb:policy.fixedMemoryKb??context.settings.memoryKb,processes:policy.processes},...(policy.message?{notice:policy.message}:{}),suggestedTechnicalScore:includeHidden&&context.settings.technicalPoints!==null?Math.round(passed/results.length*context.settings.technicalPoints*100)/100:null,technicalPoints:context.settings.technicalPoints};
  });
}
export function publicRunResult(result:any){
  if(!Array.isArray(result.tests))return result;
  return {...result,tests:result.tests.map((t:any)=>t.hidden?{hidden:true,passed:t.passed,status:t.result?.category,name:'Hidden test'}:t)};
}
export async function recordCodeRun(db:Pick<typeof pool,'query'>,context:Awaited<ReturnType<typeof codeActivity>>,studentId:number,source:string,purpose:string,result:any,submissionId:number|null=null,version:number|null=null){
  const row=(await db.query(`INSERT INTO code_runs(activity_id,student_id,submission_id,submitted_version,purpose,language,source_text,source_hash,result)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,created_at`,[context.activity.id,studentId,submissionId,version,purpose,context.language,source,createHash('sha256').update(source).digest('hex'),JSON.stringify(result)])).rows[0];
  await db.query(`DELETE FROM code_runs WHERE activity_id=$1 AND student_id=$2 AND purpose<>'submission' AND id NOT IN(SELECT id FROM code_runs WHERE activity_id=$1 AND student_id=$2 AND purpose<>'submission' ORDER BY id DESC LIMIT 20)`,[context.activity.id,studentId]);
  return row;
}
export async function checkCodeSubmission(db:Pick<typeof pool,'query'>,activityId:number,user:any,source:string,body:any){
  const context=await codeActivity(db,activityId,user);
  activityLanguage(body,context.language);codeSource(source);
  if(!context.activity.allow_resubmission&&(await db.query('SELECT 1 FROM submissions WHERE activity_id=$1 AND student_id=$2',[activityId,user.id])).rows.length)fail('Resubmission is not allowed for this activity.',409);
  if(!context.settings.allowSyntaxErrors){const diagnostics=await diagnoseCode(context.language,source);if(diagnostics.notice)fail('Full validation is unavailable for this file. Use supported single-file SDK imports or ask the teacher about partial-credit submission.',422);if(diagnostics.diagnostics.some(d=>d.severity==='error'))fail('Fix the syntax/compilation errors before submitting, as required by your teacher.',422);}
  if(context.settings.autoEvaluate&&context.settings.technicalPoints!==null&&context.settings.technicalPoints>Number(context.activity.max_score))fail('Technical assessment points exceed the current activity maximum. Ask the teacher to correct the assessment scheme.',409);
  const result=context.settings.autoEvaluate?await runCodeTests(context,source,true):null;
  if(result&&context.settings.requirePassingTests&&result.passed!==result.total)fail('The teacher requires all configured tests to pass before submission.',422);
  return {context,result};
}
export {executionAvailability};
