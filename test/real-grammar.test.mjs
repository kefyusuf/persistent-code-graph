import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openCodeGraph } from '../src/index.mjs';

test('M1.6 public API indexes real PHP, TypeScript and TSX grammars and reopens the same snapshot',async t=>{
  const temp=await mkdtemp(join(tmpdir(),'pcg-m16-real-'));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const checkoutRoot=join(temp,'repo'),indexRoot=join(temp,'store');
  await mkdir(checkoutRoot);
  execFileSync('git',['init','-q'],{cwd:checkoutRoot});
  await writeFile(join(checkoutRoot,'orders.php'),'<?php trait Saves {} class Order { use Saves; public function pay() {} }');
  await writeFile(join(checkoutRoot,'type.ts'),'interface Box { value: number }\ninterface Box { size: number }');
  await writeFile(join(checkoutRoot,'ui.tsx'),'export function Badge(){return <span>OK</span>}');
  const app=await openCodeGraph({checkoutRoot,indexRoot});
  assert.equal((await app.refresh()).counts.parsed,3);
  assert.equal((await app.query('declarations',{name:'Box'})).results.length,2);
  const reopened=await openCodeGraph({checkoutRoot,indexRoot});
  const warm=await reopened.refresh();
  assert.equal(warm.counts.parsed,0);
  assert.equal(warm.counts.reused,3);
  const q=await reopened.query('declarations',{name:'Badge'});
  assert.equal(q.state,'verified');
  assert.equal(q.results.length,1);
});


test('isolated core with root dependencies parses PHP/TypeScript without any spikes directory', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'pcg-m165-standalone-'));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  await cp(new URL('../src/',import.meta.url),join(temp,'src'),{recursive:true});
  await cp(new URL('../node_modules/',import.meta.url),join(temp,'node_modules'),{recursive:true});
  await writeFile(join(temp,'package.json'),JSON.stringify({type:'module',dependencies:{'web-tree-sitter':'0.27.1','tree-sitter-wasm':'2.0.4'}},null,2));
  const {existsSync}=await import('node:fs');
  const {pathToFileURL}=await import('node:url');
  assert.equal(existsSync(join(temp,'spikes')),false);
  const {openCodeGraph:openIsolated}=await import(pathToFileURL(join(temp,'src/index.mjs')).href);
  const checkoutRoot=join(temp,'checkout'),indexRoot=join(temp,'store');
  await mkdir(checkoutRoot);
  execFileSync('git',['init','-q'],{cwd:checkoutRoot});
  await writeFile(join(checkoutRoot,'catalog.php'),'<?php class Product { public function load() {} }');
  await writeFile(join(checkoutRoot,'catalog.ts'),'interface Product { name: string }');
  const app=await openIsolated({checkoutRoot,indexRoot});
  const first=await app.refresh();
  assert.equal(first.counts.parsed,2);
  const result=await app.query('declarations',{name:'Product'});
  assert.equal(result.state,'verified');
  assert.equal(result.results.length,2);
  const warm=await app.refresh();
  assert.equal(warm.counts.parsed,0);
  assert.equal(warm.counts.reused,2);
});

test('real grammar pipeline refreshes when a new supported language appears after opening',async t=>{
  const temp=await mkdtemp(join(tmpdir(),'pcg-new-language-'));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const checkoutRoot=join(temp,'repo'),indexRoot=join(temp,'store');
  await mkdir(checkoutRoot);
  execFileSync('git',['init','-q'],{cwd:checkoutRoot});
  await writeFile(join(checkoutRoot,'initial.php'),'<?php class Initial {}');
  const graph=await openCodeGraph({checkoutRoot,indexRoot});
  assert.equal((await graph.refresh()).counts.parsed,1);
  await writeFile(join(checkoutRoot,'new.ts'),'interface NewType { name: string }');
  await writeFile(join(checkoutRoot,'new.tsx'),'export function NewBadge(){return <span>Hi</span>}');
  const incremental=await graph.refresh();
  assert.equal(incremental.counts.parsed,2);
  assert.equal(incremental.counts.reused,1);
  const q=await graph.query('declarations',{name:'NewType'});
  assert.equal(q.state,'verified');
  assert.equal(q.results.length,1);
  assert.equal((await graph.refresh()).counts.parsed,0);
});
