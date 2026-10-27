import {API_BASE_URL} from '../config/api';
export type CodeDiagnostic={line:number;column:number;endLine?:number;endColumn?:number;severity:'error'|'warning'|'info';message:string;code?:string;source:string};
export type CodeTest={name:string;stdin:string;expectedOutput:string;hidden:boolean};
export type CodeSettings={sampleInput:string;sampleOutput:string;expectedOutput:string|null;comparison:'strict'|'trimEnd';allowStudentExpected:boolean;testCases:CodeTest[];cpuSeconds:number;memoryKb:number;allowSyntaxErrors:boolean;autoEvaluate:boolean;requirePassingTests:boolean;technicalPoints:number|null};
export const defaultCodeSettings:CodeSettings={sampleInput:'',sampleOutput:'',expectedOutput:null,comparison:'strict',allowStudentExpected:false,testCases:[],cpuSeconds:3,memoryKb:128000,allowSyntaxErrors:true,autoEvaluate:false,requirePassingTests:false,technicalPoints:null};
export type CodeDraft={source_text:string;stdin:string;expected_output:string;revision:number;base_submitted_version:number;updated_at:string};
export type ExecutionPolicy={provider:string;timeKind:'wall'|'cpu';fixedMemoryKb:number|null;processes:number;message:string};
export type CodeWorkspaceData={language:string;settings:CodeSettings;draft:CodeDraft|null;currentSubmittedVersion:number;execution:{enabled:boolean;message:string;policy?:ExecutionPolicy}};
export type CodeRun={output:string;stdout:string;stderr:string;compileOutput:string;status:string;statusCode:number;category:string;runtime:string;executionTime:string|null;memory:number|null;exitCode:number|null;outputTruncated:boolean;notice?:string;effectiveLimits?:{timeSeconds:number;timeKind:'wall'|'cpu';memoryKb:number;processes:number};comparison?:{matched:boolean;expected:string;actual:string;normalization:string}|null};
export type CodeTestResult={tests:{name:string;stdin?:string;expectedOutput?:string;hidden:boolean;passed:boolean;result?:CodeRun;status?:string}[];passed:number;total:number;suggestedTechnicalScore:number|null;technicalPoints:number|null};
export type CodeHistory={id:string;student_id:number;purpose:string;language:string;source_hash:string;source_text:string;result:CodeRun|CodeTestResult|{status:string;message:string};submitted_version:number|null;created_at:string};
export type CodeBackup={source:string;stdin:string;expected:string;revision:number;baseVersion:number};
export function parseCodeBackup(raw:string|null):CodeBackup|null {
  try{const v=JSON.parse(raw||'null');if(!v||!['source','stdin','expected'].every(k=>typeof v[k]==='string')||!['revision','baseVersion'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0))return null;return v;}catch{return null;}
}
export class CodeWorkspaceError extends Error {status:number;constructor(message:string,status:number){super(message);this.status=status;}}
export async function codeRequest<T>(activityId:string,path:string,body?:Record<string,unknown>,method?:'PATCH'|'POST',signal?:AbortSignal):Promise<T>{
  const response=await fetch(`${API_BASE_URL}/classes/activities/${encodeURIComponent(activityId)}/code/${path}`,{method:method??(body?'POST':'GET'),credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal});
  const data=await response.json();if(!response.ok)throw new CodeWorkspaceError(data.message||'The code service is unavailable. Your editor text is preserved.',response.status);return data;
}
export const loadCodeWorkspace=(id:string,signal?:AbortSignal)=>codeRequest<CodeWorkspaceData>(id,'workspace',undefined,undefined,signal);
