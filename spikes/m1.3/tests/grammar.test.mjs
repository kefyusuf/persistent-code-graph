import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractWithRealGrammar } from '../src/runtime.mjs';
const read = (name) => readFileSync(resolve('fixtures',name),'utf8');
const extract = async (l,n) => extractWithRealGrammar(l,n,read(n));

test('Tree-sitter runtime + both grammars load offline from installed packages',async()=>{
  for(const [l,n] of [['typescript','merging.ts'],['php','trait.php'],['tsx','component.tsx']]){
    const facts=await extract(l,n);
    assert.equal(facts.parser.kind,'tree-sitter-wasm');
    assert.ok(facts.parser.grammarSha256);
  }
});
test('TS two interfaces remain separate AST declaration nodes',async()=>{
  const f=await extract('typescript','merging.ts');
  const matches=f.declarations.filter(x=>x.kind==='interface'&&x.name==='Box');
  assert.equal(matches.length,2);
  assert.notEqual(matches[0].id,matches[1].id);
  assert.equal(f.coverage.declarations,'partial');
});
test('TS named import aliases + calls remain raw and unresolved',async()=>{
  const f=await extract('typescript','merging.ts');
  assert.ok(f.references.some(x=>x.role==='import' && x.spelling==='save' && x.alias==='persist' && x.module==='./storage'));
  assert.ok(f.references.some(x=>x.role==='call'&&x.spelling==='persist'));
  assert.deepEqual(f.relations,[]);
});
test('PHP trait class method and adaptation are separate syntax facts',async()=>{
  const f=await extract('php','trait.php');
  assert.ok(f.declarations.some(x=>x.kind==='trait'&&x.name==='TracksEvents'));
  assert.ok(f.declarations.some(x=>x.kind==='class'&&x.name==='Order'));
  assert.ok(f.declarations.some(x=>x.kind==='method'&&x.name==='save'));
  assert.ok(f.references.some(x=>x.role==='php.trait_use'&&x.spelling==='TracksEvents'));
  assert.ok(f.references.some(x=>x.role==='php.trait_adaptation'&&x.spelling==='notify'));
  assert.deepEqual(f.relations,[]);
});
test('PHP namespace import alias cannot be mistaken for trait adaptation',async()=>{
  const f=await extract('php','alias.php');
  assert.equal(f.references.filter(x=>x.role==='php.trait_adaptation').length,0);
});
test('PHP unknown member calls are retained without guessed target edges',async()=>{
  const f=await extract('php','alias.php');
  assert.ok(f.references.some(x=>x.role==='call'&&x.spelling==='missing'&&x.resolutionStatus==='unresolved'));
  assert.deepEqual(f.relations,[]);
});
test('TS astral Unicode prefix preserves exact UTF8 bytes and line number',async()=>{
  const s=read('unicode.ts');const f=await extract('typescript','unicode.ts');
  const d=f.declarations.find(x=>x.name==='gecikme');
  assert.ok(d);
  assert.equal(d.range.startByte,Buffer.from(s,'utf8').indexOf(Buffer.from('function gecikme')));
  assert.equal(d.range.startLine,2);
});
test('malformed TS and PHP produce diagnostics, never successful coverage',async()=>{
  for(const [l,n] of [['typescript','broken.ts'],['php','broken.php']]){
    const f=await extract(l,n);
    assert.ok(f.diagnostics.length>0);
    assert.equal(f.coverage.declarations,'failed');
  }
});
test('same-named nested TS declarations remain distinct',async()=>{
  const f=await extract('typescript','nested.ts');
  const matches=f.declarations.filter(x=>x.name==='same');
  assert.equal(matches.length,2);
  assert.notEqual(matches[0].id,matches[1].id);
});
test('TS overload signatures + implementation remain distinct occurrences',async()=>{
  const f=await extract('typescript','overloads.ts');
  assert.equal(f.declarations.filter(x=>x.name==='fetchOne').length,3);
});
test('real TSX grammar parses JSX-containing source',async()=>{
  const f=await extract('tsx','component.tsx');
  assert.ok(f.declarations.some(x=>x.name==='Badge'));
  assert.equal(f.diagnostics.length,0);
});
test('real parser deterministic across repeated identical inputs',async()=>{
  const a=await extract('typescript','merging.ts');
  const b=await extract('typescript','merging.ts');
  assert.deepEqual(a,b);
});
