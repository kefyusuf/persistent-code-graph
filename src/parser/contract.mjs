/**
 * M1.3 file-local syntax facts only. This deliberately does not resolve calls,
 * group logical symbols, persist a graph, or claim full language coverage.
 */
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const shortId = (...xs) => sha256(JSON.stringify(xs)).slice(0,24);
const EXTENSIONS = new Map([
  ['.ts','typescript'],['.mts','typescript'],['.cts','typescript'],
  ['.tsx','tsx'],['.php','php'],
]);
export function detectLanguage(file) {return EXTENSIONS.get(extname(file).toLowerCase())??null;}

/**
 * Different Tree-sitter JS bindings can expose input indices in UTF-8 bytes
 * or JS UTF-16 code units. Keep both interpretations and require exact text.
 * Build source offsets once per extraction, never once per emitted occurrence.
 */
export function createIndexedSpanResolver(source) {
  const bytes=Buffer.from(source,'utf8');
  const utf16Bytes=new Uint32Array(source.length+1);
  let offset=0;
  for(let i=0;i<source.length;){
    const code=source.charCodeAt(i);
    // A prefix ending between surrogate halves encodes a replacement character
    // (three bytes), whereas the complete pair encodes as four bytes.
    if(code>=0xd800&&code<=0xdbff&&i+1<source.length){
      const next=source.charCodeAt(i+1);
      if(next>=0xdc00&&next<=0xdfff){
        utf16Bytes[i+1]=offset+3;
        offset+=4;utf16Bytes[i+2]=offset;i+=2;continue;
      }
    }
    offset+=code<=0x7f?1:code<=0x7ff?2:3;
    utf16Bytes[++i]=offset;
  }
  const lineStarts=[0];
  for(let i=0;i<bytes.length;i++)if(bytes[i]===10)lineStarts.push(i+1);
  const jsOffset=index=>utf16Bytes[index<0?Math.max(0,source.length+index):Math.min(index,source.length)];
  const lineAt=byteOffset=>{
    let low=0,high=lineStarts.length;
    while(low<high){const mid=(low+high)>>>1;if(lineStarts[mid]<=byteOffset)low=mid+1;else high=mid;}
    return low; // lineStarts[0] denotes 1-based line one.
  };
  return function indexedSpan(node,allowEmpty=false){
    if(!Number.isSafeInteger(node.startIndex)||!Number.isSafeInteger(node.endIndex))
      throw new Error('OFFSET_INCONSISTENCY: missing integer boundaries');
    const needle=Buffer.from(node.text,'utf8');
    const candidates=[
      [node.startIndex,node.endIndex],
      [jsOffset(node.startIndex),jsOffset(node.endIndex)],
    ];
    const matched=candidates.find(([start,end])=>start>=0&&end<=bytes.length&&(allowEmpty?end>=start:end>start)&&bytes.subarray(start,end).equals(needle));
    if(!matched)throw new Error('OFFSET_INCONSISTENCY: '+node.type+' @ '+node.startIndex+'..'+node.endIndex);
    const [startByte,endByte]=matched;
    return {startByte,endByte,startLine:lineAt(startByte),endLine:lineAt(endByte)};
  };
}

/** Compatibility helper for single-node consumers; file extraction shares one index. */
export function spanForNode(source,node,allowEmpty=false){
  return createIndexedSpanResolver(source)(node,allowEmpty);
}
const DECLARATIONS={
  typescript:{
    interface_declaration:'interface',function_declaration:'function',function_signature:'function',
    class_declaration:'class',method_definition:'method',method_signature:'method',
    type_alias_declaration:'type',
  },
  tsx:{
    interface_declaration:'interface',function_declaration:'function',function_signature:'function',
    class_declaration:'class',method_definition:'method',method_signature:'method',
    type_alias_declaration:'type',
  },
  php:{
    trait_declaration:'trait',class_declaration:'class',method_declaration:'method',
    function_definition:'function',interface_declaration:'interface',enum_declaration:'enum',
  }
};
const PHPCALLS=new Set(['member_call_expression','nullsafe_member_call_expression','scoped_call_expression','function_call_expression']);
const TSCALLS=new Set(['call_expression']);
const getField = (n,field)=>n.childForFieldName?.(field)??null;
const txt = n=>n?.text??null;
const children=n=>n?.namedChildren??[];
function nodeName(n){
 const given=getField(n,'name');
 return given?txt(given):null;
}
function unquote(s){return s?.replace(/^['"`]/,'').replace(/['"`]$/,'')??null;}
function callSpelling(func){
 if(!func)return null;
 if(['member_expression','optional_chain','subscript_expression'].includes(func.type)){
  return txt(getField(func,'property'))??txt(getField(func,'name'))??null;
 }
 return txt(func);
}
function isError(node){return node.type==='ERROR'||node.isError===true||node.isMissing===true;}

export function parserCacheIdentity(language, descriptor){
 if(!language||!descriptor.runtime||!descriptor.grammar||!Number.isInteger(descriptor.schemaVersion)) throw new Error('INVALID_CACHE_IDENTITY');
 return sha256(JSON.stringify([language,descriptor.runtime,descriptor.grammar,descriptor.schemaVersion,descriptor.extractor??null]));
}
export function canonicalizeFacts(facts){
 return {
  ...facts,
  declarations:[...facts.declarations].sort((a,b)=>a.range.startByte-b.range.startByte||a.id.localeCompare(b.id)),
  references:[...facts.references].sort((a,b)=>a.range.startByte-b.range.startByte||a.id.localeCompare(b.id)),
  diagnostics:[...facts.diagnostics].sort((a,b)=>a.range.startByte-b.range.startByte||a.code.localeCompare(b.code)),
  relations:[...facts.relations],
 };
}
export function fileFactsFromTree(language,file,source,root,parserIdentity){
 if(!DECLARATIONS[language]) throw new Error('UNSUPPORTED_LANGUAGE:'+language);
 const declarations=[];const references=[];const diagnostics=[];
 const span=createIndexedSpanResolver(source);
 const addDecl=(n,kind,name)=>{if(!name)return;declarations.push({kind,name,languageSyntaxKind:n.type,range:span(n)});};
 const addRef=(n,role,spelling,extra={})=>{if(!spelling)return;references.push({role,spelling,...extra,range:span(n)});};
 let errorCount=0;
 function walk(n,parents=[]){
  if(isError(n)) {
    errorCount++;
    if(diagnostics.length<30) diagnostics.push({code:'SYNTAX_ERROR',nodeType:n.type,range:span(n,true)});
  }
  const kind=DECLARATIONS[language][n.type];
  if(kind)addDecl(n,kind,nodeName(n));
  if(language==='typescript'||language==='tsx'){
    if(n.type==='import_specifier'){
      const host=parents.findLast(p=>p.type==='import_statement');
      const sourceNode=host&&getField(host,'source');
      addRef(n,'import',txt(getField(n,'name')),{
        alias:txt(getField(n,'alias'))??null,module:unquote(txt(sourceNode))
      });
    }
    if(TSCALLS.has(n.type))addRef(n,'call',callSpelling(getField(n,'function')),{resolutionStatus:'unresolved'});
  }
  if(language==='php'){
    if(n.type==='use_declaration'){
      // `use_declaration` occurs in PHP class/trait bodies; namespace uses
      // are `namespace_use_declaration` and must never enter this branch.
      const targets=[];
      for(const child of children(n)){
        if(['name','qualified_name','relative_name'].includes(child.type))targets.push(child);
        if(child.type==='use_list')for(const nested of children(child)) if(['name','qualified_name','relative_name'].includes(nested.type))targets.push(nested);
      }
      for(const target of targets)addRef(target,'php.trait_use',txt(target),{resolutionStatus:'unresolved'});
    }
    if(n.type==='use_as_clause'){
      const names=children(n).filter(x=>x.type==='name');
      const alias=names.at(-1);
      if(alias)addRef(alias,'php.trait_adaptation',txt(alias),{resolutionStatus:'unresolved'});
    }
    if(PHPCALLS.has(n.type))addRef(n,'call',txt(getField(n,'name'))??txt(getField(n,'function')),{resolutionStatus:'unresolved'});
  }
  for(const child of children(n))walk(child,[...parents,n]);
 }
 walk(root);
 if(root.hasError && errorCount===0){diagnostics.push({code:'SYNTAX_ERROR',nodeType:root.type,range:span(root)});}
 const contentHash=sha256(Buffer.from(source,'utf8'));
 const idRecord=(kind,r)=>({...r,id:kind+':'+shortId(file,contentHash,r.range.startByte,r.range.endByte,r.kind??r.role,r.name??r.spelling,r.languageSyntaxKind??null)});
 return canonicalizeFacts({
  file,language,contentHash,
  parser:{...parserIdentity,kind:parserIdentity.kind??'syntax-fixture'},
  declarations:declarations.map(x=>idRecord('d',x)),
  references:references.map(x=>idRecord('r',x)),
  relations:[],
  diagnostics,
  coverage:{declarations:diagnostics.length?'failed':'partial',references:diagnostics.length?'failed':'partial',calls:'partial'},
 });
}
