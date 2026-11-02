import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertSafeReportDestination } from '../report-boundary.mjs';

function sandbox(t){
 const root=mkdtempSync(join(tmpdir(),'pcg-report-boundary-'));
 const project=join(root,'project'),outside=join(root,'outside');
 mkdirSync(project);mkdirSync(outside);
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 return {project,outside};
}

test('safe nested reports output is accepted, but source file paths are refused',t=>{
 const {project}=sandbox(t);
 assert.equal(assertSafeReportDestination(project,'reports/deep/log.json'),join(project,'reports','deep','log.json'));
 assert.throws(()=>assertSafeReportDestination(project,'src/index.mjs'),{code:'UNSAFE_REPORT_PATH'});
 assert.throws(()=>assertSafeReportDestination(project,'reports'),{code:'UNSAFE_REPORT_PATH'});
 assert.throws(()=>assertSafeReportDestination(project,'../outside/report.json'),{code:'UNSAFE_REPORT_PATH'});
});

test('symlinked report directory escaping project is refused',t=>{
 const {project,outside}=sandbox(t);
 symlinkSync(outside,join(project,'reports'),'dir');
 assert.throws(()=>assertSafeReportDestination(project,'reports/verification.json'),{code:'UNSAFE_REPORT_PATH'});
});

test('nested and dangling symlink report destinations are refused',t=>{
 const {project,outside}=sandbox(t);
 mkdirSync(join(project,'reports'));
 symlinkSync(outside,join(project,'reports','redirect'),'dir');
 assert.throws(()=>assertSafeReportDestination(project,'reports/redirect/output.json'),{code:'UNSAFE_REPORT_PATH'});
 symlinkSync(join(outside,'nonexistent'),join(project,'reports','dangling'),'dir');
 assert.throws(()=>assertSafeReportDestination(project,'reports/dangling/output.json'),{code:'UNSAFE_REPORT_PATH'});
});

test('existing report output symlink is refused',t=>{
 const {project,outside}=sandbox(t);
 mkdirSync(join(project,'reports'));
 const victim=join(outside,'victim.txt');writeFileSync(victim,'original');
 symlinkSync(victim,join(project,'reports','test.json'));
 assert.throws(()=>assertSafeReportDestination(project,'reports/test.json'),{code:'UNSAFE_REPORT_PATH'});
 assert.equal(readFileSync(victim,'utf8'),'original');
});

test('runner refuses symlinked reports before launching any test suite',t=>{
 const {outside}=sandbox(t);
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const reports=join(root,'reports');mkdirSync(reports,{recursive:true});
 const key=`review-symlink-${randomUUID()}`;
 const link=join(reports,key);
 symlinkSync(outside,link,'dir');
 t.after(()=>rmSync(link,{force:true}));
 const result=spawnSync(process.execPath,['tools/verify-gates.mjs','--mode','offline','--output',`reports/${key}/victim.json`],{cwd:root,encoding:'utf8',timeout:15000});
 assert.equal(result.status,64);
 assert.match(result.stderr,/Report output rejected/);
 assert.equal(existsSync(join(outside,'victim.json')),false);
});
