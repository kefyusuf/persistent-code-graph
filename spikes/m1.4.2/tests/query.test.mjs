import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, utimes, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CodeGraphStore } from '../../m1.4/src/store.mjs';
import { refreshFileFacts, fixtureExtractor } from '../../m1.4.1/src/refresh.mjs';
import { experimentalIdentity, experimentalExtract } from '../../m1.4.1/src/experimental-adapter.mjs';
import { verifiedQuery } from '../src/query.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const id = language => sha('fixture-parser:' + language);
const git = (repo,...args) => execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
async function env(t) {
 const dir = await mkdtemp(join(tmpdir(), 'pcg-read-'));
 const repo = join(dir,'repo'), indexRoot = join(dir,'index');
 await mkdir(repo); git(repo,'init','-q');git(repo,'config','user.name','Fixture');git(repo,'config','user.email','fixture@example.invalid');
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const put = (file,source)=>writeFile(join(repo,file),source);
 const refresh = (extract=fixtureExtractor, parserIdentity=id)=>refreshFileFacts({checkoutRoot:repo,indexRoot,extract,parserIdentity});
 const query = (args={})=>verifiedQuery({checkoutRoot:repo,indexRoot,parserIdentity:id, ...args});
 return {dir,repo,indexRoot,put,refresh,query};
}
const setupReal = async e => {
 await e.put('a.ts','interface Box { value: string }\ninterface Box { size: number }\nfunction ship() { return persist(1); }\nimport { save as persist } from "./service";');
 await e.put('b.php','<?php trait T { public function save() {} } class User { use T; }');
 await e.refresh(experimentalExtract,experimentalIdentity);
};

// RED: no src/query.mjs module exists until this implementation is delivered.
test('missing snapshot cannot pretend a repo has been indexed', async t => {
 const e=await env(t);await e.put('a.ts','interface X {}');
 const r=await e.query({operation:'status'});
 assert.equal(r.state,'missing');assert.equal(r.results.length,0);
});
test('explicit refresh + session-like reopen: verified symbols including merged TS declarations', async t=>{
 const e=await env(t);await setupReal(e);
 const r=await e.query({parserIdentity:experimentalIdentity,operation:'declarations',name:'Box'});
 assert.equal(r.state,'verified');assert.equal(r.results.length,2);
 assert.equal(r.coverage,'partial'); assert.ok(r.results.every(x=>x.file==='a.ts'&&x.symbolKind==='interface'));
 assert.equal(r.verification.method,'full-content-hash-double-scan');
});
test('verified names give exact matches, without guessing semantic relations', async t=>{
 const e=await env(t);await setupReal(e);
 const r=await e.query({parserIdentity:experimentalIdentity,operation:'declarations',name:'save'});
 assert.equal(r.state,'verified');assert.deepEqual(r.results.map(x=>x.symbolKind),['method']);
 assert.ok(r.results[0].range.startByte>=0);
});
test('unresolved call is present as observation, not resolved target', async t=>{
 const e=await env(t);await setupReal(e);
 const r=await e.query({parserIdentity:experimentalIdentity,operation:'references',role:'call'});
 assert.equal(r.state,'verified');assert.ok(r.results.some(x=>x.resolutionStatus==='unresolved'));
 assert.ok(r.results.every(x=>x.target===undefined));
});
test('warm no-op does not re-extract, and bounded query does not re-extract', async t=>{
 const e=await env(t);await e.put('a.ts','const x=1;'); let calls=0;
 const extract=async x=>{calls++;return fixtureExtractor(x)};
 await e.refresh(extract);await e.refresh(extract);
 const r=await e.query({operation:'status'});
 assert.equal(r.state,'verified');assert.equal(calls,1);
});
test('same-size, same-mtime edit rejects old facts at read boundary', async t=>{
 const e=await env(t);await e.put('a.ts','export const x=1;');await e.refresh();
 const date=new Date('2020-01-01T00:00:00Z');await utimes(join(e.repo,'a.ts'),date,date);
 await e.put('a.ts','export const x=2;');await utimes(join(e.repo,'a.ts'),date,date);
 const r=await e.query({operation:'declarations',name:'X'});
 assert.equal(r.state,'stale');assert.equal(r.results.length,0);assert.deepEqual(r.drift.changed,['a.ts']);
});
test('a newly added eligible untracked file makes the snapshot stale', async t=>{
 const e=await env(t);await e.put('a.ts','const a=1;');await e.refresh();await e.put('new.php','<?php');
 const r=await e.query({operation:'status'});
 assert.equal(r.state,'stale');assert.deepEqual(r.drift.added,['new.php']);
});
test('deleted file makes stored symbols unavailable without leaking old results',async t=>{
 const e=await env(t);await setupReal(e);await rm(join(e.repo,'b.php'));
 const r=await e.query({parserIdentity:experimentalIdentity,operation:'declarations',name:'save'});
 assert.equal(r.state,'stale');assert.deepEqual(r.results,[]);assert.deepEqual(r.drift.removed,['b.php']);
});
test('parser identity drift invalidates old facts without changing source',async t=>{
 const e=await env(t);await e.put('a.ts','const a=1;');await e.refresh();
 const r=await e.query({operation:'status',parserIdentity:()=>sha('upgraded-parser')});
 assert.equal(r.state,'stale');assert.deepEqual(r.drift.parserChanged,['a.ts']);
});
test('only metadata-only Git commit does not invalidate current content',async t=>{
 const e=await env(t);await e.put('a.ts','const a=1;');await e.refresh();
 git(e.repo,'add','a.ts');git(e.repo,'commit','-qm','source unchanged');
 const r=await e.query({operation:'status'});assert.equal(r.state,'verified');
});
test('query result count is bounded and deterministic in source order',async t=>{
 const e=await env(t);await setupReal(e);
 const r=await e.query({parserIdentity:experimentalIdentity,operation:'declarations',limit:1});
 assert.equal(r.state,'verified');assert.equal(r.results.length,1);assert.equal(r.truncated,true);
 const s=await e.query({parserIdentity:experimentalIdentity,operation:'declarations',limit:1});
 assert.deepEqual(r,s);
});
test('all searches report partial scope: no match is NOT proof of symbol absence',async t=>{
 const e=await env(t);await setupReal(e);
 const r=await e.query({parserIdentity:experimentalIdentity,operation:'declarations',name:'DoesNotExist'});
 assert.equal(r.state,'verified');assert.equal(r.results.length,0);assert.equal(r.coverage,'partial');
 assert.equal(r.noMatchMeans,'not-observed-in-indexed-subset');
});
test('rejects invalid query operations, result limits, and unbounded filters',async t=>{
 const e=await env(t);
 await assert.rejects(e.query({operation:'execute'}),{code:'INVALID_QUERY'});
 await assert.rejects(e.query({operation:'declarations',limit:100000}),{code:'INVALID_QUERY'});
 await assert.rejects(e.query({operation:'declarations',name:'x'.repeat(1025)}),{code:'INVALID_QUERY'});
});
test('mutation between initial verification and reply is detected and results withheld',async t=>{
 const e=await env(t);await setupReal(e);
 const r=await e.query({parserIdentity:experimentalIdentity,operation:'declarations',name:'Box',testBeforeFinalVerification:()=>e.put('a.ts','interface Replaced {}')});
 assert.equal(r.state,'stale');assert.deepEqual(r.results,[]);assert.deepEqual(r.drift.changed,['a.ts']);
});
test('head change during read does not return older search results',async t=>{
 const e=await env(t);await setupReal(e);
 const r=await e.query({parserIdentity:experimentalIdentity,operation:'declarations',testBeforeFinalVerification:async()=>{
   await e.put('c.php','<?php function extra() {}');
   await e.refresh(experimentalExtract,experimentalIdentity);
 }});
 assert.equal(r.state,'stale');assert.deepEqual(r.results,[]);
});
test('corruption is not converted into empty valid answer',async t=>{
 const e=await env(t);await e.put('a.ts','const a=1;');await e.refresh();
 const store=new CodeGraphStore({indexRoot:e.indexRoot,checkoutRoot:e.repo});
 const s=await store.read();await writeFile(join(e.indexRoot,'snapshots',s.snapshotId+'.json'),'{}');
 await assert.rejects(e.query({operation:'declarations'}),{code:'INTEGRITY_ERROR'});
});
test('status and read never mutate tracked or untracked source or index',async t=>{
 const e=await env(t);await e.put('a.ts','const a=1;');await e.refresh();
 const before=git(e.repo,'status','--porcelain=v1','--untracked-files=all');
 const indexBefore=await stat(join(e.indexRoot,'heads',(new CodeGraphStore({indexRoot:e.indexRoot,checkoutRoot:e.repo})).checkoutKey+'.json'));
 await e.query({operation:'status'});await e.query({operation:'declarations'});
 const after=git(e.repo,'status','--porcelain=v1','--untracked-files=all');
 const indexAfter=await stat(join(e.indexRoot,'heads',(new CodeGraphStore({indexRoot:e.indexRoot,checkoutRoot:e.repo})).checkoutKey+'.json'));
 assert.equal(after,before);assert.equal(indexAfter.mtimeMs,indexBefore.mtimeMs);
});
test('invalid encoding or scanner error is unknown/not verified, never index success',async t=>{
 const e=await env(t);await e.put('a.ts','const a=1;');await e.refresh();
 await writeFile(join(e.repo,'a.ts'),Buffer.from([0xff,0xfe,0xfd]));
 const r=await e.query({operation:'status'});
 assert.equal(r.state,'unknown');assert.equal(r.results.length,0);
});
test('query result byte budget suppresses oversized payload',async t=>{
 const e=await env(t);await setupReal(e);
 const r=await e.query({parserIdentity:experimentalIdentity,operation:'declarations',maxBytes:240});
 assert.equal(r.state,'verified');assert.ok(Buffer.byteLength(JSON.stringify(r.results))<=240);assert.equal(r.truncated,true);
});

test('reader must identify the current parser implementation to verify stored facts',async t=>{
 const e=await env(t);await e.put('a.ts','const a=1;');await e.refresh();
 await assert.rejects(verifiedQuery({checkoutRoot:e.repo,indexRoot:e.indexRoot,operation:'status'}),{code:'INVALID_QUERY'});
});
test('independent Node process reopens index and finds symbol without parsing',async t=>{
 const e=await env(t);await setupReal(e);
 const { spawnSync } = await import('node:child_process');
 const moduleUrl=new URL('../src/query.mjs',import.meta.url).href;
 const identityUrl=new URL('../../m1.4.1/src/experimental-adapter.mjs',import.meta.url).href;
 const code=`import {verifiedQuery} from ${JSON.stringify(moduleUrl)}; import {experimentalIdentity} from ${JSON.stringify(identityUrl)};\nconst result=await verifiedQuery({checkoutRoot:process.argv[1],indexRoot:process.argv[2],parserIdentity:experimentalIdentity,operation:'declarations',name:'Box'});console.log(JSON.stringify(result))`;
 const proc=spawnSync(process.execPath,['--input-type=module','-e',code,e.repo,e.indexRoot],{encoding:'utf8',timeout:10000});
 assert.equal(proc.status,0,proc.stderr);
 const result=JSON.parse(proc.stdout);assert.equal(result.state,'verified');assert.equal(result.results.length,2);
});
test('diagnostics coverage failure must never be promoted to partial success',async t=>{
 const e=await env(t);await e.put('broken.php','<?php class Broken {');
 const extract=async info=>({...await fixtureExtractor(info),coverage:{declarations:'failed',references:'partial',calls:'partial'},diagnostics:[{code:'SYNTAX_ERROR'}]});
 await e.refresh(extract);
 const result=await e.query({operation:'declarations'});
 assert.equal(result.state,'verified');assert.equal(result.coverage,'failed');
});
test('drift lists and total counts remain bounded on many added files',async t=>{
 const e=await env(t);await e.put('a.ts','const a=1;');await e.refresh();
 for(let i=0;i<35;i++)await e.put(`new${i}.php`,'<?php');
 const r=await e.query({operation:'status'});
 assert.equal(r.state,'stale');assert.equal(r.drift.added.length,25);assert.equal(r.driftCounts.added,35);assert.equal(r.driftTruncated,true);
});
test('reloading a changed gitignore policy invalidates the file manifest',async t=>{
 const e=await env(t);await e.put('a.ts','const a=1;');await e.put('b.ts','const b=1;');await e.refresh();
 await e.put('.gitignore','b.ts\n');
 const r=await e.query({operation:'status'});
 assert.equal(r.state,'stale');assert.deepEqual(r.drift.removed,['b.ts']);
});
test('file outline selects only declarations from that source file',async t=>{
 const e=await env(t);await setupReal(e);
 const r=await e.query({parserIdentity:experimentalIdentity,operation:'outline',file:'b.php'});
 assert.equal(r.state,'verified');assert.ok(r.results.length>0);
 assert.ok(r.results.every(x=>x.file==='b.php'));
 await assert.rejects(e.query({operation:'outline'}),{code:'INVALID_QUERY'});
});
test('import observations preserve alias and module, without inferring target symbol',async t=>{
 const e=await env(t);await setupReal(e);
 const r=await e.query({parserIdentity:experimentalIdentity,operation:'references',role:'import',spelling:'save'});
 assert.equal(r.state,'verified');assert.equal(r.results.length,1);
 assert.equal(r.results[0].alias,'persist');assert.equal(r.results[0].module,'./service');
 assert.equal(r.results[0].resolutionStatus,'unresolved');
});
