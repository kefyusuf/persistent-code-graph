/** Reproducible offline lifecycle demonstration. Uses M1.2 TEMPORARY parsers. */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { refreshFileFacts } from '../../m1.4.1/src/refresh.mjs';
import { experimentalIdentity, experimentalExtract } from '../../m1.4.1/src/experimental-adapter.mjs';
import { verifiedQuery } from './query.mjs';

const temp=await mkdtemp(join(tmpdir(),'pcg-m142-demo-'));
const checkoutRoot=join(temp,'source'),indexRoot=join(temp,'store');
try{
 await mkdir(checkoutRoot);
 execFileSync('git',['init','-q'],{cwd:checkoutRoot});
 await writeFile(join(checkoutRoot,'cart.ts'),'interface Cart { total: number }\nfunction checkout() { return total(1) }\n');
 await writeFile(join(checkoutRoot,'billing.php'),'<?php class CheckoutService { public function charge() {} }');
 const refresh=()=>refreshFileFacts({checkoutRoot,indexRoot,parserIdentity:experimentalIdentity,extract:experimentalExtract});
 const query=(operation,extra={})=>verifiedQuery({checkoutRoot,indexRoot,parserIdentity:experimentalIdentity,operation,...extra});
 const first=await refresh();
 const symbol=await query('declarations',{name:'CheckoutService'});
 await writeFile(join(checkoutRoot,'billing.php'),'<?php class CheckoutService { public function refund() {} }');
 const stale=await query('declarations',{name:'charge'});
 const second=await refresh();
 const changed=await query('declarations',{name:'refund'});
 console.log(JSON.stringify({
   parser:'M1.2 temporary; NOT approved Tree-sitter',
   firstIndex:first.counts,
   firstQuery:{state:symbol.state,names:symbol.results.map(x=>x.name)},
   afterEdit:{state:stale.state,withheld:stale.results.length,changed:stale.drift?.changed},
   secondIndex:second.counts,
   afterRefresh:{state:changed.state,methods:changed.results.map(x=>x.name)}
 },null,2));
}finally{await rm(temp,{recursive:true,force:true});}
