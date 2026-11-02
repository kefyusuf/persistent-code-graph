import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectLanguage, fileFactsFromTree, parserCacheIdentity } from './contract.mjs';

const pin = Object.freeze({runtime:'0.27.1',assets:'2.0.4'});
let runtimePromise;
const grammarLoads=new Map();
const sha = b=>createHash('sha256').update(b).digest('hex');
// A parser grammar alone does not identify our extraction semantics. Changes to
// the adapter code must invalidate cached facts even when source bytes match.
const extractorSha256=sha(Buffer.concat([readFileSync(new URL('./contract.mjs',import.meta.url)),readFileSync(new URL('./runtime.mjs',import.meta.url))]));

function verifyLocalPackage(name, expected){
  const manifest = new URL(`../node_modules/${name}/package.json`,import.meta.url);
  let p;
  try{p=JSON.parse(readFileSync(manifest,'utf8'));}catch(e){throw new Error(`MISSING_LOCAL_DEPENDENCIES: ${name}@${expected} unavailable; install pinned packages before running grammar gate`,{cause:e});}
  if(p.version!==expected)throw new Error(`VERSION_MISMATCH: ${name} expected ${expected} got ${p.version}`);
}

async function runtime(){
 if(!runtimePromise)runtimePromise=(async()=>{
   verifyLocalPackage('web-tree-sitter',pin.runtime);
   verifyLocalPackage('tree-sitter-wasm',pin.assets);
   const ts=await import('web-tree-sitter');
   const wasm=await import('tree-sitter-wasm');
   await ts.Parser.init();
   return {Parser:ts.Parser,Language:ts.Language,wasm};
 })();
 return runtimePromise;
}
export async function checkParserDependencies(){return runtime();}
async function grammarFor(language){
 if(!grammarLoads.has(language))grammarLoads.set(language,(async()=>{
  const {Language,wasm}=await runtime();
  // The installed package, not a remote CDN, supplies the binaries.
  const wasmPath=resolve(wasm.getWasmPath(language));
  const grammarBytes=readFileSync(wasmPath);
  return {grammar:await Language.load(wasmPath),grammarSha256:sha(grammarBytes)};
 })());
 return grammarLoads.get(language);
}
export async function extractWithRealGrammar(language,file,source){
 if(!['php','typescript','tsx'].includes(language)||detectLanguage(file)!==language)throw new Error('LANGUAGE_PATH_MISMATCH');
 const {Parser}=await runtime();
 const {grammar,grammarSha256}=await grammarFor(language);
 const parser = new Parser();
 let tree;
 try{
  parser.setLanguage(grammar);
  tree=parser.parse(source);
  if(!tree)throw new Error('TREE_SITTER_PARSE_RETURNED_NULL');
  const parserIdentity={
   kind:'tree-sitter-wasm',runtimeVersion:pin.runtime,assetVersion:pin.assets,grammarSha256,
   extractorSha256,cacheIdentity:parserCacheIdentity(language,{runtime:pin.runtime,grammar:grammarSha256,schemaVersion:1,extractor:extractorSha256})
  };
  return fileFactsFromTree(language,file,source,tree.rootNode,parserIdentity);
 }finally{tree?.delete?.();parser.delete?.();}
}

/** Return the actual loaded-grammar identity before a refresh decides cache reuse.
 * Does not guess from filenames or package version: the WASM bytes are hashed. */
export async function getRealParserIdentity(language){
 if(!['php','typescript','tsx'].includes(language))throw new Error('UNSUPPORTED_LANGUAGE:'+language);
 const {grammarSha256}=await grammarFor(language);
 return {
   kind:'tree-sitter-wasm',runtimeVersion:pin.runtime,assetVersion:pin.assets,grammarSha256,
   extractorSha256,cacheIdentity:parserCacheIdentity(language,{runtime:pin.runtime,grammar:grammarSha256,schemaVersion:1,extractor:extractorSha256})
 };
}
