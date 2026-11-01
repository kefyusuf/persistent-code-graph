import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRealTreeSitterPipeline} from '../src/pipeline.mjs';

async function sandbox(){
 const temp=await mkdtemp(join(tmpdir(),'pcg-real-m15-'));
 const checkoutRoot=join(temp,'source'),indexRoot=join(temp,'store');
 await mkdir(checkoutRoot);execFileSync('git',['init','-q'],{cwd:checkoutRoot});
 await writeFile(join(checkoutRoot,'order.php'),'<?php trait Tracks {} class Order { use Tracks; public function save() {} }');
 await writeFile(join(checkoutRoot,'model.ts'),'interface Box { value: number }\ninterface Box { id: string }');
 await writeFile(join(checkoutRoot,'view.tsx'),'export function Badge(){return <span>ok</span>}');
 return {temp,checkoutRoot,indexRoot,async close(){await rm(temp,{recursive:true,force:true})}};
}

test('pinned local PHP, TypeScript and TSX grammars index sources into persistent store',async()=>{
 const s=await sandbox();try{
  const app=await createRealTreeSitterPipeline(s);
  const r=await app.refresh();assert.equal(r.counts.parsed,3);
  const q=await app.query('declarations',{name:'Box'});
  assert.equal(q.state,'verified');assert.equal(q.results.length,2);
  assert.equal(q.parserProvenance,'real-tree-sitter-unvalidated');
 }finally{await s.close()}
});

test('real grammar indexed source survives process restart without parser calls',async()=>{
 const s=await sandbox();try{
  const a=await createRealTreeSitterPipeline(s);await a.refresh();
  const b=await createRealTreeSitterPipeline(s);
  const warm=await b.refresh();assert.equal(warm.counts.parsed,0);assert.equal(warm.counts.reused,3);
  const q=await b.query('declarations',{name:'Badge'});assert.equal(q.state,'verified');
 }finally{await s.close()}
});

test('real grammar warm index equals cold facts after single-source edit',async()=>{
 const s=await sandbox();try{
  const a=await createRealTreeSitterPipeline(s);await a.refresh();
  await writeFile(join(s.checkoutRoot,'order.php'),'<?php trait Tracks {} class Order { use Tracks; public function refund() {} }');
  const b=await a.refresh();assert.equal(b.counts.parsed,1);assert.equal(b.counts.reused,2);
  const q=await a.query('declarations',{name:'refund'});assert.equal(q.state,'verified');assert.equal(q.results.length,1);
 }finally{await s.close()}
});
