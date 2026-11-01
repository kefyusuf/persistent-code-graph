import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CodeGraphStore } from '../../m1.4/src/store.mjs';
import { refreshFileFacts } from '../../m1.4.1/src/refresh.mjs';
import { experimentalExtract, experimentalIdentity } from '../../m1.4.1/src/experimental-adapter.mjs';
import { verifiedQuery } from '../../m1.4.2/src/query.mjs';
import { verifiedQueryBatch } from '../src/batch.mjs';
import { createFileFactsPipeline } from '../../m1.5/src/pipeline.mjs';

const sha = s=>createHash('sha256').update(s).digest('hex');
const git = (root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
async function fixture(t, create=true){
 const tmp=await mkdtemp(join(tmpdir(),'pcg-batch-'));
 const root=join(tmp,'repo'), indexRoot=join(tmp,'index');
 await mkdir(root); git(root,'init','-q');
 t.after(async()=>rm(tmp,{recursive:true,force:true}));
 const put=(name,src)=>writeFile(join(root,name),src);
 const refresh=()=>refreshFileFacts({checkoutRoot:root,indexRoot,parserIdentity:experimentalIdentity,extract:experimentalExtract});
 if(create){
  await put('a.ts','interface Box {value: string}\ninterface Box {size: number}\nfunction ship() { return persist(1); }\nimport { save as persist } from "./service";');
  await put('b.php','<?php trait T { public function save() {} } class User { use T; }');
  await refresh();
 }
 const read=async operation=>verifiedQuery({checkoutRoot:root,indexRoot,parserIdentity:experimentalIdentity,operation});
 const batch=(requests,opts={})=>verifiedQueryBatch({checkoutRoot:root,indexRoot,parserIdentity:experimentalIdentity,requests,...opts});
 return {tmp,root,indexRoot,put,refresh,read,batch};
}

test('missing snapshot answers no facts for any request',async t=>{
 const e=await fixture(t,false);
 const r=await e.batch([{operation:'declarations'},{operation:'references'}]);
 assert.equal(r.state,'missing');assert.deepEqual(r.queries,[]);assert.deepEqual(r.results,[]);
});
test('batch matches individual verified query results and order',async t=>{
 const e=await fixture(t);
 const requests=[{operation:'declarations',name:'Box'},{operation:'declarations',name:'save'},{operation:'references',role:'call'},{operation:'outline',file:'b.php'}];
 const r=await e.batch(requests);
 assert.equal(r.state,'verified');assert.equal(r.queries.length,requests.length);
 assert.equal(r.verification.method,'full-content-hash-double-scan');
 for(let i=0;i<requests.length;i++){
  const q=await verifiedQuery({checkoutRoot:e.root,indexRoot:e.indexRoot,parserIdentity:experimentalIdentity,...requests[i]});
  assert.deepEqual(r.queries[i].results,q.results);assert.equal(r.queries[i].truncated,q.truncated);
 }
 assert.equal(r.coverage,'partial');
});
test('a change before reading withholds every result, not just changed file',async t=>{
 const e=await fixture(t);await e.put('a.ts','interface Updated {}');
 const r=await e.batch([{operation:'declarations',name:'Box'},{operation:'declarations',name:'save'}]);
 assert.equal(r.state,'stale');assert.deepEqual(r.queries,[]);assert.deepEqual(r.drift.changed,['a.ts']);
});
test('mutation during batch suppresses all draft results',async t=>{
 const e=await fixture(t);
 const r=await e.batch([{operation:'declarations',name:'Box'},{operation:'declarations',name:'save'}],{testBeforeFinalVerification:()=>e.put('a.ts','interface Modified {}')});
 assert.equal(r.state,'stale');assert.deepEqual(r.queries,[]);
});
test('index head changed during query fails closed',async t=>{
 const e=await fixture(t);
 const r=await e.batch([{operation:'declarations'}],{testBeforeFinalVerification:async()=>{await e.put('c.php','<?php function extra() {}');await e.refresh();}});
 assert.equal(r.state,'stale');assert.equal(r.reasonCode,'INDEX_HEAD_CHANGED');assert.deepEqual(r.queries,[]);
});
test('parser drift is never silently accepted by batch',async t=>{
 const e=await fixture(t);
 const r=await e.batch([{operation:'status'}],{parserIdentity:()=>sha('new-adapter')});
 assert.equal(r.state,'stale');assert.equal(r.drift.parserChanged.length,2);
});
test('invalid operation, empty set, oversize batch and illegal selector rejected',async t=>{
 const e=await fixture(t);
 await assert.rejects(e.batch([]),{code:'INVALID_BATCH'});
 await assert.rejects(e.batch(Array.from({length:9},()=>({operation:'status'}))),{code:'INVALID_BATCH'});
 await assert.rejects(e.batch([{operation:'execute'}]),{code:'INVALID_QUERY'});
 await assert.rejects(e.batch([{operation:'declarations',limit:1000}]),{code:'INVALID_QUERY'});
 await assert.rejects(e.batch([{operation:'declarations',parserIdentity:()=>sha('fake')}]),{code:'INVALID_BATCH'});
 await assert.rejects(e.batch([{operation:'status',checkoutRoot:'/tmp'}]),{code:'INVALID_BATCH'});
});
test('total byte budget truncates results and preserves each request order',async t=>{
 const e=await fixture(t);
 const r=await e.batch([{operation:'declarations'},{operation:'references'}],{maxTotalResultBytes:280});
 assert.equal(r.state,'verified');assert.equal(r.queries.length,2);
 const total=r.queries.reduce((n,x)=>n+Buffer.byteLength(JSON.stringify(x.results),'utf8'),0);
 assert.ok(total<=280,`result bytes ${total}`);
 assert.equal(r.batchTruncated,true);
});
test('same request, same snapshot, same deterministic results',async t=>{
 const e=await fixture(t);const req=[{operation:'declarations'},{operation:'references',role:'import'}];
 const a=await e.batch(req), b=await e.batch(req);assert.deepEqual(a,b);
});
test('batch reads are read-only and never call extractor',async t=>{
 const e=await fixture(t);
 const store=new CodeGraphStore({indexRoot:e.indexRoot,checkoutRoot:e.root});
 const original=await stat(store.headPath);
 const a=await e.batch([{operation:'status'},{operation:'declarations'}]);
 const after=await stat(store.headPath);assert.equal(a.state,'verified');assert.equal(after.mtimeMs,original.mtimeMs);
});
test('per-request limit and maxBytes continue to apply',async t=>{
 const e=await fixture(t);
 const r=await e.batch([{operation:'declarations',limit:1,maxBytes:240}],{maxTotalResultBytes:600});
 assert.equal(r.state,'verified');assert.ok(r.queries[0].results.length<=1);
 assert.ok(Buffer.byteLength(JSON.stringify(r.queries[0].results))<=240);
 assert.equal(r.queries[0].truncated,true);
});
test('invalid encoding produces unknown, not a verified empty answer',async t=>{
 const e=await fixture(t);await writeFile(join(e.root,'a.ts'),Buffer.from([255,254]));
 const r=await e.batch([{operation:'declarations'}]);assert.equal(r.state,'unknown');assert.deepEqual(r.queries,[]);
});

test('M1.5 pipeline exposes batch with provenance and blocks caller identity override',async t=>{
 const e=await fixture(t);
 const app=createFileFactsPipeline({checkoutRoot:e.root,indexRoot:e.indexRoot,provider:{
  provenance:'experimental-temporary',parserIdentity:experimentalIdentity,extract:experimentalExtract
 }});
 const r=await app.queryBatch([{operation:'declarations',name:'Box'},{operation:'references',role:'call'}]);
 assert.equal(r.state,'verified');assert.equal(r.parserProvenance,'experimental-temporary');
 assert.equal(r.semanticGraph,false);assert.equal(r.queries.length,2);
 await assert.rejects(app.queryBatch([{operation:'status'}],{parserIdentity:()=>sha('different')}),{code:'INVALID_PIPELINE'});
});
test('M1.5 pipeline batch fails closed after edit until explicit refresh',async t=>{
 const e=await fixture(t);
 const app=createFileFactsPipeline({checkoutRoot:e.root,indexRoot:e.indexRoot,provider:{
  provenance:'experimental-temporary',parserIdentity:experimentalIdentity,extract:experimentalExtract
 }});
 await e.put('b.php','<?php class Changed {}');
 const r=await app.queryBatch([{operation:'declarations',name:'Box'},{operation:'declarations',name:'save'}]);
 assert.equal(r.state,'stale');assert.deepEqual(r.queries,[]);
 const updated=await app.refresh();assert.equal(updated.counts.parsed,1);
 const fresh=await app.queryBatch([{operation:'declarations',name:'Box'},{operation:'declarations',name:'Changed'}]);
 assert.equal(fresh.state,'verified');assert.equal(fresh.queries[1].results[0].name,'Changed');
});
