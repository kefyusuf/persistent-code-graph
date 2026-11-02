import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {extract} from '../src/extract.mjs';
const read = f => readFileSync(resolve('fixtures',f),'utf8');

function validateRanges(facts, source) {
  const bytes = Buffer.from(source, 'utf8');
  for(const record of [...facts.declarations, ...facts.references]) {
    assert.ok(record.range.startByte >= 0);
    assert.ok(record.range.endByte <= bytes.length);
    assert.ok(record.range.endByte > record.range.startByte);
    assert.ok(record.range.startLine >= 1);
    assert.ok(record.range.endLine >= record.range.startLine);
  }
}

test('TS duplicate interfaces remain separate declarations', () => {
  const source=read('merging.ts');
  const facts=extract('typescript','merging.ts',source);
  const boxes=facts.declarations.filter(x=>x.kind==='interface' && x.name==='Box');
  assert.equal(boxes.length,2);
  assert.notEqual(boxes[0].id,boxes[1].id);
  assert.notEqual(boxes[0].range.startByte,boxes[1].range.startByte);
  validateRanges(facts,source);
});

test('TS import alias + call reference retained without guessed calls edge', () => {
  const source=read('merging.ts');
  const facts=extract('typescript','merging.ts',source);
  const alias=facts.references.find(x=>x.role==='import' && x.alias==='persist');
  assert.equal(alias.spelling,'save');
  assert.equal(alias.module,'./storage');
  assert.ok(facts.references.find(x=>x.role==='call'&&x.spelling==='persist'));
  assert.equal(facts.relations.length,0);
});

test('PHP trait and method are syntax facts and trait-use is not implements', () => {
  const source=read('trait.php');
  const facts=extract('php','trait.php',source);
  assert.ok(facts.declarations.find(x=>x.kind==='trait' && x.name==='TracksEvents'));
  assert.ok(facts.declarations.find(x=>x.kind==='class'&&x.name==='Order'));
  assert.ok(facts.declarations.find(x=>x.kind==='method'&&x.name==='save'));
  assert.ok(facts.references.find(x=>x.role==='php.trait_use'&&x.spelling==='TracksEvents'));
  assert.ok(facts.references.find(x=>x.role==='php.trait_adaptation' && x.spelling==='notify'));
  assert.equal(facts.relations.length,0);
  validateRanges(facts,source);
});

test('UTF-8 byte offsets survive astral Unicode characters', () => {
  const source=read('unicode.ts');
  const facts=extract('typescript','unicode.ts',source);
  const decl=facts.declarations.find(x=>x.name==='gecikme');
  const start=Buffer.from(source,'utf8').indexOf(Buffer.from('function gecikme'));
  assert.equal(decl.range.startByte,start);
  assert.equal(decl.range.startLine,2);
  validateRanges(facts,source);
});

test('syntax error is observable, not a clean graph', () => {
  const facts=extract('typescript','broken.ts',read('broken.ts'));
  assert.ok(facts.diagnostics.length>0);
  assert.notEqual(facts.coverage.declarations,'supported');
});

test('re-running extraction returns deterministic output', () => {
  const source=read('merging.ts');
  assert.deepEqual(extract('typescript','merging.ts',source),extract('typescript','merging.ts',source));
});

test('PHP namespace import alias is not incorrectly labelled trait adaptation', () => {
  const f=extract('php','alias.php',read('alias.php'));
  assert.ok(!f.references.some(x=>x.role==='php.trait_adaptation'));
});

test('PHP unresolved member call is retained, without fabricated resolved edge', () => {
  const f=extract('php','alias.php',read('alias.php'));
  assert.ok(f.references.some(x=>x.role==='call' && x.spelling==='missing' && x.resolutionStatus==='unresolved'));
  assert.deepEqual(f.relations,[]);
});

test('PHP syntax errors produce explicit diagnostics', () => {
  const f=extract('php','broken.php',read('broken.php'));
  assert.ok(f.diagnostics.some(x=>x.code==='PHP_PARSE_ERROR'));
  assert.equal(f.coverage.declarations,'failed');
});

test('same-name nested functions are not collapsed by name', () => {
  const f=extract('typescript','nested.ts',read('nested.ts'));
  const twins=f.declarations.filter(x=>x.name==='same');
  assert.equal(twins.length,2);
  assert.notEqual(twins[0].id,twins[1].id);
});


test('limited extraction never reports complete structural coverage', () => {
  for (const [language,name] of [['typescript','merging.ts'],['php','trait.php']]) {
    const f=extract(language,name,read(name));
    assert.equal(f.coverage.declarations,'partial');
    assert.equal(f.coverage.references,'partial');
  }
});
