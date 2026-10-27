import {StreamLanguage,foldService,matchBrackets,type StreamParser} from '@codemirror/language';
type State={comment:number;quote:string;raw:boolean;indent:number};
const keywords=new Set('abstract as assert async await base break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory final finally for Function get hide if implements import in interface is late library mixin new of on operator part required rethrow return sealed set show static super switch sync this throw try typedef var void when while with yield'.split(' '));
const parser:StreamParser<State>={
  name:'dart',startState:()=>({comment:0,quote:'',raw:false,indent:0}),
  token(stream,state){
    if(state.comment){while(!stream.eol()){if(stream.match('/*'))state.comment++;else if(stream.match('*/')){if(!--state.comment)break;}else stream.next();}return 'comment';}
    if(state.quote){while(!stream.eol()){if(stream.match(state.quote)){state.quote='';break;}if(!state.raw&&stream.match('\\'))stream.next();else stream.next();}return 'string';}
    if(stream.eatSpace())return null;
    if(stream.match('//')){stream.skipToEnd();return 'comment';}
    if(stream.match('/*')){state.comment=1;return 'comment';}
    const quoted=stream.match(/^(r?)("""|'''|"|')/);
    if(Array.isArray(quoted)){state.raw=Boolean(quoted[1]);state.quote=quoted[2];return 'string';}
    if(stream.match(/^@\w+/))return 'meta';
    if(stream.match(/^\d+(?:\.\d+)?(?:e[+-]?\d+)?/i))return 'number';
    const word=stream.match(/^[A-Za-z_$][\w$]*/);
    if(Array.isArray(word))return keywords.has(word[0])?'keyword':['true','false','null'].includes(word[0])?'atom':/^[A-Z]/.test(word[0])?'typeName':'variableName';
    const ch=stream.next();if(ch==='{')state.indent++;if(ch==='}')state.indent=Math.max(0,state.indent-1);return ch&&'+-*/=!<>?&|%'.includes(ch)?'operator':'punctuation';
  },
  indent:(state,textAfter,context)=>Math.max(0,state.indent-(/^\s*}/.test(textAfter)?1:0))*context.unit,
  languageData:{commentTokens:{line:'//',block:{open:'/*',close:'*/'}},closeBrackets:{brackets:['(','[','{',"'",'"']},indentOnInput:/^\s*}$/},
};
export const dartLanguage=StreamLanguage.define(parser);
export const dartFolding=foldService.of((state,start,end)=>{
  const line=state.doc.sliceString(start,end),offset=line.lastIndexOf('{');if(offset<0)return null;
  const match=matchBrackets(state,start+offset,1,{brackets:'{}',maxScanDistance:100000});
  return match?.matched&&match.end&&match.end.from>end?{from:match.start.to,to:match.end.from}:null;
});
