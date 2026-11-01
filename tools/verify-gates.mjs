#!/usr/bin/env node
/** Run available offline contract tests and optional real grammar acceptance tests.
 * Fails closed: a missing parser dependency never creates a successful full report.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFLINE_GATES, REAL_GRAMMAR_GATES, gatePlan, tapSummary, acceptanceStatus } from './gate.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
let mode = 'offline', output = 'reports/m1.5.2/verification.json';
for(let i=2;i<process.argv.length;i++) {
  if(process.argv[i]==='--mode' && process.argv[i+1]) mode=process.argv[++i];
  else if(process.argv[i]==='--output' && process.argv[i+1]) output=process.argv[++i];
  else { console.error('Usage: node tools/verify-gates.mjs [--mode offline|full] [--output PATH]');process.exit(64); }
}
try { gatePlan(mode); } catch(e) { console.error(e.message); process.exit(64); }
const reportFile=resolve(root,output);
if(!relative(root,reportFile) || relative(root,reportFile).startsWith('..') || relative(root,reportFile).startsWith('/')) {
  console.error('Report output must be within project directory');process.exit(64);
}
mkdirSync(dirname(reportFile),{recursive:true});
const results=[];
function writeLog(id, body){
  const path = join(dirname(reportFile),`${id}.log`);
  writeFileSync(path,body);
  return relative(root,path);
}
function testPaths(gate){
  const testdir=join(root,gate.dir,'tests');
  if(gate.pattern==='tests/*.test.mjs') return readdirSync(testdir).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>`tests/${f}`);
  return [gate.pattern];
}
function run(gate){
  const cwd=join(root,gate.dir);
  const files=testPaths(gate);
  if(files.length===0) return {id:gate.id,status:'failed',reason:'EMPTY_TEST_SUITE'};
  const proc=spawnSync(process.execPath,['--test',...files],{cwd,encoding:'utf8',maxBuffer:12*1024*1024,timeout:120000});
  const body=(proc.stdout||'')+'\n'+(proc.stderr||'');
  const log=writeLog(gate.id,body);
  let tap;
  try{tap=tapSummary(body)}catch(e){return {id:gate.id,status:'failed',reason:e.message,exitCode:proc.status,log};}
  const passed=proc.status===0 && !proc.error && tap.fail===0 && tap.skipped===0 && tap.cancelled===0 && tap.tests>0;
  return {id:gate.id,status:passed?'passed':'failed',exitCode:proc.status,log,...tap,
    ...(proc.error?{error:proc.error.message}:{})};
}
for(const gate of OFFLINE_GATES){
  const result=run(gate);results.push(result);
  console.log(`${result.status.toUpperCase().padEnd(7)} ${gate.id} ${result.pass??0}/${result.tests??'?'} tests`);
}
const offlineClean=results.every(r=>r.status==='passed');
if(mode==='full'){
  if(offlineClean){
    const pre=spawnSync(process.execPath,['src/preflight.mjs'],{
      cwd:join(root,'spikes/m1.3'),encoding:'utf8',timeout:30000});
    const preLog=writeLog('parser-preflight',(pre.stdout||'')+'\n'+(pre.stderr||''));
    if(pre.status!==0 || pre.error){
      for(const gate of REAL_GRAMMAR_GATES) results.push({id:gate.id,status:'blocked',reason:'PARSER_DEPENDENCIES_UNAVAILABLE',preflightLog:preLog});
      console.error('BLOCKED real grammar gates: see '+preLog);
    }else{
      for(const gate of REAL_GRAMMAR_GATES){
        const result=run(gate);results.push(result);
        console.log(`${result.status.toUpperCase().padEnd(7)} ${gate.id} ${result.pass??0}/${result.tests??'?'} tests`);
      }
    }
  } else {
    for(const gate of REAL_GRAMMAR_GATES)results.push({id:gate.id,status:'blocked',reason:'OFFLINE_REGRESSION_FAILED'});
  }
}
const status=acceptanceStatus(mode,results);
const report={schemaVersion:1,mode,status,runner:'M1.5.2 acceptance gate',node:process.version,
  summary:{testsPassed:results.reduce((v,r)=>v+(r.pass??0),0),testsFailed:results.reduce((v,r)=>v+(r.fail??0),0),gatesPassed:results.filter(r=>r.status==='passed').length,gatesBlocked:results.filter(r=>r.status==='blocked').length},results};
writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(`RESULT ${status}; ${report.summary.testsPassed} passed; report ${relative(root,reportFile)}`);
if(status==='PASS'||status==='OFFLINE_ONLY') process.exit(0);
if(status==='BLOCKED') process.exit(2);
process.exit(1);
