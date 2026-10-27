import {spawn} from 'node:child_process';
import {access,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
import {CodeExecutionError,normalizeExecutionLanguage} from './CodeExecutionService.js';

export type CodeDiagnostic={line:number;column:number;endLine?:number;endColumn?:number;severity:'error'|'warning'|'info';message:string;code?:string;source:string};
export type DiagnosticsResult={diagnostics:CodeDiagnostic[];available:boolean;checker:string;notice?:string;entryClass?:string};
const moduleDirectory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(moduleDirectory,path.basename(path.dirname(moduleDirectory))==='dist'?'../..':'..');
const resources=path.join(root,'services/diagnostics');
const temporary=path.join(root,'.tmp/code-diagnostics');
const javaTarget=path.join(temporary,`java-checker-${process.pid}`);
let active=0;
let javaReady:Promise<void>|null=null;

async function executable(name:string,configured?:string) {
  if(configured)return configured;
  for(const directory of (process.env.PATH??'').split(path.delimiter)) {
    const target=path.join(directory,process.platform==='win32'?`${name}.exe`:name);
    try{await access(target);return target;}catch{ /* Try the next installed location. */ }
    if(name==='dart'&&process.platform==='win32')try{const sdk=path.join(directory,'cache/dart-sdk/bin/dart.exe');await access(sdk);return sdk;}catch{ /* Flutter wraps its bundled SDK. */ }
  }
  throw new CodeExecutionError(`${name} is not available for live diagnostics.`,503);
}

async function tool(command:string,args:string[],source:string,workspace:string,timeout=8000,signal?:AbortSignal) {
  return new Promise<{stdout:string;stderr:string;exitCode:number|null}>((resolve,reject)=>{
    // No app environment, database credentials, inherited Java agents or Python startup hooks.
    const child=spawn(command,args,{cwd:workspace,windowsHide:true,shell:false,env:{
      SystemRoot:process.env.SystemRoot??'',PATH:process.env.PATH??'',TEMP:workspace,TMP:workspace,
      USERPROFILE:workspace,APPDATA:workspace,LOCALAPPDATA:workspace,PUB_CACHE:path.join(workspace,'pub-cache'),
      DART_SUPPRESS_ANALYTICS:'true',LANG:'en_US.UTF-8',LC_ALL:'C.UTF-8',
    },stdio:['pipe','pipe','pipe']});
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    let stdout='',stderr='',overflow=false,timedOut=false,cancelled=false;
    const terminate=()=>{
      if(process.platform==='win32'&&child.pid){const killer=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});killer.on('error',()=>child.kill());killer.on('exit',code=>{if(code!==0)child.kill();});}
      else child.kill();
    };
    const timer=setTimeout(()=>{timedOut=true;terminate();},timeout);
    const abort=()=>{cancelled=true;terminate();};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const append=(key:'stdout'|'stderr',chunk:Buffer)=>{
      if(key==='stdout')stdout+=chunk.toString();else stderr+=chunk.toString();
      if(stdout.length+stderr.length>160000){overflow=true;terminate();}
    };
    child.stdout.on('data',c=>append('stdout',c));child.stderr.on('data',c=>append('stderr',c));
    child.stdin.on('error',()=>{});child.stdin.end(source,'utf8');
    child.once('error',()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new CodeExecutionError('The language checker could not start.',503));});
    child.once('close',exitCode=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(cancelled)reject(new CodeExecutionError('Validation cancelled.',499));else if(timedOut||overflow)reject(new CodeExecutionError('Live checking reached its resource limit. Your code is preserved.',503));else resolve({stdout,stderr,exitCode});});
  });
}

// Conservative import policy for the single-file analyzer. The SDK formatter first
// validates syntax. Never resolve a user-controlled filesystem or package URI.
function sdkImportsOnly(source:string) {
  let i=0,directive=false;
  while(i<source.length) {
    if(source.startsWith('//',i)){i=source.indexOf('\n',i);if(i<0)break;continue;}
    if(source.startsWith('/*',i)){let depth=1;i+=2;while(i<source.length&&depth){if(source.startsWith('/*',i)){depth++;i+=2;}else if(source.startsWith('*/',i)){depth--;i+=2;}else i++;}continue;}
    const raw=source[i]==='r'&&['"',"'"].includes(source[i+1]);if(raw)i++;
    if(['"',"'"].includes(source[i])) {
      const q=source[i],delimiter=source.startsWith(q.repeat(3),i)?q.repeat(3):q;i+=delimiter.length;let value='';
      while(i<source.length&&!source.startsWith(delimiter,i)) {
        if(!raw&&source.startsWith('${',i))return false;
        if(!raw&&source[i]==='\\'){value+='\\';i++;}
        value+=source[i++]??'';
      }
      i+=delimiter.length;if(directive&&!/^dart:[a-z_]+$/.test(value))return false;continue;
    }
    const identifier=source.slice(i).match(/^[A-Za-z_$][\w$]*/);
    if(identifier){if(['import','export','part'].includes(identifier[0]))directive=true;i+=identifier[0].length;continue;}
    if(source[i]===';')directive=false;i++;
  }
  return true;
}

export async function diagnoseCode(languageValue:unknown,sourceValue:unknown,signal?:AbortSignal):Promise<DiagnosticsResult> {
  if(signal?.aborted)throw new CodeExecutionError('Validation cancelled.',499);
  const language=normalizeExecutionLanguage(languageValue);
  if(!language)throw new CodeExecutionError('This activity has no supported programming language.',400);
  if(typeof sourceValue!=='string'||Buffer.byteLength(sourceValue,'utf8')>100000)throw new CodeExecutionError('Source code must be at most 100 KB.',413);
  const source=sourceValue;
  if(!source.trim())return {available:true,diagnostics:[],checker:language};
  if(active>=3)throw new CodeExecutionError('Language checking is busy. It will retry after your next edit.',429);
  active++;
  let workspace:string|undefined;
  try {
    await mkdir(temporary,{recursive:true});workspace=await mkdtemp(path.join(temporary,'check-'));
    if(language==='javascript') {
      try{new Script(source,{filename:'submission.js'});return {available:true,diagnostics:[],checker:'Node.js syntax parser'};}
      catch(e:any){
        // --check only parses. CommonJS allows top-level return; ESM allows import/export.
        const common=await tool(process.execPath,['--check','--input-type=commonjs'],source,workspace,8000,signal);
        if(common.exitCode===0)return {available:true,checker:'Node.js CommonJS syntax parser',diagnostics:[]};
        const module=await tool(process.execPath,['--check','--input-type=module'],source,workspace,8000,signal);
        if(module.exitCode===0)return {available:true,checker:'Node.js ES module syntax parser',diagnostics:[]};
        const lines=String(e.stack??'').split('\n'),location=lines[0].match(/submission\.js:(\d+)/),column=(lines[2]?.indexOf('^')??-1)+1;
        return {available:true,checker:'Node.js syntax parser',diagnostics:[{line:Number(location?.[1]??1),column:Math.max(1,column),severity:'error',message:e.message,source:'Node.js syntax parser'}]};
      }
    }
    if(language==='python') {
      const python=await executable('python',process.env.CODE_PYTHON_EXECUTABLE||process.env.PYTHON_EXECUTABLE);
      const result=await tool(python,['-I','-S','-X','utf8',path.join(resources,'python_check.py')],source,workspace,8000,signal);
      if(result.exitCode!==0)throw new CodeExecutionError('Python syntax checking is unavailable.',503);
      return {available:true,checker:'Python AST',...JSON.parse(result.stdout)};
    }
    if(language==='java') {
      const java=await executable('java',process.env.CODE_JAVA_EXECUTABLE),javac=await executable('javac',process.env.CODE_JAVAC_EXECUTABLE);
      if(!javaReady)javaReady=(async()=>{
        const target=javaTarget;await mkdir(target,{recursive:true});
        const result=await tool(javac,['-J-Xmx128m','-proc:none','-d',target,path.join(resources,'JavaDiagnostics.java')],'',target,15000);
        if(result.exitCode!==0)throw new CodeExecutionError('The Java diagnostic helper could not be compiled.',503);
      })().catch(e=>{javaReady=null;throw e;});
      await javaReady;
      const result=await tool(java,['-Xmx128m','-Duser.language=en','-cp',javaTarget,'JavaDiagnostics',workspace],source,workspace,8000,signal);
      if(result.exitCode!==0)throw new CodeExecutionError('Java compilation checking is unavailable.',503);
      return {available:true,checker:'javac (annotation processing disabled)',...JSON.parse(result.stdout)};
    }
    const dart=await executable('dart',process.env.CODE_DART_EXECUTABLE);
    await mkdir(path.join(workspace,'.dart_tool'),{recursive:true});
    await writeFile(path.join(workspace,'.dart_tool/package_config.json'),'{"configVersion":2,"packages":[]}');
    await writeFile(path.join(workspace,'analysis_options.yaml'),'analyzer:\n  plugins: []\n');
    const file=path.join(workspace,'submission.dart');await writeFile(file,source);
    const parsed=await tool(dart,['format','--output=none',file],'',workspace,8000,signal);
    if(parsed.exitCode!==0) {
      const diagnostics:CodeDiagnostic[]=[];const text=parsed.stderr;
      for(const match of text.matchAll(/line (\d+), column (\d+) of [^\r\n]+:\s*([^\r\n]+)/g))diagnostics.push({line:Number(match[1]),column:Number(match[2]),severity:'error',message:match[3],source:'Dart SDK parser'});
      if(!diagnostics.length)throw new CodeExecutionError('Dart syntax checking is unavailable.',503);
      return {available:true,checker:'Dart SDK parser',diagnostics};
    }
    if(!sdkImportsOnly(source))return {available:true,checker:'Dart SDK parser',diagnostics:[],notice:'Syntax checked. Type analysis is limited to single-file programs with direct Dart SDK imports.'};
    const analyzed=await tool(dart,['analyze','--format=machine',file],'',workspace,12000,signal);
    const diagnostics:CodeDiagnostic[]=[];
    for(const line of (analyzed.stdout+'\n'+analyzed.stderr).split(/\r?\n/)) {
      const parts=line.split('|');if(parts.length<8||!['ERROR','WARNING','INFO'].includes(parts[0]))continue;
      if(path.resolve(parts[3])!==file)continue;
      diagnostics.push({severity:parts[0].toLowerCase() as CodeDiagnostic['severity'],code:parts[2],line:Number(parts[4]),column:Number(parts[5]),endColumn:Number(parts[5])+Number(parts[6]),message:parts.slice(7).join('|'),source:'Dart analyzer'});
    }
    if(analyzed.exitCode!==0&&!diagnostics.length)throw new CodeExecutionError('Dart type analysis is unavailable.',503);
    return {available:true,checker:'Dart analyzer',diagnostics:diagnostics.slice(0,80)};
  }finally{active--;if(workspace&&path.resolve(workspace).startsWith(path.resolve(temporary)+path.sep))await rm(workspace,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});}
}
