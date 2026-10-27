import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
try{
  const {CodeWorkspace}=await vite.ssrLoadModule('/src/components/code/CodeWorkspace.tsx');
  const {CodeActivityOptions}=await vite.ssrLoadModule('/src/components/code/CodeActivityOptions.tsx');
  const {defaultCodeSettings,parseCodeBackup}=await vite.ssrLoadModule('/src/services/codeWorkspaceService.ts');
  for(const raw of [null,'bad JSON','{}','{"source":true}','{"source":"a","stdin":"","expected":"","revision":-1,"baseVersion":0}'])assert.equal(parseCodeBackup(raw),null);
  const saved={source:'exact source\n',stdin:'input\n',expected:'output\n',revision:2,baseVersion:1};assert.deepEqual(parseCodeBackup(JSON.stringify(saved)),saved);
  const {dartLanguage,dartFolding}=await vite.ssrLoadModule('/src/components/code/dartLanguage.ts');
  const {EditorState}=await import('@codemirror/state');
  const {foldable,ensureSyntaxTree}=await import('@codemirror/language');
  const source="void main() {\n  print('Hello');\n}\n";
  const state=EditorState.create({doc:source,extensions:[dartLanguage,dartFolding]});ensureSyntaxTree(state,state.doc.length,1000);
  const fold=foldable(state,0,state.doc.line(1).to);assert.ok(fold,'Dart braces must support code folding.');assert.equal(state.doc.sliceString(fold.from,fold.to),"\n  print('Hello');\n");
  for(const language of ['java','javascript','python','dart']){
    const html=renderToStaticMarkup(React.createElement(CodeWorkspace,{activityId:'1',userId:'2',value:source,onChange(){},language,darkMode:false,locked:false,online:true}));
    for(const label of ['Run Code','Run Tests','Save Draft','Problems (0)','Test Results','Input','Output','History','Student source code editor'])assert.ok(html.includes(label),`${language}: ${label}`);
    assert.ok(/disabled=""[^>]*>Run Code/.test(html),'Unavailable execution is disabled, not simulated.');
    assert.doesNotMatch(html,/15 tests passed|Execution completed successfully|console output: Hello/);
  }
  const settings=renderToStaticMarkup(React.createElement(CodeActivityOptions,{value:{...defaultCodeSettings,testCases:[{name:'Visible sample',stdin:'5\n10\n',expectedOutput:'15\n',hidden:false}]},onChange(){},executionReady:false}));
  for(const label of ['Sample input','Sample output','Output comparison','Hidden teacher test','Add test case','partial credit','teacher-approved rubric score'])assert.ok(settings.includes(label));
  assert.match(settings,/disabled=""/);assert.match(settings,/dedicated sandbox/);
  const managed=renderToStaticMarkup(React.createElement(CodeActivityOptions,{value:defaultCodeSettings,onChange(){},executionReady:true,policy:{provider:'onlinecompiler',timeKind:'wall',fixedMemoryKb:524288,processes:16,message:'Fixed provider resource limits.'}}));
  assert.ok(managed.includes('Wall-time limit'));assert.ok(managed.includes('512 MB (fixed)'));assert.ok(managed.includes('readOnly=""'));assert.ok(!managed.includes('Requested memory limit'));assert.ok(managed.includes('Fixed provider resource limits.'));
  console.log('PASS: all four CodeMirror workspaces, explicit Run/Tests/Draft actions, disabled execution, Problems and output panels, real Dart tokenization/folding, teacher samples/hidden test controls and grading authority. Browser interaction remains a separate manual check.');
}finally{await vite.close();}
