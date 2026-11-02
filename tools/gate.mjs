/** Acceptance-gate definitions, separate from the test runner. No product runtime changes. */
export const OFFLINE_GATES = Object.freeze([
  { id: 'm1.2-offline', dir: 'spikes/m1.2', pattern: 'tests/*.test.mjs' },
  { id: 'm1.3-contract', dir: 'spikes/m1.3', pattern: 'tests/offline.test.mjs' },
  { id: 'm1.4-store', dir: 'spikes/m1.4', pattern: 'tests/*.test.mjs' },
  { id: 'm1.4.1-inventory', dir: 'spikes/m1.4.1', pattern: 'tests/*.test.mjs' },
  { id: 'm1.4.2-query', dir: 'spikes/m1.4.2', pattern: 'tests/*.test.mjs' },
  { id: 'm1.5-pipeline', dir: 'spikes/m1.5', pattern: 'tests/pipeline.test.mjs' },
  { id: 'm1.5.1-batch', dir: 'spikes/m1.5.1', pattern: 'tests/*.test.mjs' },
  { id: 'm1.5.2-gate-contract', dir: 'tools', pattern: 'tests/gate.test.mjs' },
  { id: 'm1.6-core', dir: '.', pattern: 'test/core.test.mjs' },
  { id: 'm1.6.1-parser-bridge', dir: '.', pattern: 'test/parser-migration.test.mjs' },
  { id: 'm1.6.2-storage-bridge', dir: '.', pattern: 'test/storage-migration.test.mjs' },
  { id: 'm1.6.3-incremental-bridge', dir: '.', pattern: 'test/incremental-migration.test.mjs' },
  { id: 'm1.6.4-query-bridge', dir: '.', pattern: 'test/query-migration.test.mjs' },
]);
export const REAL_GRAMMAR_GATES = Object.freeze([
  { id: 'm1.3-real-grammar', dir: 'spikes/m1.3', pattern: 'tests/grammar.test.mjs' },
  { id: 'm1.5-real-integration', dir: 'spikes/m1.5', pattern: 'tests/real-grammar.test.mjs' },
  { id: 'm1.6-real-grammar', dir: '.', pattern: 'test/real-grammar.test.mjs' },
]);
export function gatePlan(mode) {
  if (!['offline', 'full'].includes(mode)) throw new Error('INVALID_GATE_MODE');
  return mode === 'offline' ? [...OFFLINE_GATES] : [...OFFLINE_GATES, ...REAL_GRAMMAR_GATES];
}
export function tapSummary(output) {
  const find = key => {
    const m = output.match(new RegExp(`^# ${key} (\\d+)\\s*$`, 'm'));
    return m ? Number(m[1]) : null;
  };
  const tests = find('tests'), pass = find('pass'), fail = find('fail'), skipped = find('skipped'), cancelled = find('cancelled');
  if ([tests,pass,fail,skipped,cancelled].some(v=>v===null)) throw new Error('MISSING_TAP_SUMMARY');
  if (pass + fail + skipped + cancelled !== tests) throw new Error('INCONSISTENT_TAP_SUMMARY');
  return { tests, pass, fail, skipped, cancelled };
}
export function acceptanceStatus(mode, results) {
  if (results.some(g=>g.status==='failed')) return 'FAIL';
  if (results.some(g=>g.status==='blocked')) return 'BLOCKED';
  if (results.some(g=>g.status==='skipped')) return 'BLOCKED';
  if (results.length !== gatePlan(mode).length) return 'BLOCKED';
  if (results.some(g=>g.status!=='passed'||g.skipped!==0||g.cancelled!==0)) return 'FAIL';
  return mode==='full'?'PASS':'OFFLINE_ONLY';
}
