/** Synthetic latency illustration only: experimental tokenizer, not Tree-sitter. */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { experimentalIdentity, experimentalExtract } from '../../m1.4.1/src/experimental-adapter.mjs';
import { createFileFactsPipeline } from '../../m1.5/src/pipeline.mjs';
const dir=await mkdtemp(join(tmpdir(),'pcg-bench-batch-'));
const root=join(dir,'repo'),indexRoot=join(dir,'store');
const count=60, rounds=5;
const median = xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
try{
 await mkdir(root);execFileSync('git',['init','-q'],{cwd:root});
 for(let i=0;i<count;i++){
   const php=i%3===0;
   await writeFile(join(root,`file-${String(i).padStart(3,'0')}.${php?'php':'ts'}`),
     php?`<?php class C${i} { public function act() { return ${i}; } }`:`export function f${i}() { return ${i}; }`);
 }
 const app=createFileFactsPipeline({checkoutRoot:root,indexRoot,provider:{provenance:'experimental-temporary',parserIdentity:experimentalIdentity,extract:experimentalExtract}});
 const cold=await app.refresh();
 const requests=[{operation:'status'},{operation:'declarations',name:'C6'},{operation:'declarations',name:'f7'},{operation:'references',role:'call'}];
 const singleMs=[], batchMs=[];
 for(let i=0;i<rounds;i++){
   const a=performance.now();
   for(const req of requests){const {operation,...selectors}=req;const r=await app.query(operation,selectors);if(r.state!=='verified')throw Error('unverified single');}
   singleMs.push(performance.now()-a);
   const b=performance.now();const resp=await app.queryBatch(requests);
   if(resp.state!=='verified')throw Error('unverified batch');
   batchMs.push(performance.now()-b);
 }
 console.log(JSON.stringify({environment:{node:process.version,platform:process.platform},fixture:{files:count,requests:requests.length,rounds,parser:'experimental-temporary'},coldCounts:cold.counts,
   predictedInventoryScans:{single:requests.length*2,batch:2},medianMs:{single:Math.round(median(singleMs)*100)/100,batch:Math.round(median(batchMs)*100)/100},
   samplesMs:{single:singleMs.map(x=>+x.toFixed(2)),batch:batchMs.map(x=>+x.toFixed(2))},
   limitations:'Sequential uncalibrated synthetic benchmark; no Tree-sitter, token, semantic correctness or production throughput claim.'},null,2));
}finally{await rm(dir,{recursive:true,force:true})}
