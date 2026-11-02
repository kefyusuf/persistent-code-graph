/** Demonstration only: M1.2 experimental extractors, NOT M1.3 Tree-sitter grammar gate. */
import { createHash } from 'node:crypto';
import { extract as m12Extract } from '../../m1.2/src/extract.mjs';
const hash = txt => createHash('sha256').update(txt).digest('hex');
export const experimentalIdentity = language => hash(`M1.2-temporary-extractor:${language}:contract-v1`);
export async function experimentalExtract({file,language,source,cacheIdentity}) {
 if (!['php','typescript'].includes(language)) throw Object.assign(new Error('M1.2_EXPERIMENTAL_DIALECT_UNSUPPORTED'),{code:'M1.2_EXPERIMENTAL_DIALECT_UNSUPPORTED'});
 const facts=m12Extract(language,file,source);
 return {...facts,parser:{kind:'m1.2-temporary',cacheIdentity,coverage:'partial'}};
}
