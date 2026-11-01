import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CodeGraphStore, compareManifest, canonicalJSONString } from '../src/store.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');
const facts = (path='src/a.ts', source='function a() {}', lang='typescript') => ({
  file: path, language:lang, contentHash:hash(source),
  parser:{cacheIdentity:hash(`grammar:${lang}:v1`),kind:'fixture'},
  declarations:[{id:'d-1',kind:'function',name:'a',range:{startByte:0,endByte:source.length,startLine:1,endLine:1}}],
  references:[], relations:[], diagnostics:[],coverage:{declarations:'partial',references:'partial',calls:'partial'}
});
async function env(fn) {
 const base=await mkdtemp(join(tmpdir(),'codegraph-m14-'));
 const a=join(base,'repoA'),b=join(base,'repoB'),dir=join(base,'index');
 await mkdir(a);await mkdir(b);
 try{return await fn({base,a,b,dir});}finally{await rm(base,{recursive:true,force:true});}
}
const make = (dir,root,extra={}) => new CodeGraphStore({indexRoot:dir,checkoutRoot:root,...extra});

test('first publish survives new store instance and process-style reopen',async()=>env(async({dir,a})=>{
 const st=make(dir,a);
 assert.equal(await st.read(),null);
 const write=await st.publish({expectedHead:null,files:[facts()]});
 assert.match(write.snapshotId,/^[0-9a-f]{64}$/);
 const next=await make(dir,a).read();
 assert.equal(next.snapshotId,write.snapshotId);
 assert.equal(next.files[0].declarations[0].name,'a');
 assert.equal(next.freshness,'unknown');
}));

test('same input produces byte-stable snapshot and no new immutable objects',async()=>env(async({dir,a})=>{
 const st=make(dir,a);const f=facts();
 const x=await st.publish({expectedHead:null,files:[f]});
 const before=(await readdir(join(dir,'objects'))).sort();
 const y=await st.publish({expectedHead:x.snapshotId,files:[f]});
 assert.equal(y.snapshotId,x.snapshotId);assert.equal(y.unchanged,true);
 assert.deepEqual((await readdir(join(dir,'objects'))).sort(),before);
}));

test('one changed source creates only one new file-facts blob, reuses unchanged blob',async()=>env(async({dir,a})=>{
 const st=make(dir,a);const a1=facts('a.ts','function a(){}'),b1=facts('b.php','<?php function b(){}','php');
 const x=await st.publish({expectedHead:null,files:[a1,b1]});
 const first=(await readdir(join(dir,'objects'))).sort();
 const y=await st.publish({expectedHead:x.snapshotId,files:[facts('a.ts','function aa(){}'),b1]});
 const second=(await readdir(join(dir,'objects'))).sort();
 assert.equal(second.length,first.length+1);
 assert.deepEqual((await st.read()).files.map(v=>v.file),['a.ts','b.php']);
 assert.equal(y.unchanged,false);
}));

test('a failed commit leaves the last good snapshot readable',async()=>env(async({dir,a})=>{
 const st=make(dir,a);
 const x=await st.publish({expectedHead:null,files:[facts()]});
 const broken=make(dir,a,{failPoint:'after-snapshot'});
 await assert.rejects(broken.publish({expectedHead:x.snapshotId,files:[facts('src/a.ts','changed')] }),/INJECTED_FAILURE/);
 const loaded=await make(dir,a).read();
 assert.equal(loaded.snapshotId,x.snapshotId);
 assert.equal(loaded.files[0].contentHash,facts().contentHash);
}));

test('a tampered object is rejected, not accepted silently',async()=>env(async({dir,a})=>{
 const st=make(dir,a);await st.publish({expectedHead:null,files:[facts()]});
 const objects=await readdir(join(dir,'objects'));
 assert.equal(objects.length,1);
 await writeFile(join(dir,'objects',objects[0]),'{}');
 await assert.rejects(st.read(),/INTEGRITY_ERROR/);
}));

test('an invalid/corrupted head is rejected, not treated as no index',async()=>env(async({dir,a})=>{
 const st=make(dir,a);await st.publish({expectedHead:null,files:[facts()]});
 const files=await readdir(join(dir,'heads'));
 await writeFile(join(dir,'heads',files[0]),'not json');
 await assert.rejects(st.read(),/INTEGRITY_ERROR/);
}));

test('compare-and-swap forbids overwriting from a stale writer',async()=>env(async({dir,a})=>{
 const st=make(dir,a);const one=await st.publish({expectedHead:null,files:[facts()]});
 const two=await st.publish({expectedHead:one.snapshotId,files:[facts('src/a.ts','changed')]});
 await assert.rejects(st.publish({expectedHead:one.snapshotId,files:[facts('src/a.ts','another')]}),/HEAD_CONFLICT/);
 assert.equal((await st.read()).snapshotId,two.snapshotId);
}));

test('two worktrees have different heads even with one shared object cache',async()=>env(async({dir,a,b})=>{
 const one=make(dir,a),two=make(dir,b);
 const x=await one.publish({expectedHead:null,files:[facts()]});
 const y=await two.publish({expectedHead:null,files:[facts()]});
 assert.notEqual(x.snapshotId,y.snapshotId);
 assert.equal((await one.read()).snapshotId,x.snapshotId);
 assert.equal((await two.read()).snapshotId,y.snapshotId);
 assert.equal((await readdir(join(dir,'objects'))).length,1);
}));

test('rejects duplicate and path-traversal file manifests',async()=>env(async({dir,a})=>{
 const st=make(dir,a);
 await assert.rejects(st.publish({expectedHead:null,files:[facts('../escape.ts')]}),/INVALID_PATH/);
 await assert.rejects(st.publish({expectedHead:null,files:[facts('x.ts'),facts('x.ts')]}),/DUPLICATE_FILE/);
}));

test('manifest diff recognizes changed, added, removed; only hash proves same content',async()=>{
 const before=[{file:'a.ts',contentHash:hash('AA')},{file:'b.php',contentHash:hash('BB')}];
 const after=[{file:'a.ts',contentHash:hash('A!')},{file:'c.py',contentHash:hash('CC')}];
 assert.deepEqual(compareManifest(before,after),{added:['c.py'],changed:['a.ts'],removed:['b.php'],unchanged:[]});
 assert.deepEqual(compareManifest(before,before),{added:[],changed:[],removed:[],unchanged:['a.ts','b.php']});
});

test('no freshness claim is generated merely by loading persistent index',async()=>env(async({dir,a})=>{
 const st=make(dir,a);const x=await st.publish({expectedHead:null,files:[facts()]});
 const v=await st.read();
 assert.equal(v.freshness,'unknown');
 assert.equal(v.snapshotId,x.snapshotId);
 assert.equal('verified' in v,false);
}));

test('canonical serializer sorts object keys while preserving array order',()=>{
 assert.equal(canonicalJSONString({z:1,a:{b:2,a:1}}),'{"a":{"a":1,"b":2},"z":1}');
 assert.equal(canonicalJSONString([2,1]),'[2,1]');
});

test('exclusive writer lock fails closed if a previous writer has not released it',async()=>env(async({dir,a})=>{
 const st=make(dir,a);await st.publish({expectedHead:null,files:[facts()]});
 const locks=join(dir,'locks');
 const names=await readdir(join(dir,'heads'));const slot=names[0].replace(/\.json$/,'');
 await mkdir(join(locks,slot+'.lock'));
 await assert.rejects(st.publish({expectedHead:(await st.read()).snapshotId,files:[facts('x.ts')]}),/WRITER_LOCKED/);
}));

test('publication rejects mismatched parser key or invalid content hash',async()=>env(async({dir,a})=>{
 const st=make(dir,a);const bad=facts();bad.contentHash='incorrect';
 await assert.rejects(st.publish({expectedHead:null,files:[bad]}),/INVALID_FILE_FACT/);
 const bad2=facts();bad2.parser.cacheIdentity='';
 await assert.rejects(st.publish({expectedHead:null,files:[bad2]}),/INVALID_FILE_FACT/);
}));

test('changing only parser cache identity invalidates the file manifest',()=>{
 const old=facts();const newer={...old,parser:{...old.parser,cacheIdentity:hash('grammar:typescript:v2')}};
 assert.deepEqual(compareManifest([old],[newer]),{added:[],changed:['src/a.ts'],removed:[],unchanged:[]});
});

test('corrupted snapshot manifest is detected and prior data is not fabricated',async()=>env(async({dir,a})=>{
 const st=make(dir,a);const x=await st.publish({expectedHead:null,files:[facts()]});
 await writeFile(join(dir,'snapshots',`${x.snapshotId}.json`),'{"missing":"data"}');
 await assert.rejects(st.read(),/INTEGRITY_ERROR/);
}));

test('deleted files are absent from newly published snapshots, old snapshots remain immutable',async()=>env(async({dir,a})=>{
 const st=make(dir,a),a1=facts('a.ts'),b1=facts('b.ts');
 const old=await st.publish({expectedHead:null,files:[a1,b1]});
 const next=await st.publish({expectedHead:old.snapshotId,files:[a1]});
 assert.notEqual(old.snapshotId,next.snapshotId);
 assert.deepEqual((await st.read()).files.map(x=>x.file),['a.ts']);
 assert.ok((await readFile(join(dir,'snapshots',`${old.snapshotId}.json`),'utf8')).includes('b.ts'));
}));

test('storage cannot be initialized inside checkout source tree',async()=>env(async({a})=>{
 assert.throws(()=>make(join(a,'.codegraph'),a),/INVALID_STORE/);
}));
