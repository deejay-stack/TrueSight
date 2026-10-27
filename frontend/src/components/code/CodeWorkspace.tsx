import {useEffect,useRef,useState} from 'react';
import {CodeEditor} from './CodeEditor';
import {Button} from '../ui/Button';
import {CodeWorkspaceError,codeRequest,loadCodeWorkspace,parseCodeBackup,type CodeBackup,type CodeDiagnostic,type CodeHistory,type CodeRun,type CodeTestResult,type CodeWorkspaceData} from '../../services/codeWorkspaceService';

type Props={activityId:string;userId:string;value:string;onChange:(source:string)=>void;language:string|null;darkMode:boolean;locked:boolean;online:boolean};
type Backup=CodeBackup;
type Analysis={source:string;diagnostics:CodeDiagnostic[];checker:string;notice?:string;error?:string};
const fingerprint=(source:string,stdin:string,expected:string)=>JSON.stringify([source,stdin,expected]);
const emptyDiagnostics:CodeDiagnostic[]=[];
const diagnosticDelay=Math.min(3000,Math.max(250,Number(import.meta.env.VITE_CODE_DIAGNOSTIC_DELAY_MS)||750));

export function CodeWorkspace({activityId,userId,value,onChange,language,darkMode,locked,online}:Props){
  const [workspace,setWorkspace]=useState<CodeWorkspaceData|null>(null);
  const [workspaceError,setWorkspaceError]=useState('');
  const [refreshingExecution,setRefreshingExecution]=useState(false);
  const [input,setInput]=useState(''),[expected,setExpected]=useState('');
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [focus,setFocus]=useState<{line:number;column:number;token:number}|null>(null);
  const [panel,setPanel]=useState<'input'|'output'|'problems'|'tests'|'history'>('problems');
  const [run,setRun]=useState<{source:string;input:string;result:CodeRun}|null>(null);
  const [tests,setTests]=useState<{source:string;result:CodeTestResult}|null>(null);
  const [history,setHistory]=useState<CodeHistory[]>([]);
  const [busy,setBusy]=useState(false),[runError,setRunError]=useState('');
  const [saved,setSaved]=useState('Loading saved draft...');
  const [recovery,setRecovery]=useState<Backup|null>(null);
  const revision=useRef(0),baseVersion=useRef(0),conflict=useRef(false),savedFingerprint=useRef('');
  const edited=useRef(false),lockedNow=useRef(locked);
  const localBackupOk=useRef(true);
  const queue=useRef<Promise<void>>(Promise.resolve());
  const mounted=useRef(false),change=useRef(onChange);
  const current=useRef({source:value,stdin:input,expected});
  const backupKey=`truesight:code-draft:${userId}:${activityId}`;
  const diagnostics=analysis?.source===value?analysis.diagnostics:emptyDiagnostics;
  const checking=Boolean(workspace&&value.trim()&&analysis?.source!==value&&online);
  useEffect(()=>{change.current=onChange;current.current={source:value,stdin:input,expected};lockedNow.current=locked;},[onChange,value,input,expected,locked]);

  useEffect(()=>{
    mounted.current=true;const controller=new AbortController();let timedOut=false;
    const timeout=window.setTimeout(()=>{timedOut=true;controller.abort();},8000);
    void loadCodeWorkspace(activityId,controller.signal).then(data=>{
      window.clearTimeout(timeout);
      if(!mounted.current)return;setWorkspace(data);baseVersion.current=data.currentSubmittedVersion;revision.current=data.draft?.revision??0;
      const draft=data.draft?.base_submitted_version===data.currentSubmittedVersion?data.draft:null;
      let initial={source:draft?.source_text??current.current.source,stdin:draft?.stdin??data.settings.sampleInput,expected:draft?.expected_output??''};
      savedFingerprint.current=fingerprint(initial.source,initial.stdin,initial.expected);
      try{
        const local=parseCodeBackup(localStorage.getItem(backupKey));
        if(local&&!lockedNow.current){
          if(local.baseVersion===baseVersion.current&&local.revision===revision.current)initial={source:local.source,stdin:local.stdin,expected:local.expected};
          else if(fingerprint(local.source,local.stdin,local.expected)!==savedFingerprint.current)setRecovery(local);
        }
      }catch{ /* Server drafts remain authoritative when browser storage is unavailable. */ }
      if(fingerprint(initial.source,initial.stdin,initial.expected)!==savedFingerprint.current)edited.current=true;
      if(!lockedNow.current)change.current(initial.source);setInput(initial.stdin);setExpected(initial.expected);setSaved(draft?'Draft restored from server':'Draft ready');
      void codeRequest<{runs:CodeHistory[]}>(activityId,'history').then(r=>{if(mounted.current)setHistory(r.runs);}).catch(()=>{});
    }).catch(e=>{
      window.clearTimeout(timeout);
      if(!mounted.current||(controller.signal.aborted&&!timedOut))return;setWorkspaceError(timedOut?'Draft storage did not respond. Your current code remains available.':e instanceof Error?e.message:'The code workspace is unavailable.');
      try{const local=parseCodeBackup(localStorage.getItem(backupKey));if(local&&!lockedNow.current)setRecovery(local);}catch{ /* Keep the current editor source. */ }
      setSaved('Server draft unavailable; keep a local copy of your work.');
    });
    return()=>{mounted.current=false;window.clearTimeout(timeout);controller.abort();};
  },[activityId,backupKey]);

  useEffect(()=>{
    if(!workspace||!online||!value.trim())return;
    const controller=new AbortController();const source=value;
    const timer=window.setTimeout(()=>{
      void codeRequest<{diagnostics:CodeDiagnostic[];checker:string;notice?:string}>(activityId,'diagnostics',{sourceCode:source},'POST',controller.signal)
        .then(result=>{if(!controller.signal.aborted)setAnalysis({source,...result});})
        .catch(e=>{if(!controller.signal.aborted)setAnalysis({source,diagnostics:[],checker:'',error:e instanceof Error?e.message:'Live checking is unavailable.'});});
    },diagnosticDelay);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[activityId,value,online,workspace]);

  const saveDraft=()=>{
    if(locked)return;
    const snapshot={...current.current};
    try{localStorage.setItem(backupKey,JSON.stringify({...snapshot,revision:revision.current,baseVersion:baseVersion.current}));localBackupOk.current=true;}catch{localBackupOk.current=false;setSaved('Browser backup unavailable. Keep the editor open until server saving succeeds.');}
    const print=fingerprint(snapshot.source,snapshot.stdin,snapshot.expected);
    if(!workspace||!online||conflict.current)return;
    queue.current=queue.current.then(async()=>{
      if(!mounted.current||conflict.current||savedFingerprint.current===print)return;
      setSaved('Saving draft...');
      try{
        const result=await codeRequest<{revision:number}>(activityId,'draft',{sourceCode:snapshot.source,stdin:snapshot.stdin,expectedOutput:snapshot.expected,revision:revision.current,baseSubmittedVersion:baseVersion.current},'PATCH');
        revision.current=result.revision;savedFingerprint.current=print;
        if(mounted.current){setSaved(fingerprint(current.current.source,current.current.stdin,current.current.expected)===print?'Draft saved to server':'New changes waiting to save');}
      }catch(e){if(e instanceof CodeWorkspaceError&&e.status===409)conflict.current=true;if(mounted.current)setSaved(e instanceof Error?e.message:'Draft could not be synced. Browser backup retained.');}
    });
  };
  const saveAction=useRef(saveDraft);useEffect(()=>{saveAction.current=saveDraft;});
  useEffect(()=>{
    const backup=()=>{if(!edited.current)return;try{localStorage.setItem(backupKey,JSON.stringify({...current.current,revision:revision.current,baseVersion:baseVersion.current}));}catch{ /* Keep the server draft. */ }};
    window.addEventListener('pagehide',backup);return()=>window.removeEventListener('pagehide',backup);
  },[backupKey]);
  useEffect(()=>{
    if(locked||!edited.current||(!workspace&&!workspaceError))return;
    const local=window.setTimeout(()=>{
      try{localStorage.setItem(backupKey,JSON.stringify({source:value,stdin:input,expected,revision:revision.current,baseVersion:baseVersion.current} satisfies Backup));localBackupOk.current=true;}catch{localBackupOk.current=false;if(!online)setSaved('Browser storage is unavailable. Copy your code before leaving this page.');}
    },200);
    const timer=window.setTimeout(()=>{if(online)saveAction.current();else setSaved(localBackupOk.current?'Saved in this browser; reconnect to sync the draft.':'Browser storage is unavailable. Copy your code before leaving this page.');},1200);
    return()=>{window.clearTimeout(local);window.clearTimeout(timer);};
  },[backupKey,value,input,expected,online,locked,workspace,workspaceError]);

  const perform=async(kind:'run'|'tests')=>{
    if(busy||!online||!value.trim()||!workspace?.execution.enabled)return;
    setBusy(true);setRunError('');setPanel(kind==='run'?'output':'tests');const source=value,stdin=input;
    try{
      if(kind==='run'){
        const response=await codeRequest<{result:CodeRun}>(activityId,'run',{sourceCode:source,stdin,...(workspace.settings.allowStudentExpected?{expectedOutput:expected}:{})});
        if(mounted.current)setRun({source,input:stdin,result:response.result});
      }else{
        const response=await codeRequest<{result:CodeTestResult}>(activityId,'tests',{sourceCode:source});if(mounted.current)setTests({source,result:response.result});
      }
      const recent=await codeRequest<{runs:CodeHistory[]}>(activityId,'history');if(mounted.current)setHistory(recent.runs);
    }catch(e){if(mounted.current)setRunError(e instanceof Error?e.message:'The execution service is unavailable. Your code is preserved.');}
    finally{if(mounted.current)setBusy(false);}
  };
  const settings=workspace?.settings;
  const refreshExecution=async()=>{
    if(refreshingExecution||!online)return;
    setRefreshingExecution(true);
    try{
      const data=await loadCodeWorkspace(activityId);
      if(mounted.current){
        if(workspace)setWorkspace(previous=>previous?{...previous,execution:data.execution,settings:data.settings}:previous);
        else setRunError('Reload this activity to restore server draft access. Your browser draft is preserved.');
        if(workspace)setWorkspaceError('');
      }
    }catch(error){if(mounted.current)setRunError(error instanceof Error?error.message:'Execution status is unavailable.');}
    finally{if(mounted.current)setRefreshingExecution(false);}
  };
  return <section className="min-w-0 space-y-3" aria-label="Programming workspace">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">{language||'Code'} editor</h2><p role="status" className="text-xs theme-muted">{saved}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={locked||!workspace||!online} onClick={saveDraft}>Save Draft</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy||!online||!value.trim()||!workspace?.execution.enabled} onClick={()=>void perform('run')}>Run Code</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy||!online||!value.trim()||!workspace?.execution.enabled||!settings?.testCases.length} onClick={()=>void perform('tests')}>Run Tests</Button>
      </div>
    </header>
    {(workspaceError||!workspace?.execution.enabled)&&<p role="status" className="rounded-lg border theme-border p-3 text-sm theme-muted">{workspaceError||workspace?.execution.message||'Loading programming tools...'} You can keep editing and submit under the activity rules.</p>}
    {workspace?.execution.enabled&&workspace.execution.policy?.message&&<p role="status" className="rounded-lg border theme-border p-3 text-sm theme-muted">{workspace.execution.policy.message}</p>}
    {workspace&&<div className="flex flex-wrap items-center gap-2 text-xs theme-muted"><Button type="button" size="sm" variant="outline" disabled={refreshingExecution||!online||busy} onClick={()=>void refreshExecution()}>{refreshingExecution?'Checking execution status...':'Refresh execution status'}</Button>{!settings?.testCases.length&&<span>Run Tests needs public test cases configured by your teacher.</span>}</div>}
    {recovery&&<div className="space-y-2 rounded-lg border theme-border p-3 text-sm"><p>This browser has another unsent draft. The server copy has been preserved.</p><Button type="button" size="sm" disabled={locked} onClick={()=>{edited.current=true;onChange(recovery.source);setInput(recovery.stdin);setExpected(recovery.expected);setRecovery(null);}}>Restore browser draft</Button></div>}
    <div className="min-w-0 resize-y overflow-auto rounded-lg" style={{minHeight:360,maxHeight:'80vh'}}>
      <CodeEditor value={value} language={language} onChange={source=>{edited.current=true;setSaved('Unsaved changes');onChange(source);}} readOnly={locked||(!workspace&&!workspaceError)} minHeight={440} darkMode={darkMode} diagnostics={diagnostics} focusLocation={focus} onSave={saveDraft} onRun={()=>void perform('run')} ariaLabel="Student source code editor"/>
    </div>
    <p className="text-xs theme-muted">Ctrl+S: save draft. Ctrl+Enter: run when available. Tab/Shift+Tab: indent/outdent. Ctrl+F: search. Running code or tests never submits your activity.</p>
    <div className="flex flex-wrap gap-2" aria-label="Code tool panels">{(['input','output','problems','tests','history'] as const).map(tab=><Button key={tab} type="button" size="sm" variant={panel===tab?'secondary':'outline'} aria-pressed={panel===tab} onClick={()=>setPanel(tab)}>{tab==='problems'?`Problems (${diagnostics.length})`:tab==='tests'?'Test Results':tab[0].toUpperCase()+tab.slice(1)}</Button>)}</div>
    <div className="min-w-0 space-y-3 rounded-xl border theme-border p-3 text-sm" aria-live="polite">
      {busy&&<p role="status">Waiting for the dedicated execution service...</p>}
      {runError&&<p role="alert">{runError}</p>}
      {panel==='input'&&<>
        <label className="block space-y-1"><span>Program Input (stdin)</span><textarea value={input} maxLength={20000} disabled={!workspace&&!workspaceError} onChange={e=>{edited.current=true;setSaved('Unsaved changes');setInput(e.target.value);}} className="theme-ring min-h-32 w-full rounded-lg border theme-border bg-[var(--app-surface)] p-3 font-mono" placeholder="Enter all input before Run Code"/></label>
        {settings?.allowStudentExpected&&<label className="block space-y-1"><span>Expected output (practice comparison only)</span><textarea value={expected} maxLength={20000} onChange={e=>{edited.current=true;setExpected(e.target.value);}} className="theme-ring min-h-24 w-full rounded-lg border theme-border bg-[var(--app-surface)] p-3 font-mono"/></label>}
        {settings&&(settings.sampleInput||settings.sampleOutput)&&<div className="grid gap-3 sm:grid-cols-2"><div><p className="font-semibold">Sample input</p><pre className="overflow-auto whitespace-pre">{settings.sampleInput}</pre></div><div><p className="font-semibold">Sample output</p><pre className="overflow-auto whitespace-pre">{settings.sampleOutput}</pre></div></div>}
      </>}
      {panel==='problems'&&<>
        <p role="status">{!online?'Live checking requires a connection.':checking?'Checking syntax...':analysis?.source===value?analysis.error||analysis.notice||`${analysis.checker}: ${diagnostics.length?`${diagnostics.length} problem(s)`:'No diagnostics found.'}`:'Start typing to check syntax.'}</p>
        {diagnostics.map((d,i)=><button type="button" key={`${i}:${d.line}:${d.column}`} className="theme-ring block w-full rounded-lg border theme-border p-3 text-left break-words" onClick={()=>setFocus({line:d.line,column:d.column,token:Date.now()})}><span className="font-semibold">{d.severity} — Line {d.line}, column {d.column}</span><span className="block">{d.message}</span><span className="text-xs theme-muted">{d.source}{d.code?` / ${d.code}`:''}</span></button>)}
        {settings&&!settings.allowSyntaxErrors&&<p>The teacher requires syntax/compilation errors to be fixed before final submission.</p>}
      </>}
      {panel==='output'&&(!run?<p>No program has been executed.</p>:<>
        {(run.source!==value||run.input!==input)&&<p>These results belong to an earlier code/input snapshot.</p>}
        <p className="font-semibold">{run.result.status} / {run.result.runtime}{run.result.executionTime!==null?` / ${run.result.executionTime}s`:''}{run.result.memory!==null?` / ${run.result.memory} KB`:''}</p>
        <p>Exit code: {run.result.exitCode??'unavailable'}</p>
        {run.result.notice&&<p className="theme-muted">{run.result.notice}</p>}
        {[['Standard output',run.result.stdout],['Standard error',run.result.stderr],['Compiler output',run.result.compileOutput]].map(([label,content])=><div key={label}><h3 className="font-semibold">{label}</h3><pre className="max-h-80 overflow-auto whitespace-pre rounded-lg bg-[var(--app-bg-soft)] p-3 font-mono">{content||'(empty)'}</pre></div>)}
        {run.result.outputTruncated&&<p>Output reached the display limit; comparison is unavailable.</p>}
        {run.result.comparison&&<div><p className="font-semibold">{run.result.comparison.matched?'Output Matched':'Output Mismatch'}</p><p>Expected output ({run.result.comparison.normalization})</p><pre className="overflow-auto whitespace-pre">{run.result.comparison.expected}</pre></div>}
      </>)}
      {panel==='tests'&&(!tests?<><p>No tests have been run.</p>{settings?.testCases.map((test,i)=><div key={i} className="space-y-1 border-t theme-border pt-2"><p className="font-semibold">{test.name||`Sample ${i+1}`}</p><p>Input</p><pre className="overflow-auto whitespace-pre">{test.stdin}</pre><p>Expected output</p><pre className="overflow-auto whitespace-pre">{test.expectedOutput}</pre></div>)}</>:<>
        {tests.source!==value&&<p>These test results belong to an earlier code snapshot.</p>}<p>{tests.result.passed}/{tests.result.total} visible tests passed.</p>
        {tests.result.tests.map((test,i)=><div key={i} className="space-y-1 border-t theme-border pt-2"><p className="font-semibold">{test.name}: {test.passed?'Passed':'Failed'}</p>{test.result&&<><p>{test.result.status}</p><pre className="overflow-auto whitespace-pre">{test.result.stdout}</pre><pre className="overflow-auto whitespace-pre">{test.result.stderr||test.result.compileOutput}</pre></>}</div>)}
      </>)}
      {panel==='history'&&<>{!history.length?<p>No saved execution or submission records.</p>:history.map(item=><details key={item.id} className="border-t theme-border pt-2"><summary className="cursor-pointer">{item.purpose} / {item.language} / {new Date(item.created_at).toLocaleString()}{item.submitted_version?` / submitted version ${item.submitted_version}`:''}</summary><pre className="max-h-64 overflow-auto whitespace-pre">{item.source_text}</pre><pre className="max-h-64 overflow-auto whitespace-pre">{JSON.stringify(item.result,null,2)}</pre></details>)}</>}
    </div>
  </section>;
}
