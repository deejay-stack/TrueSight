import {useEffect,useState} from 'react';
import {Button} from '../ui/Button';
import {codeRequest,loadCodeWorkspace,type CodeSettings,type ExecutionPolicy} from '../../services/codeWorkspaceService';

export function CodeActivityOptions({value,onChange,executionReady=false,disabled=false,policy}:{value:CodeSettings;onChange:(value:CodeSettings)=>void;executionReady?:boolean;disabled?:boolean;policy?:ExecutionPolicy}){
  const update=(patch:Partial<CodeSettings>)=>onChange({...value,...patch});
  const field='theme-ring min-h-24 w-full rounded-lg border theme-border bg-[var(--app-surface)] p-3 font-mono text-sm';
  const line='theme-ring w-full rounded-lg border theme-border bg-[var(--app-surface)] p-2';
  return <fieldset disabled={disabled} className="min-w-0 space-y-4 rounded-xl border theme-border p-3 text-sm">
    <legend className="px-2 font-semibold">Programming input, output and tests</legend>
    <div className="grid gap-3 md:grid-cols-2"><label className="block space-y-1"><span>Sample input</span><textarea className={field} value={value.sampleInput} maxLength={20000} onChange={e=>update({sampleInput:e.target.value})}/></label><label className="block space-y-1"><span>Sample output / expected behavior</span><textarea className={field} value={value.sampleOutput} maxLength={20000} onChange={e=>update({sampleOutput:e.target.value})}/></label></div>
    <label className="flex items-center gap-2"><input type="checkbox" checked={value.expectedOutput!==null} onChange={e=>update({expectedOutput:e.target.checked?'':null})}/>Compare Run Code output with a teacher target</label>
    {value.expectedOutput!==null&&<label className="block space-y-1"><span>Expected output</span><textarea className={field} maxLength={20000} value={value.expectedOutput} onChange={e=>update({expectedOutput:e.target.value})}/></label>}
    <label className="flex items-center gap-2"><input type="checkbox" checked={value.allowStudentExpected} onChange={e=>update({allowStudentExpected:e.target.checked})}/>Allow a student practice comparison target (does not determine grades)</label>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block space-y-1"><span>Output comparison</span><select className={line} value={value.comparison} onChange={e=>update({comparison:e.target.value as CodeSettings['comparison']})}><option value="strict">Strict, including whitespace</option><option value="trimEnd">Normalize line endings and trim trailing whitespace</option></select></label>
      <label className="block space-y-1"><span>{policy?.timeKind==='wall'?'Wall-time limit (1–5 seconds)':'Time limit (1–5 seconds; CPU or provider wall time)'}</span><input className={line} type="number" min={1} max={5} value={value.cpuSeconds} onChange={e=>update({cpuSeconds:Number(e.target.value)})}/></label>
      {policy?.fixedMemoryKb?<label className="block space-y-1"><span>Provider memory limit</span><input className={line} readOnly value={`${policy.fixedMemoryKb/1024} MB (fixed)`}/></label>:<label className="block space-y-1"><span>Requested memory limit (KB; provider dependent)</span><select className={line} value={value.memoryKb} onChange={e=>update({memoryKb:Number(e.target.value)})}><option value={64000}>64000 KB</option><option value={128000}>128000 KB</option><option value={256000}>256000 KB</option></select></label>}
    </div>
    <p className="text-xs theme-muted">{policy?.message||'The execution service determines supported resource limits. Activity programming settings and run results display the effective limits before use.'}</p>
    <div className="space-y-3"><h4 className="font-semibold">Test cases</h4>
      {value.testCases.map((test,index)=><div key={index} className="min-w-0 space-y-2 rounded-lg border theme-border p-3">
        <label className="block space-y-1"><span>Test {index+1} name</span><input className={line} value={test.name} maxLength={120} onChange={e=>update({testCases:value.testCases.map((t,i)=>i===index?{...t,name:e.target.value}:t)})}/></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1"><span>Input</span><textarea className={field} maxLength={20000} value={test.stdin} onChange={e=>update({testCases:value.testCases.map((t,i)=>i===index?{...t,stdin:e.target.value}:t)})}/></label><label className="block space-y-1"><span>Expected output</span><textarea className={field} maxLength={20000} value={test.expectedOutput} onChange={e=>update({testCases:value.testCases.map((t,i)=>i===index?{...t,expectedOutput:e.target.value}:t)})}/></label></div>
        <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2"><input type="checkbox" checked={test.hidden} onChange={e=>update({testCases:value.testCases.map((t,i)=>i===index?{...t,hidden:e.target.checked}:t)})}/>Hidden teacher test</label><Button type="button" size="sm" variant="outline" onClick={()=>update({testCases:value.testCases.filter((_,i)=>i!==index)})}>Remove test</Button></div>
      </div>)}
      <Button type="button" size="sm" variant="outline" disabled={value.testCases.length>=10} onClick={()=>update({testCases:[...value.testCases,{name:`Sample ${value.testCases.length+1}`,stdin:'',expectedOutput:'',hidden:false}]})}>Add test case</Button>
      <p className="text-xs theme-muted">Public cases are visible to students. Hidden inputs and expected outputs are available only to the class teacher and configured submission evaluation.</p>
    </div>
    <label className="flex items-center gap-2"><input type="checkbox" checked={value.allowSyntaxErrors} onChange={e=>update({allowSyntaxErrors:e.target.checked})}/>Allow code with diagnostics to be submitted for partial credit</label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={value.autoEvaluate} disabled={!executionReady&&!value.autoEvaluate} onChange={e=>update({autoEvaluate:e.target.checked,requirePassingTests:e.target.checked?value.requirePassingTests:false})}/>Evaluate configured tests on submission</label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={value.requirePassingTests} disabled={(!executionReady&&!value.requirePassingTests)||!value.autoEvaluate} onChange={e=>update({requirePassingTests:e.target.checked})}/>Require all tests to pass before submission</label>
    {!executionReady&&<p className="text-xs theme-muted">Execution and automatic evaluation require a verified dedicated sandbox. Samples, test cases, drafts and live diagnostics remain available.</p>}
    <label className="block space-y-1"><span>Optional technical assessment points</span><input className={line} type="number" min={0.01} step={0.01} value={value.technicalPoints??''} onChange={e=>update({technicalPoints:e.target.value===''?null:Number(e.target.value)})}/></label>
    <p className="text-xs theme-muted">Test scores are suggestions. They never replace the teacher-approved rubric score.</p>
  </fieldset>;
}

export function TeacherCodeSettings({activityId}:{activityId:string}){
  const [policy,setPolicy]=useState<ExecutionPolicy>();
  const [open,setOpen]=useState(false),[settings,setSettings]=useState<CodeSettings|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
  useEffect(()=>{if(!open)return;let active=true;void loadCodeWorkspace(activityId).then(data=>{if(active){setSettings(data.settings);setReady(data.execution.enabled);setPolicy(data.execution.policy);}}).catch(e=>{if(active)setStatus(e instanceof Error?e.message:'Cannot load programming settings.');});return()=>{active=false;};},[activityId,open]);
  const save=async()=>{if(!settings||busy)return;setBusy(true);try{const result=await codeRequest<{settings:CodeSettings}>(activityId,'settings',settings,'PATCH');setSettings(result.settings);setStatus('Programming settings saved.');}catch(e){setStatus(e instanceof Error?e.message:'Cannot save programming settings.');}finally{setBusy(false);}};
  return <details className="mt-3 min-w-0 space-y-3" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary className="cursor-pointer text-sm font-semibold">Programming settings and test cases</summary>{settings&&<CodeActivityOptions value={settings} onChange={setSettings} executionReady={ready} disabled={busy} policy={policy}/>}<p role="status" className="text-sm">{status}</p>{settings&&<Button type="button" size="sm" disabled={busy} onClick={()=>void save()}>{busy?'Saving...':'Save programming settings'}</Button>}</details>;
}
