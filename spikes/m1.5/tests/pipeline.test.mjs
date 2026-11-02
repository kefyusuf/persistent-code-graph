import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createFileFactsPipeline } from '../src/pipeline.mjs';
import { experimentalIdentity, experimentalExtract } from '../../m1.4.1/src/experimental-adapter.mjs';
import { CodeGraphStore } from '../../m1.4/src/store.mjs';
const sha= x=>createHash('sha256').update(x).digest('hex');

async function sandbox(files={ 'a.php':'<?php class Invoice { public function charge() {} }', 'b.ts':'interface Receipt { id: number }\nfunction bill() { charge() }' }) {
  const temp=await mkdtemp(join(tmpdir(),'pcg-m15-'));
  const root=join(temp,'repo'),index=join(temp,'storage');
  await mkdir(root);execFileSync('git',['init','-q'],{cwd:root});
  for(const [path,body] of Object.entries(files))await writeFile(join(root,path),body);
  return {temp,root,index,async close(){await rm(temp,{recursive:true,force:true})}};
}
function provider(extra={}) {
 let calls=0;
 return {provenance:'experimental-temporary',parserIdentity:experimentalIdentity,
   async extract(input){calls++;return experimentalExtract(input);},
   calls:()=>calls,...extra};
}
function pipeline(s,p){return createFileFactsPipeline({checkoutRoot:s.root,indexRoot:s.index,provider:p});}

// Use subtests with a fresh Git checkout to avoid implicit shared state.
test('cold index -> reopen -> verified exact query; provider provenance explicitly experimental',async()=>{
 const s=await sandbox();try{
  const p=provider(),app=pipeline(s,p);
  const cold=await app.refresh();assert.deepEqual(cold.counts,{added:2,changed:0,reused:0,removed:0,parsed:2});
  assert.equal(cold.parserProvenance,'experimental-temporary');assert.equal(cold.semanticGraph,false);
  const freshApp=pipeline(s,provider());
  const q=await freshApp.query('declarations',{name:'Invoice'});
  assert.equal(q.state,'verified');assert.equal(q.parserProvenance,'experimental-temporary');
  assert.ok(q.results.some(x=>x.name==='Invoice'));
 }finally{await s.close()}
});

test('unchanged warm refresh makes zero parser calls and retains same snapshot',async()=>{
 const s=await sandbox();try{
   const p=provider(),app=pipeline(s,p),a=await app.refresh();
   const b=await app.refresh();
   assert.equal(p.calls(),2);assert.equal(b.counts.reused,2);assert.equal(b.counts.parsed,0);
   assert.equal(a.snapshotId,b.snapshotId);assert.equal(b.unchanged,true);
 }finally{await s.close()}
});

test('one edit reparses only changed source; verified query withholds old facts',async()=>{
 const s=await sandbox();try{
   const p=provider(),app=pipeline(s,p);
   await app.refresh();await writeFile(join(s.root,'a.php'),'<?php class Invoice { public function refund() {} }');
   const stale=await app.query('declarations',{name:'charge'});
   assert.equal(stale.state,'stale');assert.equal(stale.results.length,0);
   const b=await app.refresh();assert.deepEqual(b.counts,{added:0,changed:1,reused:1,removed:0,parsed:1});
   assert.equal(p.calls(),3);
   const q=await app.query('declarations',{name:'refund'});
   assert.equal(q.state,'verified');assert.ok(q.results.length>0);
 }finally{await s.close()}
});

test('warm index equals cold index across edits for stored file facts',async()=>{
 const s=await sandbox();try{
  const p=provider(),app=pipeline(s,p);await app.refresh();
  await writeFile(join(s.root,'a.php'),'<?php trait Audits {} class Invoice { use Audits; }');
  const warm=await app.refresh();const warmFiles=(await new CodeGraphStore({checkoutRoot:s.root,indexRoot:s.index}).read()).files;
  const p2=provider();const index2=join(s.temp,'other-store');
  const cold=await createFileFactsPipeline({checkoutRoot:s.root,indexRoot:index2,provider:p2}).refresh();
  const coldFiles=(await new CodeGraphStore({checkoutRoot:s.root,indexRoot:index2}).read()).files;
  assert.deepEqual(warmFiles,coldFiles);assert.equal(warm.snapshotId,cold.snapshotId);
  assert.equal(warm.counts.parsed,1);assert.equal(cold.counts.parsed,2);
 }finally{await s.close()}
});

test('new Node.js process can re-open persisted index and return verified results',async()=>{
 const s=await sandbox();try{
  await pipeline(s,provider()).refresh();
  const js=`import {createFileFactsPipeline} from ${JSON.stringify(new URL('../src/pipeline.mjs',import.meta.url).href)};import {experimentalIdentity,experimentalExtract} from ${JSON.stringify(new URL('../../m1.4.1/src/experimental-adapter.mjs',import.meta.url).href)};const app=createFileFactsPipeline({checkoutRoot:process.argv[1],indexRoot:process.argv[2],provider:{provenance:'experimental-temporary',parserIdentity:experimentalIdentity,extract:experimentalExtract}});console.log(JSON.stringify(await app.query('declarations',{name:'Invoice'})));`;
  const x=spawnSync(process.execPath,['--input-type=module','-e',js,s.root,s.index],{encoding:'utf8'});
  assert.equal(x.status,0,x.stderr);const data=JSON.parse(x.stdout);assert.equal(data.state,'verified');assert.ok(data.results.length);
 }finally{await s.close()}
});

test('parser identity drift yields stale, and reindex reparses all files',async()=>{
 const s=await sandbox();try{
  await pipeline(s,provider()).refresh();
  const changed=provider({parserIdentity:lang=>sha(`changed-extractor:${lang}`)});
  const app=pipeline(s,changed);
  assert.equal((await app.query('declarations',{name:'Invoice'})).state,'stale');
  const refresh=await app.refresh();assert.equal(refresh.counts.parsed,2);
  assert.equal((await app.query('declarations',{name:'Invoice'})).state,'verified');
 }finally{await s.close()}
});

test('deletion prunes old facts and cold/warm equality is preserved',async()=>{
 const s=await sandbox();try{
  const app=pipeline(s,provider());await app.refresh();await rm(join(s.root,'a.php'));
  assert.equal((await app.query('declarations',{name:'Invoice'})).state,'stale');
  const b=await app.refresh();assert.equal(b.counts.removed,1);assert.equal(b.counts.reused,1);assert.equal(b.counts.parsed,0);
  const q=await app.query('declarations',{name:'Invoice'});assert.equal(q.state,'verified');assert.equal(q.results.length,0);
 }finally{await s.close()}
});

test('failed parse leaves prior snapshot unchanged and query fails closed for changed source',async()=>{
 const s=await sandbox();try{
  const app=pipeline(s,provider());const first=await app.refresh();
  await writeFile(join(s.root,'a.php'),'<?php class Invoice { public function refund() {} }');
  const broken=pipeline(s,provider({async extract(){throw Object.assign(new Error('unavailable parser'),{code:'PARSER_FAILED'});}}));
  await assert.rejects(broken.refresh(),/unavailable parser/);
  const saved=await new CodeGraphStore({checkoutRoot:s.root,indexRoot:s.index}).read();
  assert.equal(saved.snapshotId,first.snapshotId);
  assert.equal((await app.query('declarations',{name:'charge'})).state,'stale');
 }finally{await s.close()}
});

test('mutation during index rejects publication; previous head preserved',async()=>{
 const s=await sandbox();try{
  const app=pipeline(s,provider());const first=await app.refresh();
  await writeFile(join(s.root,'a.php'),'<?php class Invoice { public function refund() {} }');
  await assert.rejects(app.refresh({beforeVerify:async()=>writeFile(join(s.root,'a.php'),'<?php class Invoice { public function newCharge() {} }')}),e=>e.code==='SOURCE_CHANGED_DURING_INDEX');
  const saved=await new CodeGraphStore({checkoutRoot:s.root,indexRoot:s.index}).read();
  assert.equal(saved.snapshotId,first.snapshotId);
 }finally{await s.close()}
});

test('malformed source coverage is not promoted to complete',async()=>{
 const s=await sandbox({'a.php':'<?php class Invoice { public function foo( {'});try{
  const app=pipeline(s,provider());await app.refresh();
  const q=await app.query('declarations');
  assert.equal(q.state,'verified');assert.equal(q.coverage,'failed');
 }finally{await s.close()}
});

test('read-only queries never call parser and outputs are bounded',async()=>{
 const s=await sandbox();try{
  const p=provider(),app=pipeline(s,p);await app.refresh();
  const before=p.calls();const result=await app.query('declarations',{limit:1,maxBytes:500});
  assert.equal(result.state,'verified');assert.ok(result.results.length<=1);assert.equal(p.calls(),before);
 }finally{await s.close()}
});

test('explicit provenance required and user cannot override parser identity',async()=>{
 const s=await sandbox();try{
  assert.throws(()=>createFileFactsPipeline({checkoutRoot:s.root,indexRoot:s.index,provider:{parserIdentity:experimentalIdentity,extract:experimentalExtract}}),e=>e.code==='INVALID_PIPELINE');
  const app=pipeline(s,provider());await app.refresh();
  await assert.rejects(app.query('declarations',{parserIdentity:()=>sha('evil')}),e=>e.code==='INVALID_PIPELINE');
 }finally{await s.close()}
});
