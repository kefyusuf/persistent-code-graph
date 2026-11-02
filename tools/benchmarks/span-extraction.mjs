#!/usr/bin/env node
/** M1.6.12 reproducible synthetic microbenchmark. Not a production speed claim. */
import { performance } from 'node:perf_hooks';
import { fileFactsFromTree } from '../../src/parser/contract.mjs';

const count = 900;
const filler = '// ' + 'x'.repeat(250) + '\n';
const prefix = '// astral 🧭\r\n';
const line = 'tick(); ' + filler;
const source = prefix + line.repeat(count);
const children = [];
for (let i = 0; i < count; i++) {
  const startIndex = prefix.length + i * line.length;
  const functionNode = {type:'identifier',text:'tick',startIndex,endIndex:startIndex+4,namedChildren:[]};
  children.push({type:'call_expression',text:'tick()',startIndex,endIndex:startIndex+6,
    namedChildren:[],childForFieldName(field){return field==='function'?functionNode:null;}});
}
const root={type:'program',text:source,startIndex:0,endIndex:source.length,
  hasError:false,namedChildren:children};
const parser={kind:'syntax-fixture',runtimeVersion:'benchmark',cacheIdentity:'a'.repeat(64)};
const times=[];
const run=()=>fileFactsFromTree('typescript','large.ts',source,root,parser);
run(); // warmup
for (let i=0;i<5;i++){
 const start=performance.now();
 const facts=run();
 times.push(performance.now()-start);
 if(facts.references.length!==count)throw new Error('BENCHMARK_INVALID_FACT_COUNT');
}
times.sort((a,b)=>a-b);
console.log(JSON.stringify({node:process.version,scenario:'synthetic TS calls, astral UTF-8 prefix',sourceBytes:Buffer.byteLength(source),occurrences:count,samples:times.length,medianMs:Number(times[2].toFixed(2)),samplesMs:times.map(x=>Number(x.toFixed(2)))}));
