import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, utimes, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inventoryGitCheckout,verifySourceInventory,classifySource} from '../src/inventory.mjs';
import {refreshFileFacts,fixtureExtractor} from '../src/refresh.mjs';
const key = s =>createHash('sha256').update(s).digest('hex');
function git(root,...args){return execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();}
async function sandbox(t){
 const temp=await mkdtemp(join(tmpdir(),'pcg-inventory-'));
 const repo=join(temp,'repo'),index=join(temp,'cache');await mkdir(repo);
 git(repo,'init','-q');git(repo,'config','user.name','Fixture');git(repo,'config','user.email','fixture@example.test');
 t.after(()=>rm(temp,{recursive:true,force:true}));
 return {repo,index,put:(file,body)=>writeFile(join(repo,file),body)};
}
const identities={php:key('php-parser-v1'),typescript:key('ts-parser-v1'),tsx:key('tsx-parser-v1')};
const identity=l=>identities[l];

// Actual git repository, no synthetic inventory manifests.
test('tracked and untracked eligible files are included; ignored and unsupported paths excluded',async t=>{
 const {repo,put}=await sandbox(t);
 await put('.gitignore','ignored.php\nnode_modules/\n');
 await put('tracked.php','<?php function one() {}');git(repo,'add','tracked.php','.gitignore');git(repo,'commit','-qm','baseline');
 await put('untracked.ts','export const a = 1;');await put('ignored.php','<?php');await put('notes.md','not code');
 await mkdir(join(repo,'node_modules'));await put('node_modules/dependency.ts','const x = 3');
 const inv=await inventoryGitCheckout(repo);
 assert.deepEqual(inv.files.map(x=>x.file),['tracked.php','untracked.ts']);
});
test('modified tracked worktree takes precedence over committed/staged content',async t=>{
 const {repo,put}=await sandbox(t);await put('x.php','<?php $a=1;');git(repo,'add','x.php');git(repo,'commit','-qm','baseline');
 await put('x.php','<?php $a=2;');git(repo,'add','x.php');await put('x.php','<?php $a=3;');
 const inv=await inventoryGitCheckout(repo);assert.equal(inv.files[0].contentHash,key('<?php $a=3;'));
});
test('ignores symlinks and unsupported template dialects',async t=>{
 const {repo,put}=await sandbox(t);await put('real.php','<?php');await put('page.blade.php','<div>{{ $a }}</div>');await symlink(join(repo,'real.php'),join(repo,'link.php'));
 const inv=await inventoryGitCheckout(repo);assert.deepEqual(inv.files.map(f=>f.file),['real.php']);
 assert.equal(classifySource('page.blade.php'),null);
});
test('detects same-size and same-mtime file byte edits',async t=>{
 const {repo,put}=await sandbox(t);await put('a.ts','const a=1;');const before=await inventoryGitCheckout(repo);
 const sameTime=new Date('2024-01-01T00:00:00Z');await utimes(join(repo,'a.ts'),sameTime,sameTime);
 await put('a.ts','const a=2;');await utimes(join(repo,'a.ts'),sameTime,sameTime);
 await assert.rejects(verifySourceInventory(before),{code:'SOURCE_CHANGED_DURING_INDEX'});
});
test('rejects non-repository as inventory source',async t=>{
 const {repo}=await sandbox(t);const outside=join(repo,'x');await mkdir(outside);
 await assert.rejects(inventoryGitCheckout(outside),{code:'NOT_CHECKOUT_ROOT'});
});
test('idempotent warm refresh reparses nothing and persists across process-like instances',async t=>{
 const {repo,index,put}=await sandbox(t);await put('a.ts','export const a = 1;');await put('b.php','<?php function f(){}');
 let calls=0;const extract=async x=>{calls++;return fixtureExtractor(x)};
 const r1=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract});
 const r2=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract});
 assert.equal(r1.counts.parsed,2);assert.equal(r2.counts.parsed,0);assert.equal(r2.counts.reused,2);
 assert.equal(r2.snapshotId,r1.snapshotId);assert.equal(r2.unchanged,true);assert.equal(calls,2);
});
test('one changed file updates just one file-fact; others reused',async t=>{
 const {repo,index,put}=await sandbox(t);await put('a.ts','export const a=1;');await put('b.php','<?php function f(){}');
 const call=[];const extract=async x=>{call.push(x.file);return fixtureExtractor(x)};
 await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract});
 await put('a.ts','export const a=2;');
 const r=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract});
 assert.deepEqual(r.counts,{added:0,changed:1,reused:1,removed:0,parsed:1});
 assert.deepEqual(call,['a.ts','b.php','a.ts']);
});
test('deleted source is removed while unchanged sources reused',async t=>{
 const {repo,index,put}=await sandbox(t);await put('a.ts','const a=1;');await put('b.php','<?php');
 await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 await rm(join(repo,'a.ts'));
 const r=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 assert.equal(r.counts.removed,1);assert.equal(r.counts.reused,1);assert.equal(r.storedFiles,1);
});
test('parser identity changes force only affected language to be extracted again',async t=>{
 const {repo,index,put}=await sandbox(t);await put('a.ts','const a=1;');await put('b.php','<?php');
 await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 const r=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:l=>l==='php'?key('php-v2'):identity(l),extract:fixtureExtractor});
 assert.equal(r.counts.changed,1);assert.equal(r.counts.reused,1);
});
test('commit without byte changes does not force parse',async t=>{
 const {repo,index,put}=await sandbox(t);await put('a.ts','const a=1;');
 await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 git(repo,'add','a.ts');git(repo,'commit','-qm','record same content');
 const r=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 assert.equal(r.counts.parsed,0);assert.equal(r.unchanged,true);
});
test('extractor failure never publishes a new head',async t=>{
 const {repo,index,put}=await sandbox(t);await put('a.ts','const a=1;');
 const a=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 await put('a.ts','const a=2;');
 await assert.rejects(refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:async()=>{throw new Error('parser failed')}}),/parser failed/);
 const {CodeGraphStore}=await import('../../m1.4/src/store.mjs');const old=await new CodeGraphStore({indexRoot:index,checkoutRoot:repo}).read();
 assert.equal(old.snapshotId,a.snapshotId);
});
test('source byte changes during parse are rejected before publication',async t=>{
 const {repo,index,put}=await sandbox(t);await put('a.ts','const a=1;');
 await assert.rejects(refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,
  extract:async x=>{await put('a.ts','const a=2;');return fixtureExtractor(x)}}),{code:'SOURCE_CHANGED_DURING_INDEX'});
});
test('added source between extraction and publish is rejected',async t=>{
 const {repo,index,put}=await sandbox(t);await put('a.ts','const a=1;');
 await assert.rejects(refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor,
  beforeVerify:()=>put('b.php','<?php')}),{code:'SOURCE_CHANGED_DURING_INDEX'});
});
test('mixed valid code and unsupported files do not create false source entries',async t=>{
 const {repo,index,put}=await sandbox(t);await put('a.ts','const a=1;');await put('notes.md','notes');
 const a=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 await put('notes.md','notes changed');
 const b=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 assert.equal(a.snapshotId,b.snapshotId);assert.equal(b.counts.parsed,0);
});
test('branch switch updates affected file only; switching back restores matching source records',async t=>{
 const {repo,index,put}=await sandbox(t);
 await put('a.ts','const a=1;');await put('b.php','<?php function hello(){}');
 git(repo,'add','a.ts','b.php');git(repo,'commit','-qm','baseline');
 const baseline=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 git(repo,'switch','-q','-c','feature');await put('a.ts','const a=2;');git(repo,'add','a.ts');git(repo,'commit','-qm','branch-change');
 const feature=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 assert.equal(feature.counts.parsed,1);assert.equal(feature.counts.reused,1);
 git(repo,'switch','-q','-');
 const returned=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 assert.equal(returned.counts.parsed,1);assert.equal(returned.counts.reused,1);
 assert.equal(returned.snapshotId,baseline.snapshotId); // immutable snapshot deterministic
});
test('actual Git worktrees keep independent head, do not overwrite parent index',async t=>{
 const {repo,index,put}=await sandbox(t);
 await put('a.ts','const a=1;');git(repo,'add','a.ts');git(repo,'commit','-qm','baseline');
 const original=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 const worktree=join(repo,'..','alternate-worktree');
 git(repo,'worktree','add','-qb','feature-worktree',worktree);
 await writeFile(join(worktree,'a.ts'),'const a=2;');
 const secondary=await refreshFileFacts({checkoutRoot:worktree,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 const {CodeGraphStore}=await import('../../m1.4/src/store.mjs');
 const parent=await new CodeGraphStore({indexRoot:index,checkoutRoot:repo}).read();
 const child=await new CodeGraphStore({indexRoot:index,checkoutRoot:worktree}).read();
 assert.equal(parent.snapshotId,original.snapshotId);assert.equal(child.snapshotId,secondary.snapshotId);
 assert.notEqual(parent.checkoutKey,child.checkoutKey);
});
test('invalid UTF8 source is not silently rewritten or indexed as valid code',async t=>{
 const {repo,index,put}=await sandbox(t);
 await writeFile(join(repo,'bad.php'),Buffer.from([0xff,0xfe]));
 await assert.rejects(refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor}),{code:'INVALID_UTF8_SOURCE'});
});
test('freshness label is bounded to the pre-publication verification event',async t=>{
 const {repo,index,put}=await sandbox(t);
 await put('a.ts','const a=1;');
 const r=await refreshFileFacts({checkoutRoot:repo,indexRoot:index,parserIdentity:identity,extract:fixtureExtractor});
 assert.equal(r.freshness,'content-hash-verified-before-publication');
 assert.equal(r.verification.assurance,'content-hash-verified-at-check');
 const {CodeGraphStore}=await import('../../m1.4/src/store.mjs');
 assert.equal((await new CodeGraphStore({indexRoot:index,checkoutRoot:repo}).read()).freshness,'unknown');
});
