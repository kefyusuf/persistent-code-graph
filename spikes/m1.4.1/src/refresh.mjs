/** Explicit, parser-neutral refresh trial. A production parser is deliberately NOT included. */
import { inventoryGitCheckout, verifySourceInventory } from './inventory.mjs';
import { CodeGraphStore } from '../../../src/storage/store.mjs';
import { createHash } from 'node:crypto';
const sha = b => createHash('sha256').update(b).digest('hex');
const invalid = (code,msg)=>Object.assign(new Error(`${code}: ${msg}`),{code});

/**
 * @param {{checkoutRoot: string,indexRoot:string,parserIdentity:(language:string)=>string,
 * extract:(input:{file:string,language:string,source:string,contentHash:string,cacheIdentity:string})=>Promise<object>,
 * beforeVerify?:()=>Promise<void>}} options
 * - No hooks, watchers, background jobs, graph edge resolution, or grammar claims.
 * - Always hashes eligible files on each refresh (I/O != parsing).
 */
export async function refreshFileFacts({checkoutRoot,indexRoot,parserIdentity,extract,beforeVerify}) {
 if(typeof parserIdentity!=='function'||typeof extract!=='function')throw invalid('INVALID_REFRESH','parserIdentity and extract callbacks required');
 const initial=await inventoryGitCheckout(checkoutRoot);
 const store=new CodeGraphStore({indexRoot,checkoutRoot:initial.root});
 const prior=await store.read();
 const old=new Map(prior?.files.map(x=>[x.file,x])??[]);
 const next=[];
 const counts={added:0,changed:0,reused:0,removed:0,parsed:0};
 const nowSet=new Set(initial.files.map(x=>x.file));
 for(const file of old.keys())if(!nowSet.has(file))counts.removed++;
 for(const f of initial.files) {
  const cacheIdentity=parserIdentity(f.language);
  if(!/^[a-f0-9]{64}$/.test(cacheIdentity))throw invalid('INVALID_PARSER_IDENTITY',f.language);
  const previous=old.get(f.file);
  if(previous && previous.contentHash===f.contentHash && previous.parser.cacheIdentity===cacheIdentity && previous.language===f.language) {
   next.push(previous);counts.reused++;continue;
  }
  const source=new TextDecoder('utf-8',{fatal:true}).decode(f.bytes);
  let extracted=await extract({file:f.file,language:f.language,source,contentHash:f.contentHash,cacheIdentity});
  if(!extracted || typeof extracted!=='object' || Array.isArray(extracted))throw invalid('INVALID_EXTRACTION','expected fact record');
  const facts={...extracted,file:f.file,language:f.language,contentHash:f.contentHash,parser:{...extracted.parser,cacheIdentity}};
  if(!Array.isArray(facts.declarations)||!Array.isArray(facts.references)||!Array.isArray(facts.relations)||!Array.isArray(facts.diagnostics)||!facts.coverage)throw invalid('INVALID_EXTRACTION',f.file);
  if(facts.relations.length)throw invalid('RELATIONS_NOT_SUPPORTED','relationship resolution has not been implemented');
  next.push(facts);
  if(previous)counts.changed++;else counts.added++;
  counts.parsed++;
 }
 if(beforeVerify)await beforeVerify();
 const verification=await verifySourceInventory(initial);
 // Every snapshot reads from a specific, fully hashed working-tree inventory.
 // Another edit after this check can still make it stale; there is no continuous freshness claim.
 const publication=await store.publish({expectedHead:prior?.snapshotId??null,files:next});
 const state=await store.read();
 // Reopening proves persisted content, not current working-tree freshness.
 return {snapshotId:publication.snapshotId,unchanged:publication.unchanged,counts,verification,freshness:'content-hash-verified-before-publication',storedFiles:state.files.length};
}

/** A deterministic fake extractor only for exercising storage/inventory boundaries. */
export async function fixtureExtractor({file,language,source,cacheIdentity}) {
 const contentHash=sha(Buffer.from(source,'utf8'));
 return {file,language,contentHash,parser:{cacheIdentity},
   declarations:[],references:[],relations:[],diagnostics:[],coverage:{declarations:'not-evaluated',references:'not-evaluated',calls:'not-evaluated'}};
}
