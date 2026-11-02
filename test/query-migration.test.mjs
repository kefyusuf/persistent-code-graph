import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifiedQuery, verifiedQueryBatch } from '../src/query/query.mjs';
import * as oldQuery from '../spikes/m1.4.2/src/query.mjs';
import * as oldBatch from '../spikes/m1.5.1/src/batch.mjs';
import { refreshFileFacts } from '../src/incremental/refresh.mjs';
import { experimentalExtract, experimentalIdentity } from '../spikes/m1.4.1/src/experimental-adapter.mjs';
import { createFileFactsPipeline } from '../src/core.mjs';

async function sandbox(t) {
  const dir = await mkdtemp(join(tmpdir(), 'pcg-m164-'));
  const checkoutRoot=join(dir,'checkout'), indexRoot=join(dir,'index');
  await mkdir(checkoutRoot);
  execFileSync('git',['init','-q'],{cwd:checkoutRoot});
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const put=(name,source)=>writeFile(join(checkoutRoot,name),source);
  await put('a.ts','interface Box { value: string }\ninterface Box { size: number }');
  await put('b.php','<?php trait T { public function save() {} } class User { use T; }');
  await refreshFileFacts({checkoutRoot,indexRoot,parserIdentity:experimentalIdentity,extract:experimentalExtract});
  const common={checkoutRoot,indexRoot,parserIdentity:experimentalIdentity};
  return {checkoutRoot,indexRoot,common,put};
}

test('canonical single and batch queries are identical to their legacy exports',()=>{
  assert.equal(verifiedQuery,oldQuery.verifiedQuery);
  assert.equal(verifiedQueryBatch,oldQuery.verifiedQueryBatch);
  assert.equal(verifiedQueryBatch,oldBatch.verifiedQueryBatch);
});
test('legacy query and batch files contain only compatibility re-exports',()=>{
  const query=readFileSync(new URL('../spikes/m1.4.2/src/query.mjs',import.meta.url),'utf8').trim();
  const batch=readFileSync(new URL('../spikes/m1.5.1/src/batch.mjs',import.meta.url),'utf8').trim();
  assert.equal(query,"export * from '../../../src/query/query.mjs';");
  assert.equal(batch,"export { verifiedQueryBatch } from '../../../src/query/query.mjs';");
});
test('canonical query owns verification; core imports canonical query; no spike implementation duplicate',()=>{
  const source=readFileSync(new URL('../src/query/query.mjs',import.meta.url),'utf8');
  const core=readFileSync(new URL('../src/core.mjs',import.meta.url),'utf8');
  assert.match(source,/export async function verifiedQuery\(/);
  assert.match(source,/export async function verifiedQueryBatch\(/);
  assert.match(source,/from ['"]\.\.\/storage\/store\.mjs['"]/);
  assert.match(source,/from ['"]\.\.\/incremental\/inventory\.mjs['"]/);
  assert.match(core,/from ['"]\.\/query\/query\.mjs['"]/);
  assert.doesNotMatch(core,/spikes\/m1\.4\.2/);
});
test('verified single and batch queries retain same results and partial-coverage indicator',async t=>{
  const e=await sandbox(t);
  const selectors={operation:'declarations',name:'Box'};
  const one=await verifiedQuery({...e.common,...selectors});
  const many=await verifiedQueryBatch({...e.common,requests:[selectors,{operation:'declarations',name:'save'}]});
  assert.equal(one.state,'verified');assert.equal(many.state,'verified');
  assert.deepEqual(one.results,many.queries[0].results);
  assert.equal(one.results.length,2);assert.equal(one.coverage,'partial');
  assert.equal(many.coverage,'partial');
  assert.equal(one.verification.method,'full-content-hash-double-scan');
});
test('source drift suppresses both single and batch observations, and explicit refresh repairs it',async t=>{
  const e=await sandbox(t);
  await e.put('a.ts','interface NewBox {}');
  const one=await verifiedQuery({...e.common,operation:'declarations',name:'Box'});
  const many=await verifiedQueryBatch({...e.common,requests:[{operation:'declarations',name:'Box'},{operation:'declarations',name:'save'}]});
  assert.equal(one.state,'stale');assert.deepEqual(one.results,[]);
  assert.equal(many.state,'stale');assert.deepEqual(many.queries,[]);
  assert.deepEqual(many.drift.changed,['a.ts']);
  const updated=await refreshFileFacts({...e.common,extract:experimentalExtract});
  assert.equal(updated.counts.parsed,1);
  const result=await verifiedQuery({...e.common,operation:'declarations',name:'NewBox'});
  assert.equal(result.state,'verified');assert.equal(result.results.length,1);
});
test('batch fails closed if source mutates between two verification scans',async t=>{
  const e=await sandbox(t);
  const r=await verifiedQueryBatch({...e.common,requests:[{operation:'declarations',name:'Box'},{operation:'declarations',name:'save'}],testBeforeFinalVerification:()=>e.put('a.ts','interface Changed {}')});
  assert.equal(r.state,'stale');assert.deepEqual(r.queries,[]);
});
test('single and batch byte limits remain bounded and malicious identity override is rejected',async t=>{
  const e=await sandbox(t);
  const single=await verifiedQuery({...e.common,operation:'declarations',maxBytes:240});
  const batch=await verifiedQueryBatch({...e.common,requests:[{operation:'declarations'},{operation:'references'}],maxTotalResultBytes:300});
  assert.ok(Buffer.byteLength(JSON.stringify(single.results),'utf8')<=240);
  assert.ok(batch.queries.reduce((n,q)=>n+Buffer.byteLength(JSON.stringify(q.results),'utf8'),0)<=300);
  assert.equal(single.truncated,true);assert.equal(batch.batchTruncated,true);
  const app=createFileFactsPipeline({checkoutRoot:e.checkoutRoot,indexRoot:e.indexRoot,provider:{provenance:'experimental-temporary',parserIdentity:experimentalIdentity,extract:experimentalExtract}});
  await assert.rejects(app.queryBatch([{operation:'status',parserIdentity:experimentalIdentity}]),{code:'INVALID_BATCH'});
});
