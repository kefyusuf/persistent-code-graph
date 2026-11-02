import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodeGraphStore, compareManifest, canonicalJSONString } from '../src/storage/store.mjs';
import * as legacy from '../spikes/m1.4/src/store.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const fixture = (file='src/account.php', source='<?php class Account {}') => ({
  file, language:'php',contentHash:hash(source),
  parser:{kind:'fixture',cacheIdentity:hash('php:parser:v1')},
  declarations:[{kind:'class',name:'Account',range:{startByte:6,endByte:20,startLine:1,endLine:1}}],
  references:[], relations:[], diagnostics:[],
  coverage:{declarations:'partial',references:'partial',calls:'not-evaluated'},
});
async function sandbox(t){
  const root=await mkdtemp(join(tmpdir(),'pcg-m162-'));
  const checkoutRoot=join(root,'checkout'),indexRoot=join(root,'store');
  await mkdir(checkoutRoot);
  t.after(()=>rm(root,{recursive:true,force:true}));
  return {checkoutRoot,indexRoot};
}

test('canonical store exports are the identical legacy exports (no fork)',()=>{
  assert.equal(CodeGraphStore,legacy.CodeGraphStore);
  assert.equal(compareManifest,legacy.compareManifest);
  assert.equal(canonicalJSONString,legacy.canonicalJSONString);
});

test('old store entrypoint is a re-export-only shim, with no second storage owner',()=>{
  const old=readFileSync(new URL('../spikes/m1.4/src/store.mjs',import.meta.url),'utf8').trim();
  assert.equal(old,"export * from '../../../src/storage/store.mjs';");
  const impl=readFileSync(new URL('../src/storage/store.mjs',import.meta.url),'utf8');
  assert.match(impl,/export class CodeGraphStore/);
});

test('canonical refresh and query use canonical storage directly; no old storage module imports',()=>{
  for (const name of ['src/incremental/refresh.mjs','spikes/m1.4.2/src/query.mjs']){
    const code=readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
    assert.match(code,name.startsWith('src/')
      ? /from '\.\.\/storage\/store\.mjs'/
      : /from '\.\.\/\.\.\/\.\.\/src\/storage\/store\.mjs'/);
    assert.doesNotMatch(code,/from '\.\.\/\.\.\/m1\.4\/src\/store\.mjs'/);
  }
});

test('canonical store writes byte-stable snapshots readable from legacy entrypoint',async t=>{
  const paths=await sandbox(t);
  const canonical=new CodeGraphStore(paths), older=new legacy.CodeGraphStore(paths);
  assert.equal(await canonical.read(),null);
  const initial=await canonical.publish({expectedHead:null,files:[fixture()]});
  const reopened=await older.read();
  assert.equal(reopened.snapshotId,initial.snapshotId);
  assert.equal(reopened.freshness,'unknown');
  assert.deepEqual(reopened.files,[fixture()]);
  const before=await readdir(join(paths.indexRoot,'objects'));
  const same=await older.publish({expectedHead:initial.snapshotId,files:[fixture()]});
  assert.equal(same.unchanged,true);
  assert.equal(same.snapshotId,initial.snapshotId);
  assert.deepEqual(await readdir(join(paths.indexRoot,'objects')),before);
});

test('failed canonical publication leaves legacy reader on previous snapshot',async t=>{
  const paths=await sandbox(t);
  const store=new CodeGraphStore(paths);
  const initial=await store.publish({expectedHead:null,files:[fixture()]});
  const fail=new CodeGraphStore({...paths,failPoint:'after-snapshot'});
  await assert.rejects(fail.publish({expectedHead:initial.snapshotId,files:[fixture('src/account.php','<?php class Changed {}')]}),{code:'INJECTED_FAILURE'});
  const reader=new legacy.CodeGraphStore(paths);
  const state=await reader.read();
  assert.equal(state.snapshotId,initial.snapshotId);
  assert.deepEqual(state.files,[fixture()]);
});

test('same content in separate checkouts shares blobs but keeps isolated heads',async t=>{
  const paths=await sandbox(t);
  const checkout2=join(paths.checkoutRoot,'..','other-checkout');
  await mkdir(checkout2);
  const a=new CodeGraphStore(paths),b=new legacy.CodeGraphStore({...paths,checkoutRoot:checkout2});
  const first=await a.publish({expectedHead:null,files:[fixture()]});
  const second=await b.publish({expectedHead:null,files:[fixture()]});
  assert.notEqual(first.snapshotId,second.snapshotId);
  assert.equal((await readdir(join(paths.indexRoot,'objects'))).length,1);
  assert.equal((await a.read()).snapshotId,first.snapshotId);
  assert.equal((await b.read()).snapshotId,second.snapshotId);
});
