import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, cp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const project = resolve(new URL('..', import.meta.url).pathname);
const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const lock = () => JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));

test('root package owns exact parser dependencies and an auditable lockfile', () => {
  const expected = { 'web-tree-sitter': '0.27.1', 'tree-sitter-wasm': '2.0.4' };
  assert.deepEqual(rootPackage.dependencies, expected);
  const l = lock();
  assert.equal(l.lockfileVersion, 3);
  assert.equal(l.name, rootPackage.name);
  assert.deepEqual(l.packages[''].dependencies, expected);
  for (const [name, version] of Object.entries(expected)) {
    assert.equal(l.packages[`node_modules/${name}`].version, version);
    assert.match(l.packages[`node_modules/${name}`].integrity, /^sha512-/);
  }
});

test('production source import graph and assets have no spikes dependency', () => {
  const srcDir = new URL('../src/', import.meta.url);
  const walk = url => {
    for (const e of readdirSync(url, { withFileTypes: true })) {
      const path = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, url);
      if (e.isDirectory()) walk(path);
      else if (e.name.endsWith('.mjs')) {
        const s = readFileSync(path, 'utf8');
        assert.doesNotMatch(s, /(?:\.\.\/)*spikes\//, e.name);
        assert.doesNotMatch(s, /(?:import|export)\s+.*?from\s+['"](?:\.\.\/)*spikes\//, e.name);
      }
    }
  };
  walk(srcDir);
});

test('isolated package imports without the historical spikes tree and refuses missing parser assets', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pcg-core-alone-'));
  t.after(() => rm(dir, {recursive:true,force:true}));
  await cp(new URL('../src/', import.meta.url), join(dir,'src'), {recursive:true});
  await writeFile(join(dir,'package.json'), JSON.stringify({type:'module',exports:{'.':'./src/index.mjs'}},null,2));
  const lib = await import(pathToFileURL(join(dir,'src/index.mjs')).href);
  assert.equal(typeof lib.openCodeGraph, 'function');
  const checkoutRoot=join(dir,'checkout');
  await mkdir(checkoutRoot);
  execFileSync('git',['init','-q'],{cwd:checkoutRoot});
  await writeFile(join(checkoutRoot,'foo.ts'),'interface Foo {}');
  await assert.rejects(lib.openCodeGraph({checkoutRoot,indexRoot:join(dir,'index')}),/MISSING_LOCAL_DEPENDENCIES/);
});
