import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openCodeGraph } from '../src/index.mjs';

test('M1.6 public API indexes real PHP, TypeScript and TSX grammars and reopens the same snapshot',async t=>{
  const temp=await mkdtemp(join(tmpdir(),'pcg-m16-real-'));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const checkoutRoot=join(temp,'repo'),indexRoot=join(temp,'store');
  await mkdir(checkoutRoot);
  execFileSync('git',['init','-q'],{cwd:checkoutRoot});
  await writeFile(join(checkoutRoot,'orders.php'),'<?php trait Saves {} class Order { use Saves; public function pay() {} }');
  await writeFile(join(checkoutRoot,'type.ts'),'interface Box { value: number }\ninterface Box { size: number }');
  await writeFile(join(checkoutRoot,'ui.tsx'),'export function Badge(){return <span>OK</span>}');
  const app=await openCodeGraph({checkoutRoot,indexRoot});
  assert.equal((await app.refresh()).counts.parsed,3);
  assert.equal((await app.query('declarations',{name:'Box'})).results.length,2);
  const reopened=await openCodeGraph({checkoutRoot,indexRoot});
  const warm=await reopened.refresh();
  assert.equal(warm.counts.parsed,0);
  assert.equal(warm.counts.reused,3);
  const q=await reopened.query('declarations',{name:'Badge'});
  assert.equal(q.state,'verified');
  assert.equal(q.results.length,1);
});
