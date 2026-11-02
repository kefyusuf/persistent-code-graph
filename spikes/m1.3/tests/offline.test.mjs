import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectLanguage, spanForNode, fileFactsFromTree, parserCacheIdentity, canonicalizeFacts } from '../src/contract.mjs';
import * as contract from '../src/contract.mjs';

const read = (name) => readFileSync(resolve('fixtures', name), 'utf8');
const node = (type, text, startIndex, fields={}, children=[]) => ({
  type, text, startIndex, endIndex:startIndex+text.length, hasError:false, isMissing:false,
  namedChildren:children, childForFieldName(name){return fields[name]??null;}
});

test('language detection distinguishes TS, TSX, PHP and unsupported files',()=>{
  assert.equal(detectLanguage('foo.ts'), 'typescript');
  assert.equal(detectLanguage('src/Thing.TSX'), 'tsx');
  assert.equal(detectLanguage('worker.php'), 'php');
  assert.equal(detectLanguage('README.md'), null);
});
test('offset contract accounts for UTF-8 astral characters',()=>{
  const source=read('unicode.ts');
  const text='function gecikme() { return label; }';
  const js=source.indexOf(text);
  const n=node('function_declaration', text, js);
  const r=spanForNode(source,n);
  assert.equal(r.startByte, Buffer.from(source,'utf8').indexOf(Buffer.from(text)));
  assert.equal(r.startLine,2);
});
test('contract rejects index/text mismatch instead of silently emitting bad evidence',()=>{
  assert.throws(()=>spanForNode('hello',node('identifier','incorrect',0)),/OFFSET_INCONSISTENCY/);
});
test('two occurrences with identical name receive distinct IDs',()=>{
  const src='function f(){}\nfunction f(){}';
  const first=node('function_declaration','function f(){}',0,{name:node('identifier','f',9)});
  const second=node('function_declaration','function f(){}',15,{name:node('identifier','f',24)});
  const root=node('program',src,0,{},[first,second]);
  const facts=fileFactsFromTree('typescript','sample.ts',src,root,{runtime:'test',grammar:'test'});
  const matches=facts.declarations.filter(x=>x.name==='f');
  assert.equal(matches.length,2);
  assert.notEqual(matches[0].id,matches[1].id);
});
test('raw call creates unresolved occurrence, never fabricated relation',()=>{
  const src='run();';
  const call=node('call_expression','run()',0,{function:node('identifier','run',0)});
  const root=node('program',src,0,{},[call]);
  const facts=fileFactsFromTree('typescript','calls.ts',src,root,{runtime:'test',grammar:'test'});
  assert.ok(facts.references.some(x=>x.role==='call'&&x.spelling==='run'&&x.resolutionStatus==='unresolved'));
  assert.equal(facts.relations.length,0);
});
test('unknown version or grammar hash changes cache identity',()=>{
  const a=parserCacheIdentity('typescript',{runtime:'a',grammar:'b',schemaVersion:1});
  const b=parserCacheIdentity('typescript',{runtime:'a',grammar:'c',schemaVersion:1});
  const c=parserCacheIdentity('php',{runtime:'a',grammar:'b',schemaVersion:1});
  assert.notEqual(a,b);
  assert.notEqual(a,c);
});
test('normalizing in different child orders yields stable sorted output',()=>{
  const src='function f(){}\nfunction g(){}';
  const a=node('function_declaration','function f(){}',0,{name:node('identifier','f',9)});
  const b=node('function_declaration','function g(){}',15,{name:node('identifier','g',24)});
  const x=fileFactsFromTree('typescript','x.ts',src,node('program',src,0,{},[a,b]),{runtime:'a',grammar:'b'});
  const y=fileFactsFromTree('typescript','x.ts',src,node('program',src,0,{},[b,a]),{runtime:'a',grammar:'b'});
  assert.deepEqual(canonicalizeFacts(x),canonicalizeFacts(y));
});
test('syntactic parse errors lead to conservative coverage and diagnostics',()=>{
  const src='function bad( {';
  const bad=node('ERROR',src,0);bad.hasError=true;
  const root=node('program',src,0,{},[bad]);root.hasError=true;
  const f=fileFactsFromTree('typescript','bad.ts',src,root,{runtime:'a',grammar:'b'});
  assert.ok(f.diagnostics.length>=1);
  assert.equal(f.coverage.declarations,'failed');
});
test('PHP namespace import and trait use are not conflated by identical spelling',()=>{
  const source='use Tool; class C { use Tool; }';
  const importNode=node('namespace_use_declaration','use Tool;',0,{},[node('namespace_use_clause','Tool',4)]);
  const traitNode=node('use_declaration','use Tool;',20,{},[node('name','Tool',24)]);
  const clas=node('class_declaration','class C { use Tool; }',10,{name:node('name','C',16)},[traitNode]);
  const root=node('program',source,0,{},[importNode,clas]);
  const f=fileFactsFromTree('php','test.php',source,root,{runtime:'test',grammar:'test'});
  assert.equal(f.references.filter(x=>x.role==='php.trait_use').length,1);
  assert.equal(f.references.filter(x=>x.role==='php.trait_adaptation').length,0);
});
test('TypeScript import alias retains imported and local names without guessing an edge',()=>{
  const source="import { save as persist } from './storage';";
  const importSpec=node('import_specifier','save as persist',9,{name:node('identifier','save',9),alias:node('identifier','persist',17)});
  const imp=node('import_statement',source,0,{source:node('string',"'./storage'",32)},[importSpec]);
  const facts=fileFactsFromTree('typescript','alias.ts',source,node('program',source,0,{},[imp]),{runtime:'test',grammar:'test'});
  assert.ok(facts.references.some(x=>x.role==='import'&&x.spelling==='save'&&x.alias==='persist'&&x.module==='./storage'));
  assert.deepEqual(facts.relations,[]);
});
test('TS overload declaration occurrences remain separate, even with the same name',()=>{
  const source='function f(x:string);\nfunction f(x:number);';
  const a=node('function_signature','function f(x:string);',0,{name:node('identifier','f',9)});
  const b=node('function_signature','function f(x:number);',22,{name:node('identifier','f',31)});
  const facts=fileFactsFromTree('typescript','overload.ts',source,node('program',source,0,{},[a,b]),{runtime:'test',grammar:'test'});
  assert.equal(facts.declarations.filter(x=>x.name==='f').length,2);
});
test('missing syntax token produces a diagnostic even when its span has zero width',()=>{
  const root=node('program','const =;',0);
  const missing=node('identifier','',6);missing.isMissing=true;
  root.namedChildren=[missing];root.hasError=true;
  const facts=fileFactsFromTree('typescript','invalid.ts','const =;',root,{runtime:'test',grammar:'test'});
  assert.ok(facts.diagnostics.length>0);
  assert.equal(facts.coverage.declarations,'failed');
});


test('extractor source stamp invalidates cache identity independently of grammar',()=>{
 const a=parserCacheIdentity('php',{runtime:'1',grammar:'a',schemaVersion:1,extractor:'stamp-a'});
 const b=parserCacheIdentity('php',{runtime:'1',grammar:'a',schemaVersion:1,extractor:'stamp-b'});
 assert.notEqual(a,b);
});

// Reference oracle copied from the parent commit (PR #13), intentionally independent.
function legacySpan(source, node, allowEmpty=false) {
  if(!Number.isSafeInteger(node.startIndex)||!Number.isSafeInteger(node.endIndex)) throw new Error('OFFSET_INCONSISTENCY: missing integer boundaries');
  const bytes=Buffer.from(source,'utf8');
  const needle=Buffer.from(node.text,'utf8');
  const candidates=[
    [node.startIndex,node.endIndex],
    [Buffer.byteLength(source.slice(0,node.startIndex),'utf8'),Buffer.byteLength(source.slice(0,node.endIndex),'utf8')],
  ];
  const matched=candidates.find(([start,end])=>start>=0&&end<=bytes.length&&(allowEmpty?end>=start:end>start)&&bytes.subarray(start,end).equals(needle));
  if(!matched) throw new Error(`OFFSET_INCONSISTENCY: ${node.type} @ ${node.startIndex}..${node.endIndex}`);
  const [startByte,endByte]=matched;
  const lineAt=offset=>1+(bytes.subarray(0,offset).toString('utf8').match(/\n/g)?.length??0);
  return {startByte,endByte,startLine:lineAt(startByte),endLine:lineAt(endByte)};
}

// M1.6.12: same source-range contract, with a single per-file offset index.
test('indexed span reader preserves UTF-8 byte and JS-index coordinates with CRLF and astral text',()=>{
  assert.equal(typeof contract.createIndexedSpanResolver,'function');
  const source='// 🧭\r\nconst text = "あ";\r\nrun();\r\nrun();\n';
  const span=contract.createIndexedSpanResolver(source);
  for(const fragment of ['const text = "あ"','run()','あ']){
    let from=0;
    while(true){
      const start=source.indexOf(fragment,from);
      if(start===-1)break;
      const jsNode=node('token',fragment,start);
      const startByte=Buffer.byteLength(source.slice(0,start),'utf8');
      const byteNode={...jsNode,startIndex:startByte,endIndex:startByte+Buffer.byteLength(fragment,'utf8')};
      for(const candidate of [jsNode,byteNode]){
        const indexed=span(candidate);
        assert.deepEqual(indexed,legacySpan(source,candidate));
        assert.equal(indexed.startByte,startByte);
        assert.equal(indexed.endByte,startByte+Buffer.byteLength(fragment,'utf8'));
        assert.equal(indexed.startLine,source.slice(0,start).split('\n').length);
        assert.equal(indexed.endLine,source.slice(0,start+fragment.length).split('\n').length);
      }
      from=start+fragment.length;
    }
  }
});

test('indexed reader preserves zero-width diagnostic offsets and fails closed on text mismatch',()=>{
  assert.equal(typeof contract.createIndexedSpanResolver,'function');
  const source='// 🧭\r\nlet a = 3;\n';
  const span=contract.createIndexedSpanResolver(source);
  const point=source.indexOf('a =');
  // Empty text cannot disambiguate JS and byte indices: keep the legacy byte-first choice.
  const fromJsIndex=span(node('missing','',point),true);
  assert.deepEqual(fromJsIndex,legacySpan(source,node('missing','',point),true));
  const expectedByte=Buffer.byteLength(source.slice(0,point),'utf8');
  const zeroWidth=span(node('missing','',expectedByte),true);
  assert.deepEqual(zeroWidth,legacySpan(source,node('missing','',expectedByte),true));
  assert.deepEqual(zeroWidth,{startByte:expectedByte,endByte:expectedByte,startLine:2,endLine:2});
  assert.throws(()=>span(node('identifier','missing',point)),/OFFSET_INCONSISTENCY/);
  assert.throws(()=>span({type:'identifier',text:'a',startIndex:NaN,endIndex:6}),/OFFSET_INCONSISTENCY/);
});

test('indexed reader retains chosen location for duplicate text and split astral boundary',()=>{
  assert.equal(typeof contract.createIndexedSpanResolver,'function');
  const source='🧭run()\r\nrun()';
  const span=contract.createIndexedSpanResolver(source);
  const first=node('call','run()',2);
  const second=node('call','run()',9);
  assert.deepEqual(span(first),legacySpan(source,first));
  assert.deepEqual(span(second),legacySpan(source,second));
  assert.notEqual(span(first).startByte,span(second).startByte);
  const half={type:'token',text:'\ufffd',startIndex:1,endIndex:2};
  assert.throws(()=>span(half),/OFFSET_INCONSISTENCY/);
});
