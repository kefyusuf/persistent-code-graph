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
