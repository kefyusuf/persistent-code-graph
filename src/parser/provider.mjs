/** Real grammar provider: no fallback to the M1.2 temporary parser.
 * This module is not a claim that M1.3 has passed: only execution of the pinned
 * grammars and integration tests can establish compatibility. */
import { inventoryGitCheckout } from '../incremental/inventory.mjs';
import { getRealParserIdentity, extractWithRealGrammar } from './runtime.mjs';

const problem=(code,message)=>Object.assign(new Error(`${code}: ${message}`),{code});

export async function prepareTreeSitterProvider(checkoutRoot){
  const inventory=await inventoryGitCheckout(checkoutRoot);
  const languages=[...new Set(inventory.files.map(f=>f.language))].sort();
  const identities=new Map();
  // The checkout can gain a new supported language after openCodeGraph().
  // Prepare identities for each refresh's *current* inventory, not only startup files.
  async function prepareLanguages(languages){
    for(const language of [...new Set(languages)].sort()){
      if(!['php','typescript','tsx'].includes(language))throw problem('UNSUPPORTED_PARSER',language);
      if(!identities.has(language)){
        const identity=await getRealParserIdentity(language);
        identities.set(language,identity.cacheIdentity);
      }
    }
  }
  await prepareLanguages(languages);
  return Object.freeze({
    provenance:'real-tree-sitter-unvalidated',
    prepareLanguages,
    parserIdentity(language){
      const id=identities.get(language);
      if(!id)throw problem('UNPREPARED_LANGUAGE',language);
      return id;
    },
    async extract({file,language,source,cacheIdentity}){
      if(identities.get(language)!==cacheIdentity)throw problem('PARSER_IDENTITY_DRIFT',language);
      const result=await extractWithRealGrammar(language,file,source);
      if(result.parser.cacheIdentity!==cacheIdentity)throw problem('PARSER_IDENTITY_DRIFT',language);
      return result;
    }
  });
}
