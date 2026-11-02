import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFLINE_GATES, REAL_GRAMMAR_GATES, gatePlan, tapSummary, acceptanceStatus } from '../gate.mjs';
const good=id=>({id,status:'passed',tests:1,pass:1,fail:0,skipped:0,cancelled:0});
test('offline and real grammar gates are explicitly separate',()=>{
 assert.equal(OFFLINE_GATES.length,9);
 assert.equal(REAL_GRAMMAR_GATES.length,3);
 assert.equal(gatePlan('full').length,12);
 assert.equal(gatePlan('offline').length,9);
 assert.throws(()=>gatePlan('garbage'),/INVALID_GATE_MODE/);
});
test('a clean offline result is never a real-parser acceptance',()=>{
 assert.equal(acceptanceStatus('offline',OFFLINE_GATES.map(x=>good(x.id))),'OFFLINE_ONLY');
 assert.equal(acceptanceStatus('full',OFFLINE_GATES.map(x=>good(x.id))),'BLOCKED');
});
test('missing dependencies force blocked status in full mode',()=>{
 const r=OFFLINE_GATES.map(x=>good(x.id));
 for(const g of REAL_GRAMMAR_GATES)r.push({id:g.id,status:'blocked'});
 assert.equal(acceptanceStatus('full',r),'BLOCKED');
});
test('skipped tests cannot silently pass full acceptance',()=>{
 const r=gatePlan('full').map(x=>good(x.id));
 r[OFFLINE_GATES.length].skipped=1;
 assert.equal(acceptanceStatus('full',r),'FAIL');
});
test('real-parser gate requires all suites with no failures',()=>{
 assert.equal(acceptanceStatus('full',gatePlan('full').map(x=>good(x.id))),'PASS');
 const r=gatePlan('full').map(x=>good(x.id));r[0].status='failed';
 assert.equal(acceptanceStatus('full',r),'FAIL');
});
test('TAP parser rejects missing or impossible totals',()=>{
 assert.deepEqual(tapSummary('# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0'),{tests:3,pass:3,fail:0,skipped:0,cancelled:0});
 assert.throws(()=>tapSummary('# tests 3\n# pass 3'),/MISSING_TAP_SUMMARY/);
 assert.throws(()=>tapSummary('# tests 3\n# pass 4\n# fail 0\n# cancelled 0\n# skipped 0'),/INCONSISTENT_TAP_SUMMARY/);
});
