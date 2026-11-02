import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inventoryGitCheckout, verifySourceInventory, classifySource } from '../src/incremental/inventory.mjs';
import { refreshFileFacts, fixtureExtractor } from '../src/incremental/refresh.mjs';
import * as oldInventory from '../spikes/m1.4.1/src/inventory.mjs';
import * as oldRefresh from '../spikes/m1.4.1/src/refresh.mjs';
import { CodeGraphStore } from '../src/storage/store.mjs';
const sha = x => createHash('sha256').update(x).digest('hex');
const identities={php:sha('php-parser-v1'),typescript:sha('ts-parser-v1'),tsx:sha('tsx-parser-v1')};
const parserIdentity=language=>identities[language];
function git(root,...args){return execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();}
async function sandbox(t){
 const base=await mkdtemp(join(tmpdir(),'pcg-m163-'));
 const checkoutRoot=join(base,'checkout'),indexRoot=join(base,'index');
 await mkdir(checkoutRoot);
 git(checkoutRoot,'init','-q');
 git(checkoutRoot,'config','user.name','Fixture');
 git(checkoutRoot,'config','user.email','fixture@example.test');
 t.after(()=>rm(base,{recursive:true,force:true}));
 return {checkoutRoot,indexRoot,put:(name,text)=>writeFile(join(checkoutRoot,name),text)};
}
test('canonical inventory exports remain identical to legacy imports',()=>{
 assert.equal(inventoryGitCheckout,oldInventory.inventoryGitCheckout);
 assert.equal(verifySourceInventory,oldInventory.verifySourceInventory);
 assert.equal(classifySource,oldInventory.classifySource);
});
test('canonical refresh exports remain identical to legacy imports',()=>{
 assert.equal(refreshFileFacts,oldRefresh.refreshFileFacts);
 assert.equal(fixtureExtractor,oldRefresh.fixtureExtractor);
});
test('legacy modules are re-export-only; consumers use the canonical inventory and refresh',()=>{
 for(const name of ['inventory','refresh']){
  const old=readFileSync(new URL(`../spikes/m1.4.1/src/${name}.mjs`,import.meta.url),'utf8').trim();
  assert.equal(old,`export * from '../../../src/incremental/${name}.mjs';`);
  const canonical=readFileSync(new URL(`../src/incremental/${name}.mjs`,import.meta.url),'utf8');
  assert.match(canonical,name==='inventory'?/export async function inventoryGitCheckout/:/export async function refreshFileFacts/);
 }
 const core=readFileSync(new URL('../src/core.mjs',import.meta.url),'utf8');
 const provider=readFileSync(new URL('../src/parser/provider.mjs',import.meta.url),'utf8');
 const query=readFileSync(new URL('../src/query/query.mjs',import.meta.url),'utf8');
 assert.match(core,/from ['"]\.\/incremental\/refresh\.mjs['"]/);
 assert.match(provider,/from ['"]\.\.\/incremental\/inventory\.mjs['"]/);
 assert.match(query,/from ['"]\.\.\/incremental\/inventory\.mjs['"]/);
});
test('real Git inventory preserves working tree precedence and exclusion rules',async t=>{
 const {checkoutRoot,put}=await sandbox(t);
 await put('.gitignore','ignored.php\n');
 await put('tracked.ts','export const a=1;');
 git(checkoutRoot,'add','tracked.ts','.gitignore');git(checkoutRoot,'commit','-qm','baseline');
 await put('tracked.ts','export const a=2;');
 await put('untracked.php','<?php class Untracked {}');
 await put('ignored.php','<?php class Ignored {}');
 await put('unsupported.go','package main');
 const initial=await inventoryGitCheckout(checkoutRoot);
 assert.deepEqual(initial.files.map(x=>x.file),['tracked.ts','untracked.php']);
 assert.equal(initial.files[0].contentHash,sha('export const a=2;'));
 assert.equal(classifySource('template.blade.php'),null);
 await verifySourceInventory(initial);
 await put('tracked.ts','export const a=3;');
 await assert.rejects(verifySourceInventory(initial),{code:'SOURCE_CHANGED_DURING_INDEX'});
});
test('legacy and canonical refresh reuse identical persisted snapshots',async t=>{
 const {checkoutRoot,indexRoot,put}=await sandbox(t);
 await put('a.ts','export const a=1;');await put('b.php','<?php function b(){}');
 const first=await refreshFileFacts({checkoutRoot,indexRoot,parserIdentity,extract:fixtureExtractor});
 const second=await oldRefresh.refreshFileFacts({checkoutRoot,indexRoot,parserIdentity,extract:oldRefresh.fixtureExtractor});
 assert.equal(first.counts.parsed,2);
 assert.equal(second.counts.parsed,0);
 assert.equal(second.counts.reused,2);
 assert.equal(second.snapshotId,first.snapshotId);
 assert.equal((await new CodeGraphStore({checkoutRoot,indexRoot}).read()).snapshotId,first.snapshotId);
});
test('canonical refresh updates only one file; failed verification leaves previous head',async t=>{
 const {checkoutRoot,indexRoot,put}=await sandbox(t);
 await put('a.ts','export const a=1;');await put('b.php','<?php function b(){}');
 const initial=await refreshFileFacts({checkoutRoot,indexRoot,parserIdentity,extract:fixtureExtractor});
 await put('a.ts','export const a=2;');
 const changed=await refreshFileFacts({checkoutRoot,indexRoot,parserIdentity,extract:fixtureExtractor});
 assert.deepEqual(changed.counts,{added:0,changed:1,reused:1,removed:0,parsed:1});
 assert.notEqual(changed.snapshotId,initial.snapshotId);
 await assert.rejects(refreshFileFacts({checkoutRoot,indexRoot,parserIdentity,extract:fixtureExtractor,
   beforeVerify:()=>put('late.php','<?php class Late {}')}),{code:'SOURCE_CHANGED_DURING_INDEX'});
 assert.equal((await new CodeGraphStore({checkoutRoot,indexRoot}).read()).snapshotId,changed.snapshotId);
});
