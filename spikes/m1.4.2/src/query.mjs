/**
 * M1.4.2 — explicit, read-only, point-in-time verified file-fact queries.
 * Not a semantic graph, not an auto-indexer, not an MCP server.
 * Whole-file source bytes are rehashed twice; no source code is returned.
 */
import { CodeGraphStore } from '../../m1.4/src/store.mjs';
import { inventoryGitCheckout } from '../../m1.4.1/src/inventory.mjs';

const err = (code, message) => Object.assign(new Error(`${code}: ${message}`), { code });
const compareUtf8=(a,b)=>Buffer.compare(Buffer.from(a,'utf8'),Buffer.from(b,'utf8'));
const emptyDrift=()=>({added:[],changed:[],removed:[],parserChanged:[]});
const DEFAULT_LIMIT=12;
const MAX_LIMIT=25;
const DEFAULT_BYTES=4096;
const MAX_BYTES=16384;
const MAX_DRIFT_PATHS=25;
const ALLOWED=new Set(['status','declarations','references','outline']);

function optionsValid(o) {
 if(!ALLOWED.has(o.operation??'status'))throw err('INVALID_QUERY','unsupported operation');
 for(const k of ['name','kind','role','file','spelling'])
  if(o[k]!==undefined && (typeof o[k]!=='string'||!o[k]||Buffer.byteLength(o[k])>1024||o[k].includes('\0')))
   throw err('INVALID_QUERY',`invalid ${k} filter`);
 if(o.limit!==undefined && (!Number.isInteger(o.limit)||o.limit<1||o.limit>MAX_LIMIT))throw err('INVALID_QUERY','limit must be 1..25');
 if(o.maxBytes!==undefined && (!Number.isInteger(o.maxBytes)||o.maxBytes<240||o.maxBytes>MAX_BYTES))throw err('INVALID_QUERY','maxBytes must be 240..16384');
 if(typeof o.parserIdentity!=='function')throw err('INVALID_QUERY','parserIdentity is required for verified reads');
 if(o.operation==='outline' && !o.file)throw err('INVALID_QUERY','outline requires a file selector');
 if(o.testBeforeFinalVerification!==undefined && typeof o.testBeforeFinalVerification!=='function')throw err('INVALID_QUERY','test hook must be a function');
}
function boundedDrift(drift){
 const counts=Object.fromEntries(Object.entries(drift).map(([key,a])=>[key,a.length]));
 const out={};
 for(const [key,list] of Object.entries(drift))out[key]=list.slice(0,MAX_DRIFT_PATHS);
 return {drift:out,driftCounts:counts,driftTruncated:Object.values(counts).some(n=>n>MAX_DRIFT_PATHS)};
}
function detectDrift(files, inv, parserIdentity) {
 const prior=new Map(files.map(f=>[f.file,f]));
 const live=new Set();
 const drift=emptyDrift();
 for(const f of inv.files){
   live.add(f.file);
   const old=prior.get(f.file);
   if(!old){drift.added.push(f.file);continue;}
   if(old.contentHash!==f.contentHash||old.language!==f.language){drift.changed.push(f.file);continue;}
   if(typeof parserIdentity==='function'){
     const current=parserIdentity(f.language);
     if(typeof current!=='string'||!/^[0-9a-f]{64}$/.test(current))throw err('INVALID_PARSER_IDENTITY',f.language);
     if(current!==old.parser?.cacheIdentity)drift.parserChanged.push(f.file);
   }
 }
 for(const f of prior.keys())if(!live.has(f))drift.removed.push(f);
 for(const values of Object.values(drift))values.sort(compareUtf8);
 return drift;
}
const clean=d=>Object.values(d).every(a=>a.length===0);
function aggregateCoverage(files) {
 if(files.length===0)return 'not-evaluated';
 const cover=files.flatMap(f=>['declarations','references','calls'].map(k=>f.coverage?.[k]??'not-evaluated'));
 if(cover.includes('failed'))return 'failed';
 if(cover.includes('not-evaluated'))return 'not-evaluated';
 return 'partial'; // This spike cannot prove completeness.
}
function visible(record, file, language, kind) {
 const range=record.range??{};
 const v={file,language,kind,range:{
   startByte:range.startByte??null,endByte:range.endByte??null,
   startLine:range.startLine??null,endLine:range.endLine??null,
 }};
 if(kind==='declaration'){
  v.name=record.name??null;v.symbolKind=record.kind??null;
 }else{
  v.spelling=record.spelling??null;v.role=record.role??null;
  if(record.alias!==undefined)v.alias=record.alias;
  if(record.module!==undefined)v.module=record.module;
  // No call target has been resolved in this prototype.
  v.resolutionStatus='unresolved';
 }
 return v;
}
function queryRecords(files,opts) {
 const op=opts.operation??'status';
 if(op==='status')return [];
 const all=[];
 for(const f of files) {
  if(opts.file && opts.file!==f.file)continue;
  const group=op==='references'?f.references:f.declarations;
  for(const r of group){
   if(op==='references'){
     if(opts.role && r.role!==opts.role)continue;
     if(opts.spelling && r.spelling!==opts.spelling)continue;
   }else{
     if(opts.name && r.name!==opts.name)continue;
     if(opts.kind && r.kind!==opts.kind)continue;
   }
   all.push(visible(r,f.file,f.language,op==='references'?'reference':'declaration'));
  }
 }
 all.sort((a,b)=>compareUtf8(a.file,b.file)||a.range.startByte-b.range.startByte||compareUtf8(a.name??a.spelling??'',b.name??b.spelling??''));
 return all;
}
function capResults(matches,opts){
 const limit=opts.limit??DEFAULT_LIMIT, maxBytes=opts.maxBytes??DEFAULT_BYTES;
 const results=[];
 for(const match of matches){
   if(results.length>=limit || Buffer.byteLength(JSON.stringify([...results,match]),'utf8')>maxBytes)break;
   results.push(match);
 }
 return {results,truncated:results.length<matches.length};
}
function base(state,snapshotId=null){return {state,snapshotId,results:[],truncated:false,coverage:'not-evaluated',noMatchMeans:'not-observed-in-indexed-subset'};}
/**
 * @param {Object} opts root paths, parser identity function, operation and bounded filters.
 * This is synchronous in *meaning*, not in filesystem execution: returned VERIFIED
 * means two matching full-content scans during this invocation, not future currency.
 * Optional testBeforeFinalVerification is a deterministic test seam, not public API.
 */
export async function verifiedQuery(opts){
 if(!opts || typeof opts!=='object')throw err('INVALID_QUERY','options required');
 optionsValid(opts);
 const store=new CodeGraphStore({indexRoot:opts.indexRoot,checkoutRoot:opts.checkoutRoot});
 const prior=await store.read();
 if(!prior)return base('missing');
 const snapshotId=prior.snapshotId;
 const check=async()=>{
  try {return {inventory:await inventoryGitCheckout(opts.checkoutRoot)};}
  catch(e){return {errorCode:e.code??'SOURCE_VERIFICATION_FAILED'};}
 };
 const first=await check();
 if(first.errorCode)return {...base('unknown',snapshotId),reasonCode:first.errorCode};
 const drift1=detectDrift(prior.files,first.inventory,opts.parserIdentity);
 if(!clean(drift1))return {...base('stale',snapshotId),...boundedDrift(drift1)};
 const records=queryRecords(prior.files,opts);
 const result=capResults(records,opts);
 if(opts.testBeforeFinalVerification)await opts.testBeforeFinalVerification();
 const final=await check();
 if(final.errorCode)return {...base('unknown',snapshotId),reasonCode:final.errorCode};
 const newest=await store.read();
 if(!newest || newest.snapshotId!==snapshotId){
   const d=detectDrift(prior.files,final.inventory,opts.parserIdentity);
   return {...base('stale',snapshotId),reasonCode:'INDEX_HEAD_CHANGED',...boundedDrift(d)};
 }
 const drift2=detectDrift(prior.files,final.inventory,opts.parserIdentity);
 // Also catches changes between the two scans even if they return to the old hash
 // only insofar as they were observable in either scan.
 if(!clean(drift2))return {...base('stale',snapshotId),...boundedDrift(drift2)};
 const initialFiles=first.inventory.files.map(f=>[f.file,f.language,f.contentHash]);
 const finalFiles=final.inventory.files.map(f=>[f.file,f.language,f.contentHash]);
 if(JSON.stringify(initialFiles)!==JSON.stringify(finalFiles))
  return {...base('stale',snapshotId),reasonCode:'INVENTORY_CHANGED_DURING_QUERY'};
 return {
  state:'verified',snapshotId,
  verification:{method:'full-content-hash-double-scan',assurance:'point-in-time-only'},
  coverage:aggregateCoverage(prior.files),
  noMatchMeans:'not-observed-in-indexed-subset',
  ...result,
 };
}

/**
 * M1.5.1 — one bounded, source-verified read for several independent lookups.
 * No intermediate result can escape until the second whole-content verification.
 * This is deliberately a one-shot batch, never an across-turn freshness cache.
 */
export async function verifiedQueryBatch(opts) {
 if(!opts || typeof opts!=='object' || Array.isArray(opts))throw err('INVALID_BATCH','options required');
 const requests=opts.requests;
 if(!Array.isArray(requests) || requests.length<1 || requests.length>8)
   throw err('INVALID_BATCH','requests length must be 1..8');
 const maxTotalResultBytes=opts.maxTotalResultBytes??8192;
 if(!Number.isInteger(maxTotalResultBytes) || maxTotalResultBytes<240 || maxTotalResultBytes>32768)
   throw err('INVALID_BATCH','maxTotalResultBytes must be 240..32768');
 optionsValid({parserIdentity:opts.parserIdentity});
 const allowed=new Set(['operation','name','kind','role','file','spelling','limit','maxBytes']);
 for(const req of requests) {
   if(!req || typeof req!=='object' || Array.isArray(req))throw err('INVALID_BATCH','request must be an object');
   for(const key of Object.keys(req))if(!allowed.has(key))throw err('INVALID_BATCH',`unsupported request property: ${key}`);
   optionsValid({...req,parserIdentity:opts.parserIdentity});
 }
 if(opts.testBeforeFinalVerification!==undefined && typeof opts.testBeforeFinalVerification!=='function')
   throw err('INVALID_BATCH','invalid test hook');
 const blank=(state,snapshotId=null)=>({...base(state,snapshotId),queries:[]});
 const store=new CodeGraphStore({indexRoot:opts.indexRoot,checkoutRoot:opts.checkoutRoot});
 const prior=await store.read();
 if(!prior)return blank('missing');
 const snapshotId=prior.snapshotId;
 const check=async()=>{
  try{return {inventory:await inventoryGitCheckout(opts.checkoutRoot)};}
  catch(e){return {errorCode:e.code??'SOURCE_VERIFICATION_FAILED'};}
 };
 const first=await check();
 if(first.errorCode)return {...blank('unknown',snapshotId),reasonCode:first.errorCode};
 const drift1=detectDrift(prior.files,first.inventory,opts.parserIdentity);
 if(!clean(drift1))return {...blank('stale',snapshotId),...boundedDrift(drift1)};
 // Draft all responses in memory, but publish none until final verification.
 // Bound both per-request and across the entire batch, without reading source again.
 const draft=[];
 let remaining=maxTotalResultBytes-2*requests.length; // include the [] bytes of every result array
 let batchTruncated=false;
 for(const req of requests) {
  const matches=queryRecords(prior.files,req);
  const local=capResults(matches,req);
  const result=[];
  let spent=Buffer.byteLength('[]','utf8');
  for(const match of local.results) {
   const nextSize=Buffer.byteLength(JSON.stringify([...result,match]),'utf8');
   const cost=nextSize-spent;
   if(cost>remaining){batchTruncated=true;break;}
   result.push(match);spent=nextSize;remaining-=cost;
  }
  const truncated=local.truncated || result.length<local.results.length;
  if(truncated)batchTruncated=true;
  draft.push({operation:req.operation??'status',results:result,truncated});
 }
 if(opts.testBeforeFinalVerification)await opts.testBeforeFinalVerification();
 const final=await check();
 if(final.errorCode)return {...blank('unknown',snapshotId),reasonCode:final.errorCode};
 const newest=await store.read();
 if(!newest || newest.snapshotId!==snapshotId) {
  const drift=detectDrift(prior.files,final.inventory,opts.parserIdentity);
  return {...blank('stale',snapshotId),reasonCode:'INDEX_HEAD_CHANGED',...boundedDrift(drift)};
 }
 const drift2=detectDrift(prior.files,final.inventory,opts.parserIdentity);
 if(!clean(drift2))return {...blank('stale',snapshotId),...boundedDrift(drift2)};
 const initialFiles=first.inventory.files.map(f=>[f.file,f.language,f.contentHash]);
 const finalFiles=final.inventory.files.map(f=>[f.file,f.language,f.contentHash]);
 if(JSON.stringify(initialFiles)!==JSON.stringify(finalFiles))
   return {...blank('stale',snapshotId),reasonCode:'INVENTORY_CHANGED_DURING_QUERY'};
 return {state:'verified',snapshotId,
  verification:{method:'full-content-hash-double-scan',assurance:'point-in-time-only'},
  coverage:aggregateCoverage(prior.files),
  noMatchMeans:'not-observed-in-indexed-subset',
  queries:draft,batchTruncated};
}
