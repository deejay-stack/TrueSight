import express from 'express';
import pool from '../config/db.js';
import {CodeExecutionError,executionPolicy} from '../services/CodeExecutionService.js';
import {diagnoseCode} from '../services/CodeDiagnostics.js';
import {activityLanguage,codeActivity,codeSettings,codeSource,executionAvailability,publicCodeSettings,publicRunResult,recordCodeRun,runCodeTests,runProgram} from '../services/CodeWorkbench.js';
const router=express.Router({mergeParams:true});
const activityId=(req:express.Request)=>Number((req.params as Record<string,string>).activityId);
const usage=new Map<string,{start:number;count:number}>();
const runningUsers=new Set<number>();
function quota(user:number,kind:string,max:number){
  const now=Date.now(),key=`${user}:${kind}`;
  if(usage.size>2000)for(const [k,v]of usage)if(now-v.start>60000)usage.delete(k);
  let slot=usage.get(key);if(!slot||now-slot.start>=60000){slot={start:now,count:0};usage.set(key,slot);}
  if(++slot.count>max)throw new CodeExecutionError(`Too many ${kind} requests. Try again shortly.`,429);
}
const error=(res,e)=>res.status(e instanceof CodeExecutionError?e.statusCode:e.code==='23505'?409:500).json({message:e instanceof CodeExecutionError?e.message:e.code==='23505'?'A newer draft exists. Reload it before saving.':'Unable to process the code workspace. Your source is preserved.'});
router.get('/workspace',async(req,res)=>{
  try{
    const context=await codeActivity(pool,activityId(req),req.user);
    const student=req.user.role==='student';
    const draft=student?(await pool.query('SELECT source_text,stdin,expected_output,revision,base_submitted_version,updated_at FROM code_drafts WHERE activity_id=$1 AND student_id=$2',[context.activity.id,req.user.id])).rows[0]??null:null;
    const submitted=student?(await pool.query('SELECT submitted_version FROM submissions WHERE activity_id=$1 AND student_id=$2',[context.activity.id,req.user.id])).rows[0]?.submitted_version??0:0;
    res.set('Cache-Control','no-store').json({language:context.language,settings:student?publicCodeSettings(context.settings):context.settings,draft,currentSubmittedVersion:submitted,execution:{...await executionAvailability(context.language),policy:executionPolicy()}});
  }catch(e){error(res,e);}
});
router.patch('/settings',async(req,res)=>{
  const db=await pool.connect();try{
    if(req.user.role!=='teacher')throw new CodeExecutionError('Only the class teacher can configure programming activities.',403);
    await db.query('BEGIN');const context=await codeActivity(db,activityId(req),req.user,true);
    const settings=codeSettings(req.body);
    if(settings.autoEvaluate&&!(await executionAvailability(context.language)).enabled)throw new CodeExecutionError('Verify the dedicated execution sandbox before enabling automatic evaluation.',409);
    if(settings.technicalPoints!==null&&settings.technicalPoints>Number(context.activity.max_score))throw new CodeExecutionError('Technical assessment points cannot exceed the activity maximum.',400);
    await db.query(`INSERT INTO activity_code_settings(activity_id,settings)VALUES($1,$2)ON CONFLICT(activity_id)DO UPDATE SET settings=EXCLUDED.settings,updated_at=NOW()`,[context.activity.id,JSON.stringify(settings)]);
    await db.query('COMMIT');res.json({settings});
  }catch(e){await db.query('ROLLBACK');error(res,e);}finally{db.release();}
});
router.post('/diagnostics',async(req,res)=>{
  const controller=new AbortController();const closed=()=>{if(!res.writableEnded)controller.abort();};res.once('close',closed);
  try{const context=await codeActivity(pool,activityId(req),req.user);activityLanguage(req.body,context.language);quota(Number(req.user.id),'diagnostic',120);const result=await diagnoseCode(context.language,req.body.sourceCode,controller.signal);if(!res.destroyed)res.set('Cache-Control','no-store').json(result);}catch(e){if(!res.destroyed)error(res,e);}finally{res.off('close',closed);}
});
router.patch('/draft',async(req,res)=>{
  const db=await pool.connect();try{
    if(req.user.role!=='student')throw new CodeExecutionError('Drafts are private to the student.',403);
    quota(Number(req.user.id),'draft',60);await db.query('BEGIN');
    const context=await codeActivity(db,activityId(req),req.user,true);activityLanguage(req.body,context.language);
    const source=codeSource(req.body.sourceCode),stdin=codeSource(req.body.stdin??''),expected=codeSource(req.body.expectedOutput??'');
    if(Buffer.byteLength(stdin)>20000||Buffer.byteLength(expected)>20000)throw new CodeExecutionError('Input and expected output must each be at most 20 KB.',413);
    const existing=(await db.query('SELECT submitted_version FROM submissions WHERE activity_id=$1 AND student_id=$2',[context.activity.id,req.user.id])).rows[0];
    const version=existing?.submitted_version??0;
    if(existing&&!context.activity.allow_resubmission)throw new CodeExecutionError('This submission is locked. Your official source is preserved.',409);
    if(req.body.baseSubmittedVersion!==version)throw new CodeExecutionError('The official submission changed. Reload this activity before saving the draft.',409);
    const revision=req.body.revision;if(!Number.isSafeInteger(revision)||revision<0)throw new CodeExecutionError('Invalid draft revision.',400);
    const saved=revision===0?await db.query(`INSERT INTO code_drafts(activity_id,student_id,source_text,stdin,expected_output,base_submitted_version)VALUES($1,$2,$3,$4,$5,$6)ON CONFLICT DO NOTHING RETURNING revision,updated_at`,[context.activity.id,req.user.id,source,stdin,expected,version]):await db.query(`UPDATE code_drafts SET source_text=$3,stdin=$4,expected_output=$5,base_submitted_version=$6,revision=revision+1,updated_at=NOW() WHERE activity_id=$1 AND student_id=$2 AND revision=$7 RETURNING revision,updated_at`,[context.activity.id,req.user.id,source,stdin,expected,version,revision]);
    if(!saved.rows.length)throw new CodeExecutionError('A newer draft exists in another tab. Reload it before saving; your current editor text is preserved.',409);
    await db.query('COMMIT');res.json(saved.rows[0]);
  }catch(e){await db.query('ROLLBACK');error(res,e);}finally{db.release();}
});
router.post(['/run','/tests'],async(req,res)=>{
  let runningUser:number|undefined;
  try{
    const context=await codeActivity(pool,activityId(req),req.user);activityLanguage(req.body,context.language);
    const tests=req.path==='/tests';quota(Number(req.user.id),tests?'test':'run',tests?4:12);
    const source=codeSource(req.body.sourceCode);
    const availability=await executionAvailability(context.language);if(!availability.enabled)throw new CodeExecutionError(availability.message,503);
    const userId=Number(req.user.id);if(runningUsers.has(userId))throw new CodeExecutionError('A program is already running for this account. Wait for it to finish.',429);runningUsers.add(userId);runningUser=userId;
    const result=tests?await runCodeTests(context,source,req.user.role==='teacher'):await runProgram(context,source,req.body.stdin,req.body.expectedOutput);
    const record=await recordCodeRun(pool,context,Number(req.user.id),source,tests?'tests':'run',result);
    res.set('Cache-Control','no-store').json({result,record});
  }catch(e){error(res,e);}finally{if(runningUser!==undefined)runningUsers.delete(runningUser);}
});
router.get('/history',async(req,res)=>{
  try{
    const context=await codeActivity(pool,activityId(req),req.user);const teacher=req.user.role==='teacher';
    const student=teacher&&req.query.studentId!==undefined?Number(req.query.studentId):teacher?null:Number(req.user.id);
    if(student!==null&&(!Number.isSafeInteger(student)||student<1))throw new CodeExecutionError('Invalid student ID.',400);
    const runs=(await pool.query(`SELECT id,student_id,purpose,language,source_hash,source_text,result,submitted_version,created_at FROM code_runs WHERE activity_id=$1${student===null?'':' AND student_id=$2'} ORDER BY id DESC LIMIT 30`,student===null?[context.activity.id]:[context.activity.id,student])).rows;
    res.set('Cache-Control','no-store').json({runs:runs.map(r=>({...r,result:teacher?r.result:publicRunResult(r.result)}))});
  }catch(e){error(res,e);}
});
export default router;
