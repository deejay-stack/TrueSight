// Opt-in real-provider verification. Only these authored fixtures leave the machine.
// Does not grant approval or read any student's source.
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
dotenv.config({quiet:true});
assert.equal(process.env.TRUESIGHT_LIVE_CODE_TEST,'1','Opt in with TRUESIGHT_LIVE_CODE_TEST=1.');
const key=process.env.ONLINE_COMPILER_API_KEY?.trim();assert.ok(key,'Save ONLINE_COMPILER_API_KEY in backend/.env.');
const base='https://api.onlinecompiler.io/api/judge0',results=[];
let last=0;
async function run(name,language,source,stdin='',time=3,verify=d=>assert.equal(d.status?.id,3)){
  const pause=Math.max(0,2300-(Date.now()-last));if(pause)await new Promise(r=>setTimeout(r,pause));last=Date.now();
  const response=await fetch(base+'/submissions?base64_encoded=false&wait=true',{method:'POST',headers:{Authorization:key,'Content-Type':'application/json'},body:JSON.stringify({language_id:language,source_code:source,stdin,cpu_time_limit:time,wall_time_limit:time+2}),redirect:'error',signal:AbortSignal.timeout(25000)});
  assert.equal(response.status,201,`${name}: provider HTTP ${response.status}`);const data=await response.json();verify(data);
  results.push({name,status:data.status?.description,time:data.time,memoryKb:data.memory});console.log(`PASS: ${name} (${data.status?.description})`);
}
const equal=expected=>d=>{assert.equal(d.status?.id,3);assert.equal(d.stdout,expected);};
const fails=d=>{assert.notEqual(d.status?.id,3);assert.ok(d.stderr||d.compile_output);};
for(const [name,id,valid,syntax,runtime] of [
  ['Java',91,'import java.util.Scanner; public class Greetings { public static void main(String[] a) { Scanner s=new Scanner(System.in); System.out.println("Hello"); System.out.println(s.nextInt()+s.nextInt()); } }','public class Broken { public static void main(String[] a) { System.out.println("bad") } }','public class Failed { public static void main(String[] a) { throw new IllegalStateException("fixture runtime"); } }'],
  ['JavaScript',102,'const v=require("node:fs").readFileSync(0,"utf8").trim().split(/\\s+/).map(Number); console.log("Hello");console.log(v[0]+v[1]);','console.log(','throw new Error("fixture runtime");'],
  ['Python',113,'print("Hello")\nprint(int(input())+int(input()))','if True\n print(1)','raise RuntimeError("fixture runtime")'],
  ['Dart',90,"import 'dart:io'; void main(){print('Hello'); print(int.parse(stdin.readLineSync()!)+int.parse(stdin.readLineSync()!));}","void main(){print('bad')}","void main(){throw StateError('fixture runtime');}"]
]){
  await run(`${name}: hello + stdin`,id,valid,'5\n10\n',3,equal('Hello\n15\n'));
  await run(`${name}: syntax failure`,id,syntax,'',3,fails);
  await run(`${name}: runtime failure`,id,runtime,'',3,fails);
}
await run('Java: package and public name',91,'package demo; public class Packaged { public static void main(String[] a) { System.out.println("Package"); } }','',3,equal('Package\n'));
await run('JavaScript: ES module',102,'import fs from "node:fs"; console.log(fs.readFileSync(0,"utf8").trim());','module\n',3,equal('module\n'));
await run('Python: timeout enforced',113,'while True: pass','',1,d=>assert.equal(d.status?.id,5));
await run('Python: whitespace preserved',113,'print("  indented\\n\\n",end="")','',3,equal('  indented\n\n'));
await run('Python: network denied',113,'import socket\ntry:\n s=socket.create_connection(("example.com",443),timeout=1);s.close();print("OPEN")\nexcept OSError:\n print("BLOCKED")','',3,equal('BLOCKED\n'));
await run('Python: no application credentials',113,'import os\nprint(any(k in os.environ for k in ["DB_PASSWORD","JWT_SECRET","ONLINE_COMPILER_API_KEY","CODE_EXECUTION_API_KEY"]))','',3,equal('False\n'));
await run('Python: private workspace write',113,'open("truesight-isolation-fixture.txt","w").write("fixture")\nprint("written")','',3,equal('written\n'));
await run('Python: fresh workspace',113,'import os\nprint(os.path.exists("truesight-isolation-fixture.txt"))','',3,equal('False\n'));
await run('Python: bounded large output',113,'print("x"*70000,end="")','',3,d=>{assert.equal(d.status?.id,3);assert.ok(d.stdout.length>=50000&&d.stdout.length<=65536);});
await mkdir('.tmp/onlinecompiler-verification',{recursive:true});
await writeFile('.tmp/onlinecompiler-verification/runtime.json',JSON.stringify({verifiedAt:new Date().toISOString(),provider:base,results},null,2));
console.log(`PASS: ${results.length} real hosted runtime checks. Architecture and process/memory caps remain provider-attested, not independently audited.`);
