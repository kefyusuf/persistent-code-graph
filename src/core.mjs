/** M1.6 single orchestration owner (reuses verified M1.3-M1.5 components).
 * Read-only query and explicit refresh. No daemon, watcher, MCP or hidden fallback.
 * Provenance intentionally travels with every result: freshness != parser quality. */
import { resolve } from 'node:path';
import { refreshFileFacts } from './incremental/refresh.mjs';
import { verifiedQuery, verifiedQueryBatch } from '../spikes/m1.4.2/src/query.mjs';
import { prepareTreeSitterProvider } from './parser/provider.mjs';

const fail=(code,message)=>Object.assign(new Error(`${code}: ${message}`),{code});
const PROVIDER_TYPES=new Set(['experimental-temporary', 'real-tree-sitter-unvalidated']);

export function createFileFactsPipeline({checkoutRoot,indexRoot,provider}) {
 if(typeof checkoutRoot!=='string'||!checkoutRoot||typeof indexRoot!=='string'||!indexRoot)
   throw fail('INVALID_PIPELINE','checkoutRoot and indexRoot required');
 if(!provider || !PROVIDER_TYPES.has(provider.provenance) ||
    typeof provider.extract!=='function' || typeof provider.parserIdentity!=='function')
   throw fail('INVALID_PIPELINE','explicit provider with verifiable provenance required');
 const checkout=resolve(checkoutRoot),index=resolve(indexRoot);
 const label=provider.provenance;
 return Object.freeze({
   provenance:label,
   async refresh(options={}){
     if(options.beforeVerify!==undefined&&typeof options.beforeVerify!=='function')throw fail('INVALID_PIPELINE','invalid beforeVerify');
     const r=await refreshFileFacts({checkoutRoot:checkout,indexRoot:index,
       parserIdentity:provider.parserIdentity,extract:provider.extract,beforeVerify:options.beforeVerify});
     return {...r,parserProvenance:label,semanticGraph:false};
   },
   async query(operation,selectors={}){
     if(typeof selectors!=='object'||selectors===null||Array.isArray(selectors))
       throw fail('INVALID_PIPELINE','selectors must be an object');
     // Do not permit callers to override the identity or operation behind the boundary.
     const {parserIdentity:discardIdentity,operation:discardOperation,...safe}=selectors;
     if(discardIdentity!==undefined || discardOperation!==undefined)
       throw fail('INVALID_PIPELINE','parser identity and operation cannot be overridden');
     const r=await verifiedQuery({checkoutRoot:checkout,indexRoot:index,
       parserIdentity:provider.parserIdentity,operation,...safe});
     return {...r,parserProvenance:label,semanticGraph:false};
   },
   async queryBatch(requests,options={}){
     if(!options || typeof options!=='object' || Array.isArray(options) ||
        Object.keys(options).some(k=>!['maxTotalResultBytes','testBeforeFinalVerification'].includes(k)))
       throw fail('INVALID_PIPELINE','batch options cannot override parser identity or scope');
     const r=await verifiedQueryBatch({checkoutRoot:checkout,indexRoot:index,
       parserIdentity:provider.parserIdentity,requests,...options});
     return {...r,parserProvenance:label,semanticGraph:false};
   }
 });
}

/** Live entrypoint: fails closed if local pinned grammars are missing or unreadable. */
export async function createRealTreeSitterPipeline({checkoutRoot,indexRoot}){
 const provider=await prepareTreeSitterProvider(checkoutRoot);
 return createFileFactsPipeline({checkoutRoot,indexRoot,provider});
}
