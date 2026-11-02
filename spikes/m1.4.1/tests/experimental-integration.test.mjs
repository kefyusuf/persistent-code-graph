import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {CodeGraphStore,canonicalJSONString} from '../../m1.4/src/store.mjs';
import {refreshFileFacts} from '../src/refresh.mjs';
import {experimentalIdentity,experimentalExtract} from '../src/experimental-adapter.mjs';
const fsRoot=new URL('../../m1.2/fixtures/',import.meta.url);
async function fixture(t){
 const tmp=await mkdtemp(join(tmpdir(),'pcg-m14-real-'));
 const repo=join(tmp,'repo'),index=join(tmp,'index');await mkdir(repo);
 execFileSync('git',['init','-q'],{cwd:repo});
 const ts=await readFile(new URL('merging.ts',fsRoot));
 const php=await readFile(new URL('trait.php',fsRoot));
 await writeFile(join(repo,'src.ts'),ts);await writeFile(join(repo,'order.php'),php);
 t.after(()=>rm(tmp,{recursive:true,force:true}));
 return {tmp,repo,index};
}
test('M1.2 temporary real extractors feed persistence and reload exact PHP/TS declarations', async t=>{
 const {repo,index}=await fixture(t);
 const result=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:experimentalIdentity,extract:experimentalExtract});
 assert.equal(result.counts.parsed,2);
 const stored=await new CodeGraphStore({indexRoot:index,checkoutRoot:repo}).read();
 assert.equal(stored.files.length,2);
 assert.ok(stored.files.find(f=>f.file==='src.ts').declarations.some(d=>d.kind==='interface'&&d.name==='Box'));
 assert.ok(stored.files.find(f=>f.file==='order.php').declarations.some(d=>d.kind==='trait'&&d.name==='TracksEvents'));
 assert.equal(stored.freshness,'unknown');
});
test('M1.2 source facts incremental result equals a cold rebuild after one real PHP edit',async t=>{
 const {tmp,repo,index}=await fixture(t);
 const first=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:experimentalIdentity,extract:experimentalExtract});
 await writeFile(join(repo,'order.php'),'<?php trait T { public function save() {} }');
 const second=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:experimentalIdentity,extract:experimentalExtract});
 assert.equal(second.counts.parsed,1);assert.equal(second.counts.reused,1);
 const warm=await new CodeGraphStore({indexRoot:index,checkoutRoot:repo}).read();
 const coldRoot=join(tmp,'cold');
 await refreshFileFacts({checkoutRoot:repo,indexRoot:coldRoot,parserIdentity:experimentalIdentity,extract:experimentalExtract});
 const cold=await new CodeGraphStore({indexRoot:coldRoot,checkoutRoot:repo}).read();
 assert.equal(canonicalJSONString(warm.files),canonicalJSONString(cold.files));
});
test('no change to Git repository paths or status from indexing',async t=>{
 const {repo,index}=await fixture(t);
 const before=execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{cwd:repo,encoding:'utf8'});
 await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:experimentalIdentity,extract:experimentalExtract});
 const after=execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{cwd:repo,encoding:'utf8'});
 assert.equal(before,after);
});
