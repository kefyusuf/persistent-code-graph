/** Optional local latency probe. Synthetic small PHP files; not a token benchmark. */
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createFileFactsPipeline} from './pipeline.mjs';
import {experimentalIdentity,experimentalExtract} from '../../m1.4.1/src/experimental-adapter.mjs';
const number = Number(process.argv[2]??80);
if(!Number.isSafeInteger(number)||number<1||number>2000)throw new Error('file count must be 1..2000');
const temp=await mkdtemp(join(tmpdir(),'pcg-m15-bench-'));
try {
 const checkoutRoot=join(temp,'src'),indexRoot=join(temp,'idx');
 await mkdir(checkoutRoot);execFileSync('git',['init','-q'],{cwd:checkoutRoot});
 for(let i=0;i<number;i++)await writeFile(join(checkoutRoot,`service-${i.toString().padStart(5,'0')}.php`),`<?php class Service${i} { public function method${i}() {} }\n`);
 const app=createFileFactsPipeline({checkoutRoot,indexRoot,provider:{provenance:'experimental-temporary',parserIdentity:experimentalIdentity,extract:experimentalExtract}});
 const timed=async(fn)=>{const begin=performance.now();const result=await fn();return {milliseconds:Math.round((performance.now()-begin)*100)/100,result};};
 const cold=await timed(()=>app.refresh());
 const warm=await timed(()=>app.refresh());
 const queries=[];
 for(let i=0;i<5;i++)queries.push((await timed(()=>app.query('declarations',{name:'Service17'}))).milliseconds);
 console.log(JSON.stringify({synthetic:true,parser:'M1.2 temporary PHP tokenizer',files:number,
  coldMs:cold.milliseconds,warmMs:warm.milliseconds,queryMs:queries,
  coldParsed:cold.result.counts.parsed,warmParsed:warm.result.counts.parsed,
  disclaimer:'Local illustrative measurement; queries hash all eligible files twice and read the complete snapshot; no tokens or LLM quality measured.'},null,2));
}finally{await rm(temp,{recursive:true,force:true});}
