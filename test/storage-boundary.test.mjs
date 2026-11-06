import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, rm, readdir, rename } from 'node:fs/promises';
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

for (const managedName of ['objects','snapshots','heads','locks']) {
  test(`index root parent is rejected when managed ${managedName}/ equals checkout`, async t => {
    const {root} = await sandbox(t);
    const checkoutRoot=join(root,managedName);
    await mkdir(checkoutRoot);
    // All other managed subdirectories are siblings. This specific one is the checkout.
    assert.throws(
      () => new CodeGraphStore({checkoutRoot,indexRoot:root}),
      {code:'INVALID_STORE'},
    );
    assert.deepEqual(await readdir(checkoutRoot),[]);
  });
}

test('a parent indexRoot remains usable when every managed subdirectory is outside checkout', async t => {
  const {root,checkoutRoot}=await sandbox(t);
  const store=new CodeGraphStore({checkoutRoot,indexRoot:root});
  const result=await store.publish({expectedHead:null,files:[minimalFacts()]});
  assert.equal((await store.read()).snapshotId,result.snapshotId);
  assert.deepEqual(await readdir(checkoutRoot),[]);
});

for (const area of ['heads','snapshots','objects']) {
  test(`read rejects a ${area}/ JSON leaf symlink, even when its target has valid bytes`, async t => {
    const {root,checkoutRoot}=await sandbox(t);
    const indexRoot=join(root,'external-index');
    const store=new CodeGraphStore({checkoutRoot,indexRoot});
    await store.publish({expectedHead:null,files:[minimalFacts()]});
    const [name]=await readdir(join(indexRoot,area));
    const leaf=join(indexRoot,area,name);
    const backup=join(root,`${area}-saved.json`);
    await rename(leaf,backup);
    await symlink(backup,leaf);
    await assert.rejects(store.read(),{code:'INTEGRITY_ERROR'});
  });
}

test('read distinguishes an absent head from a dangling head-file symlink', async t => {
  const {root,checkoutRoot}=await sandbox(t);
  const indexRoot=join(root,'external-index');
  const store=new CodeGraphStore({checkoutRoot,indexRoot});
  assert.equal(await store.read(),null);
  await mkdir(join(indexRoot,'heads'),{recursive:true});
  await symlink(join(root,'nonexistent-head'),store.headPath);
  await assert.rejects(store.read(),{code:'INTEGRITY_ERROR'});
});

test('publication rejects an alias of a valid head record without replacing it', async t => {
  const {root,checkoutRoot}=await sandbox(t);
  const indexRoot=join(root,'external-index');
  const store=new CodeGraphStore({checkoutRoot,indexRoot});
  const first=await store.publish({expectedHead:null,files:[minimalFacts()]});
  const backup=join(root,'original-head.json');
  await rename(store.headPath,backup);
  await symlink(backup,store.headPath);
  await assert.rejects(
    store.publish({expectedHead:first.snapshotId,files:[minimalFacts()]}),
    {code:'INTEGRITY_ERROR'},
  );
  assert.deepEqual(await readdir(checkoutRoot),[]);
});
