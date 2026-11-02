import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectLanguage, fileFactsFromTree, parserCacheIdentity } from '../src/parser/contract.mjs';
import { extractWithRealGrammar, getRealParserIdentity } from '../src/parser/runtime.mjs';
import { prepareTreeSitterProvider } from '../src/parser/provider.mjs';
import * as previousContract from '../spikes/m1.3/src/contract.mjs';
import * as previousRuntime from '../spikes/m1.3/src/runtime.mjs';
import * as previousProvider from '../spikes/m1.5/src/tree-sitter-provider.mjs';

test('canonical parser exports remain identical to prior experimental imports', () => {
  assert.equal(detectLanguage, previousContract.detectLanguage);
  assert.equal(fileFactsFromTree, previousContract.fileFactsFromTree);
  assert.equal(parserCacheIdentity, previousContract.parserCacheIdentity);
  assert.equal(extractWithRealGrammar, previousRuntime.extractWithRealGrammar);
  assert.equal(getRealParserIdentity, previousRuntime.getRealParserIdentity);
  assert.equal(prepareTreeSitterProvider, previousProvider.prepareTreeSitterProvider);
});

test('canonical contract keeps deterministic cache identities and language classification', () => {
  for (const [file, language] of [['a.php','php'],['one.ts','typescript'],['view.tsx','tsx'],['unknown.go',null]]) {
    assert.equal(detectLanguage(file),language);
  }
  const descriptor={runtime:'0.27.1',grammar:'fixed-grammar-hash',schemaVersion:1,extractor:'fixed-extractor-hash'};
  assert.equal(parserCacheIdentity('php',descriptor),parserCacheIdentity('php',{...descriptor}));
  assert.notEqual(parserCacheIdentity('php',descriptor),parserCacheIdentity('php',{...descriptor,extractor:'next'}));
});

test('core imports the canonical provider and the legacy files only re-export', () => {
  const core=readFileSync(new URL('../src/core.mjs',import.meta.url),'utf8');
  assert.match(core,/from ['"]\.\/parser\/provider\.mjs['"]/);
  for (const [relative,destination] of [
    ['../spikes/m1.3/src/contract.mjs','../../../src/parser/contract.mjs'],
    ['../spikes/m1.3/src/runtime.mjs','../../../src/parser/runtime.mjs'],
    ['../spikes/m1.5/src/tree-sitter-provider.mjs','../../../src/parser/provider.mjs']
  ]) {
    const code=readFileSync(new URL(relative,import.meta.url),'utf8');
    assert.match(code,new RegExp(`^export \\* from ['"]${destination.replaceAll('.','\\.')}['"];?\\s*$`));
  }
});
