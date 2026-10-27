import assert from 'node:assert/strict';
const {diagnoseCode}=await import(process.env.CODE_DIAGNOSTICS_MODULE??'../dist/services/CodeDiagnostics.js');
const cases=[
 ['javascript',"import { readFileSync } from 'node:fs'; console.log(readFileSync(0,'utf8'));",false],['javascript','return;',false],
 ['javascript','console.log("Hello");',false],['javascript','console.log("Hello"',true],['javascript','const = 1;',true],['javascript','throw new Error("This must never run during parsing");',false],
 ['python','name=input("Name: "); print(name)',false],['python','if True\n    print("Adult")',true],['python','def f():\nprint(1)',true],['python','raise RuntimeError("This must never execute")',false],
 ['java','public class Greetings { public static void main(String[] args) { System.out.println("Hello"); } }',false],
 ['java','package school; public class Greeting { public static void main(String[] args) { System.out.println("Hello"); } }',false],
 ['java','public class Hello { public static void main(String[] args) { System.out.println("Hello") } }',true],['java','public class {',true],
 ['java','public class Example { int count = "wrong"; }',true],
 ['dart',"import 'dart:io'; void main() { print(stdin.readLineSync()); }",false],['dart',"void main() { print('Hello') }",true],['dart',"void main() { int value='wrong'; print(value); }",true],
 ['dart',"void main() { throw StateError('This must never execute'); }",false],
];
let count=0;
for(const [language,source,errors]of cases){const result=await diagnoseCode(language,source);assert.equal(result.available,true);assert.equal(result.diagnostics.some(d=>d.severity==='error'),errors,`${language}: ${JSON.stringify(result)}`);for(const d of result.diagnostics){assert.ok(d.line>=1);assert.ok(d.column>=1);assert.ok(d.message);}count++;}
const fixed=await diagnoseCode('python','if True:\n    print("Adult")');assert.equal(fixed.diagnostics.length,0);
const restricted=await diagnoseCode('dart',"import '../../../backend/.env'; void main() {} ");assert.equal(restricted.checker,'Dart SDK parser');assert.ok(restricted.notice);assert.equal(restricted.diagnostics.length,0,'Do not resolve paths outside the single-file workspace.');
await assert.rejects(diagnoseCode('python','x'.repeat(100001)),e=>e.statusCode===413);
const cancelled=new AbortController();cancelled.abort();await assert.rejects(diagnoseCode('python','print(1)',cancelled.signal),e=>e.statusCode===499);
const unicode="print('😀') )";assert.equal((await diagnoseCode('python',unicode)).diagnostics[0].column,unicode.lastIndexOf(')')+1);
const tabs=await diagnoseCode('java','public class Tabs {\r\tint n = "bad";\r}');assert.equal(tabs.diagnostics[0].line,2);assert.equal(tabs.diagnostics[0].column,10);
console.log(`PASS: ${count+6} real language-checker cases across Node.js, Python AST, javac and Dart SDK/parser/analyzer; corrected errors clear, alternate Java public names/packages and UTF-16/tab positions work, cancelled checks stop, and runtime statements are never executed.`);
