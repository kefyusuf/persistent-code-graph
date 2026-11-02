/**
 * M1.4 experimental snapshot persistence; no parser, graph resolver, CLI/MCP,
 * repository scan, Git hooks or automatic freshness assertion.
 *
 * One atomic checkout head selects an immutable snapshot, which selects
 * content-addressed file-fact objects. No database/daemon required.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, open, readdir, rename, rm, stat } from 'node:fs/promises';
import { realpathSync, lstatSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const VERSION = 1;
const error = (code,message) => Object.assign(new Error(`${code}: ${message}`),{code});

/** Canonical JSON: stable object-key order, original array order, strict JSON values. */
export function canonicalJSONString(value) {
 const visiting = new Set();
 function visit(v) {
  if(v===null || typeof v==='string' || typeof v==='boolean')return v;
  if(typeof v==='number') {
    if(!Number.isFinite(v))throw error('INVALID_JSON','non-finite number');
    return v;
  }
  if(typeof v!=='object')throw error('INVALID_JSON',`unsupported value ${typeof v}`);
  if(visiting.has(v))throw error('INVALID_JSON','cyclic value');
  if(Array.isArray(v)) {visiting.add(v);const o=v.map(visit);visiting.delete(v);return o;}
  if(Object.getPrototypeOf(v)!==Object.prototype && Object.getPrototypeOf(v)!==null)
    throw error('INVALID_JSON','non-plain object');
  visiting.add(v);
  const o={};for(const k of Object.keys(v).sort())o[k]=visit(v[k]);
  visiting.delete(v);return o;
 }
 return JSON.stringify(visit(value));
}
/** Resolve existing symlink ancestors even if the target directory does not yet exist.
 * A lexical `resolve(indexRoot)` check alone can point outside the checkout while
 * the filesystem actually routes writes into it through a symlink. */
function prospectivePhysicalPath(target){
 let candidate=resolve(target);
 const missing=[];
 while(true){
  try {
   const physical=realpathSync(candidate);
   return resolve(physical,...missing.reverse());
  }catch(e){
   if(e.code!=='ENOENT')throw error('INVALID_STORE',`cannot resolve index root: ${e.code}`);
   // A dangling symlink is not an ordinary missing component. Do not guess
   // where an index would be written if a link target later appeared.
   try{lstatSync(candidate);throw error('INVALID_STORE','unresolved symlink in index root');}
   catch(statError){if(statError.code!=='ENOENT')throw statError;}
   const parent=dirname(candidate);
   if(parent===candidate)throw error('INVALID_STORE','cannot resolve index root');
   missing.push(basename(candidate));candidate=parent;
  }
 }
}
function isAtOrWithin(parent,child){
 const rel=relative(parent,child);
 return rel==='' || (rel!=='..' && !rel.startsWith('..'+sep) && !isAbsolute(rel));
}

function validatePath(path) {
 if(typeof path!=='string'||path.length===0||path.includes('\\')||path.includes('\0')||isAbsolute(path)||/^[A-Za-z]:/.test(path))
   throw error('INVALID_PATH',String(path));
 const parts=path.split('/');
 if(parts.some(x=>x===''||x==='.'||x==='..'))throw error('INVALID_PATH',path);
 return path;
}
function validateFacts(f) {
 if(!f || typeof f!=='object')throw error('INVALID_FILE_FACT','missing facts');
 validatePath(f.file);
 if(!HASH.test(f.contentHash??'')||typeof f.language!=='string'||!f.language||
    !HASH.test(f.parser?.cacheIdentity??'')||!Array.isArray(f.declarations)||
    !Array.isArray(f.references)||!Array.isArray(f.relations)||!Array.isArray(f.diagnostics)||
    !f.coverage ||typeof f.coverage!=='object')
   throw error('INVALID_FILE_FACT',f.file);
 return f;
}
function normalizeManifest(files) {
 if(!Array.isArray(files))throw error('INVALID_MANIFEST','expected files array');
 const items=files.map(f=>({file:validatePath(f.file),contentHash:f.contentHash,parserKey:f.parserCacheIdentity??f.parser?.cacheIdentity??null}));
 const seen=new Set();
 for(const f of items){
  if(seen.has(f.file))throw error('DUPLICATE_FILE',f.file);
  seen.add(f.file);
  if(!HASH.test(f.contentHash??''))throw error('INVALID_MANIFEST','invalid content hash');
 }
 return items.sort((a,b)=>Buffer.compare(Buffer.from(a.file,'utf8'),Buffer.from(b.file,'utf8')));
}
/** Hash-based manifest comparison, never stat-only freshness verification. */
export function compareManifest(before,after){
 const prev=new Map(normalizeManifest(before).map(f=>[f.file,[f.contentHash,f.parserKey]]));
 const curr=new Map(normalizeManifest(after).map(f=>[f.file,[f.contentHash,f.parserKey]]));
 const out={added:[],changed:[],removed:[],unchanged:[]};
 for(const [p,h] of curr) {
  if(!prev.has(p))out.added.push(p);
  else if(prev.get(p)[0]!==h[0]||prev.get(p)[1]!==h[1])out.changed.push(p);
  else out.unchanged.push(p);
 }
 for(const p of prev.keys())if(!curr.has(p))out.removed.push(p);
 for(const a of Object.values(out))a.sort();
 return out;
}

async function exists(path) {
 try {await stat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}
}
async function syncDir(dir){
 // Best-effort durability portability; not all host file systems permit syncing directories.
 let handle;try {handle=await open(dir,'r');await handle.sync();}
 catch(e){if(!['EINVAL','ENOTSUP','EISDIR','EPERM'].includes(e.code))throw e;}
 finally{await handle?.close();}
}
async function writeAtomic(target,bytes){
 const dir=dirname(target);
 await mkdir(dir,{recursive:true});
 const temp=join(dir,`.tmp-${randomUUID()}`);
 let fh;
 try{
  fh=await open(temp,'wx',0o600);await fh.writeFile(bytes,'utf8');await fh.sync();await fh.close();fh=null;
  await rename(temp,target);await syncDir(dir);
 }finally{await fh?.close();await rm(temp,{force:true});}
}
async function loadVerifiedJSON(path,expectedHash){
 let bytes;try{bytes=await readFile(path);}catch(e){throw error('INTEGRITY_ERROR',`cannot load ${path}: ${e.code}`);}
 if(expectedHash && hash(bytes)!==expectedHash)throw error('INTEGRITY_ERROR',`hash mismatch at ${path}`);
 try{return JSON.parse(bytes.toString('utf8'));}
 catch{throw error('INTEGRITY_ERROR',`invalid JSON at ${path}`);}
}
async function saveImmutable(directory,obj){
 const body=canonicalJSONString(obj);const id=hash(body);const dest=join(directory,`${id}.json`);
 await mkdir(directory,{recursive:true});
 if(await exists(dest)) {
  await loadVerifiedJSON(dest,id);
 }else{
  await writeAtomic(dest,body);
 }
 return id;
}

export class CodeGraphStore {
 constructor({indexRoot,checkoutRoot,failPoint=null}){
  if(!indexRoot ||!checkoutRoot)throw error('INVALID_STORE','indexRoot and checkoutRoot required');
  this.checkoutRoot=realpathSync(checkoutRoot);
  this.indexRoot=prospectivePhysicalPath(indexRoot);
  if(isAtOrWithin(this.checkoutRoot,this.indexRoot))
   throw error('INVALID_STORE','index root must be outside source checkout for M1.4');
  this.checkoutKey=hash(this.checkoutRoot);
  this.headPath=join(this.indexRoot,'heads',`${this.checkoutKey}.json`);
  this.objectsDir=join(this.indexRoot,'objects');
  this.snapshotsDir=join(this.indexRoot,'snapshots');
  this.lockPath=join(this.indexRoot,'locks',`${this.checkoutKey}.lock`);
  this.failPoint=failPoint;
 }
 async #head(){
  if(!await exists(this.headPath))return null;
  const h=await loadVerifiedJSON(this.headPath);
  if(h?.kind!=='codegraph.head'||h.version!==VERSION||h.checkoutKey!==this.checkoutKey||!HASH.test(h.snapshotId??''))
   throw error('INTEGRITY_ERROR','invalid head record');
  return h;
 }
 async #loadSnapshot(id){
  if(!HASH.test(id??''))throw error('INTEGRITY_ERROR','invalid snapshot ID');
  const s=await loadVerifiedJSON(join(this.snapshotsDir,`${id}.json`),id);
  if(s?.kind!=='codegraph.snapshot'||s.version!==VERSION||s.checkoutKey!==this.checkoutKey||!Array.isArray(s.files))
   throw error('INTEGRITY_ERROR','invalid snapshot structure');
  return s;
 }
 async read(){
  const h=await this.#head();if(!h)return null;
  const snapshot=await this.#loadSnapshot(h.snapshotId);
  const files=[];
  for(const ref of snapshot.files){
   validatePath(ref.file);
   if(!HASH.test(ref.objectId??''))throw error('INTEGRITY_ERROR','invalid fact object ID');
   const f=await loadVerifiedJSON(join(this.objectsDir,`${ref.objectId}.json`),ref.objectId);
   if(f.file!==ref.file||f.contentHash!==ref.contentHash||f.parser?.cacheIdentity!==ref.parserCacheIdentity)
    throw error('INTEGRITY_ERROR',`file manifest mismatch: ${ref.file}`);
   try{validateFacts(f);}catch{throw error('INTEGRITY_ERROR',`invalid facts: ${ref.file}`);}
   files.push(f);
  }
  return {snapshotId:h.snapshotId,checkoutKey:this.checkoutKey,files,freshness:'unknown'};
 }
 async publish({expectedHead,files}){
  if(expectedHead!==null && !HASH.test(expectedHead??''))throw error('INVALID_EXPECTED_HEAD','explicit expectedHead required');
  if(!Array.isArray(files))throw error('INVALID_MANIFEST','files array required');
  const ready=files.map(validateFacts).sort((a,b)=>Buffer.compare(Buffer.from(a.file,'utf8'),Buffer.from(b.file,'utf8')));
  normalizeManifest(ready); // validate uniqueness and stable ordering
  await mkdir(join(this.indexRoot,'locks'),{recursive:true});
  try{await mkdir(this.lockPath);}catch(e){
   if(e.code==='EEXIST')throw error('WRITER_LOCKED',`active or orphaned writer lock at ${this.lockPath}`);
   throw e;
  }
  try{
   const head=await this.#head();
   if((head?.snapshotId??null)!==expectedHead)
    throw error('HEAD_CONFLICT',`expected ${expectedHead} observed ${head?.snapshotId??'null'}`);
   const refs=[];
   for(const f of ready){
    const objectId=await saveImmutable(this.objectsDir,f);
    refs.push({file:f.file,contentHash:f.contentHash,parserCacheIdentity:f.parser.cacheIdentity,objectId});
   }
   const snapshot={kind:'codegraph.snapshot',version:VERSION,checkoutKey:this.checkoutKey,files:refs};
   const snapshotId=await saveImmutable(this.snapshotsDir,snapshot);
   if(snapshotId===head?.snapshotId)return {snapshotId,unchanged:true};
   if(this.failPoint==='after-snapshot')throw error('INJECTED_FAILURE','before head publication');
   await writeAtomic(this.headPath,canonicalJSONString({kind:'codegraph.head',version:VERSION,checkoutKey:this.checkoutKey,snapshotId}));
   return {snapshotId,unchanged:false};
  }finally{
   await rm(this.lockPath,{recursive:true,force:true});
  }
 }
}
