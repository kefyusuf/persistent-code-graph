import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openCodeGraph } from '../src/index.mjs';
import { createFileFactsPipeline } from '../src/core.mjs';
import { experimentalExtract, experimentalIdentity } from '../spikes/m1.4.1/src/experimental-adapter.mjs';

async function sandbox(t){
  const root=await mkdtemp(join(tmpdir(),'pcg-m16-'));
  const checkoutRoot=join(root,'repo'),indexRoot=join(root,'cache');
  await mkdir(checkoutRoot);
  execFileSync('git',['init','-q'],{cwd:checkoutRoot});
  t.after(()=>rm(root,{recursive:true,force:true}));
  return {checkoutRoot,indexRoot};
}
const fake=()=>({provenance:'experimental-temporary',parserIdentity:experimentalIdentity,extract:experimentalExtract});

test('public entrypoint exposes only real Tree-sitter opener',()=>{
  assert.equal(typeof openCodeGraph,'function');
  assert.equal(openCodeGraph.name,'createRealTreeSitterPipeline');
});

test('production entrypoint opens empty Git checkout without temporary fallback',async t=>{
  const paths=await sandbox(t);
  const api=await openCodeGraph(paths);
  assert.equal(api.provenance,'real-tree-sitter-unvalidated');
  assert.equal(api.semanticGraph,undefined);
  const refreshed=await api.refresh();
  assert.equal(refreshed.counts.parsed,0);
  const q=await api.query('status');
  assert.equal(q.state,'verified');
  assert.equal(q.coverage,'not-evaluated');
});

test('core reuses indexed facts, refuses stale results and has bounded queries',async t=>{
  const paths=await sandbox(t);
  const path=join(paths.checkoutRoot,'a.php');
  await writeFile(path,'<?php class Invoice { public function charge() {} }');
  const api=createFileFactsPipeline({...paths,provider:fake()});
  const cold=await api.refresh();
  assert.equal(cold.counts.parsed,1);
  assert.equal((await api.refresh()).counts.parsed,0);
  await writeFile(path,'<?php class Invoice { public function refund() {} }');
  const stale=await api.query('declarations',{name:'charge'});
  assert.equal(stale.state,'stale');
  assert.deepEqual(stale.results,[]);
  assert.equal((await api.refresh()).counts.parsed,1);
  const results=await api.queryBatch([{operation:'declarations',name:'Invoice'},{operation:'declarations',name:'refund'}]);
  assert.equal(results.state,'verified');
  assert.equal(results.queries.length,2);
  assert.equal(results.queries[1].results[0].name,'refund');
});

test('user query cannot override parser identity through new core',async t=>{
  const paths=await sandbox(t);
  const api=createFileFactsPipeline({...paths,provider:fake()});
  await assert.rejects(api.query('status',{parserIdentity:()=>''}),{code:'INVALID_PIPELINE'});
});
