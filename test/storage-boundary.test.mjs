import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodeGraphStore } from '../src/storage/store.mjs';

async function sandbox(t) {
  const root = await mkdtemp(join(tmpdir(), 'pcg-m167-path-'));
  const checkoutRoot = join(root, 'checkout');
  await mkdir(checkoutRoot);
  t.after(()=>rm(root, { recursive:true, force:true }));
  return { root, checkoutRoot };
}

test('rejects an external symlink that redirects the index inside source checkout', async t => {
  const { root, checkoutRoot } = await sandbox(t);
  const alias = join(root, 'external-symlink');
  await symlink(checkoutRoot, alias, 'dir');
  assert.throws(() => new CodeGraphStore({ checkoutRoot, indexRoot: join(alias, '.index-cache') }), { code:'INVALID_STORE' });
  assert.deepEqual(await readdir(checkoutRoot), []);
});

test('rejects a direct indexRoot symlink to the checkout', async t => {
  const { root, checkoutRoot } = await sandbox(t);
  const alias = join(root, 'index-alias');
  await symlink(checkoutRoot, alias, 'dir');
  assert.throws(() => new CodeGraphStore({ checkoutRoot, indexRoot: alias }), { code:'INVALID_STORE' });
});

test('allows an indexRoot through a symlink resolving outside source checkout', async t => {
  const { root, checkoutRoot } = await sandbox(t);
  const destination = join(root, 'external-store');
  await mkdir(destination);
  const alias = join(root, 'external-link');
  await symlink(destination, alias, 'dir');
  const store = new CodeGraphStore({ checkoutRoot, indexRoot: join(alias, 'fresh-store') });
  assert.equal(await store.read(), null);
  const published = await store.publish({ expectedHead:null, files:[] });
  assert.equal((await store.read()).snapshotId, published.snapshotId);
  assert.deepEqual(await readdir(checkoutRoot), []);
});


test('rejects a dangling indexRoot symlink rather than guessing its destination', async t => {
  const { root, checkoutRoot } = await sandbox(t);
  const alias = join(root, 'dangling-index-link');
  await symlink(join(root, 'unavailable-target'), alias, 'dir');
  assert.throws(() => new CodeGraphStore({ checkoutRoot, indexRoot: join(alias, 'cache') }), { code:'INVALID_STORE' });
});

const minimalFacts = () => ({
  file:'a.ts',language:'typescript',contentHash:'a'.repeat(64),
  parser:{cacheIdentity:'b'.repeat(64)},declarations:[],references:[],relations:[],
  diagnostics:[],coverage:{declarations:'partial',references:'partial',calls:'partial'},
});

for (const directory of ['objects','snapshots','heads','locks']) {
  test(`rejects managed ${directory}/ symlink before publication writes`, async t => {
    const {root,checkoutRoot} = await sandbox(t);
    const indexRoot=join(root,'external-cache');
    await mkdir(indexRoot);
    await symlink(checkoutRoot,join(indexRoot,directory),'dir');
    const store=new CodeGraphStore({checkoutRoot,indexRoot});
    await assert.rejects(
      store.publish({expectedHead:null,files:[minimalFacts()]}),
      {code:'INVALID_STORE'},
    );
    assert.deepEqual(await readdir(checkoutRoot),[]);
  });
}

test('read refuses an internal heads/ symlink even when no head exists', async t => {
  const {root,checkoutRoot}=await sandbox(t);
  const indexRoot=join(root,'external-cache');
  await mkdir(indexRoot);
  await symlink(checkoutRoot,join(indexRoot,'heads'),'dir');
  const store=new CodeGraphStore({checkoutRoot,indexRoot});
  await assert.rejects(store.read(),{code:'INVALID_STORE'});
});

test('rejects an indexRoot replaced by a checkout symlink after store construction', async t => {
  const {root,checkoutRoot}=await sandbox(t);
  const indexRoot=join(root,'deferred-index');
  const store=new CodeGraphStore({checkoutRoot,indexRoot});
  await symlink(checkoutRoot,indexRoot,'dir');
  await assert.rejects(
    store.publish({expectedHead:null,files:[]}),
    {code:'INVALID_STORE'},
  );
  assert.deepEqual(await readdir(checkoutRoot),[]);
});
