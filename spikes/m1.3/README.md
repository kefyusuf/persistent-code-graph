# M1.3 — Tree-sitter Parser Compatibility Gate

**Status: REAL-GRAMMAR GATE ACCEPTED ON GITHUB CI; experimental parser only.** The original local run was **BLOCKED** because pinned packages could not be fetched in that environment. Subsequently, all **12 M1.3 real Tree-sitter tests passed** in the [PR #1 head CI run 41352198935](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41352198935) on November 1, 2026 (136/136 total baseline tests). This supersedes the historical blocked gate status, not the limits on syntax coverage. Do not use this isolated spike as a production semantic parser or claim broad language support.

## Scope

This isolated, experimental gate checks PHP, TypeScript and TSX extraction via a shared Tree-sitter WASM runtime. It emits file-local declarations and raw reference occurrences. It **does not** implement persisted graph storage, graph edge resolution, incremental index updates, Git integration, MCP, LLM features or general language detection.

The source AST is authoritative. Unsupported syntax remains unclaimed; all supported test success paths report `partial` coverage. Calls never become resolved edges.

## Requirements and reproducibility

- Node.js >=22, tested offline contract runner on Node.js 22.16.0.
- Install the pinned `web-tree-sitter@0.27.1` and `tree-sitter-wasm@2.0.4` through the committed `package-lock.json` using `npm ci`.
- The original isolated experiment had no lockfile because package fetching was unavailable; the staged repository **now commits `spikes/m1.3/package-lock.json`**, and GitHub CI enforces reproducible installation. Cross-platform validation remains separate from the accepted Linux grammar gate.
- At runtime, WASM is loaded exclusively from installed packages, **never** fetched from the network. The parser loader checks package versions and hashes grammar files.

```bash
cd spikes/m1.3
npm ci --ignore-scripts --no-audit --no-fund
npm run test:offline   # contract fixtures
npm run check:deps     # fails explicitly if missing or wrong package versions
npm run test:grammar   # actual pinned Tree-sitter runtime and WASM grammars
npm test               # local spike test suite
```

If `npm ci` fails due to unavailable dependencies, do not use `--force` to bypass integrity checks or substitute unverified WASM artifacts. The previously completed CI acceptance remains historical evidence; a new test run must fail closed when dependencies are missing.

## Files

- `src/contract.mjs` — minimal language registry, normalized syntax facts, UTF-8 range verification, deterministic IDs, no guessed edges.
- `src/runtime.mjs` — pinned local WASM loader and grammar SHA-256 cache identity. Never downloads at runtime.
- `src/preflight.mjs` — rejects missing/mismatched dependency versions.
- `tests/offline.test.mjs` — 12 tests. Small **simulated syntax nodes**, not evidence of Tree-sitter grammar compatibility.
- `tests/grammar.test.mjs` — 12 real-parser integration tests. Must run against installed WASM assets to pass the gate.
- `fixtures/` — 10 source fixtures inherited or added, including TSX, overloads and PHP trait alias behavior.
- `reports/` — logs of RED, GREEN and blocked dependency tests; the logs document exact local execution.

## Known limitations

- Compatibility of the pinned WASM grammar builds was executed and accepted on Linux CI with 12 real-grammar fixture tests; this does **not** establish arbitrary-code correctness, complete semantic resolution, or Windows compatibility.
- `spanForNode` validates raw bytes against the syntax node's source text before returning offsets. Parser-specific index units and Unicode behavior remain a real-grammar gate.
- Import extraction supports only a small TS named-import subset; PHP resolution is intentionally absent.
- Nested relationships and scopes are not yet an accepted full M1.1 schema implementation.
- The `tree-sitter-wasm` asset package includes more languages than the two test targets; do not infer that a production binary must ship every grammar.
- A fresh local grammar run without installed pinned dependencies remains **blocked**; that environmental condition does not invalidate the explicitly recorded successful GitHub CI run.

## Remaining validation after the accepted Linux grammar gate

1. Use `npm ci --ignore-scripts` with the committed lockfile; review dependency provenance, integrity fields and licensing whenever locked versions change.
2. Run `npm run check:deps && npm test`; investigate observed AST mismatches rather than modifying expected facts to hide errors.
3. Validate the same suite on Windows as a **separate** portability gate, recording timestamps, grammar hashes and machine-readable results.
4. Extend source-position coverage for Unicode, CRLF and recovered syntax nodes only when justified by specific reproducible failures.
5. Treat this narrow syntax-grammar acceptance as distinct from production-runtime or cross-file semantic graph readiness.

## Source references

- https://tree-sitter.github.io/tree-sitter/
- https://www.npmjs.com/package/web-tree-sitter
- https://www.npmjs.com/package/tree-sitter-wasm
- https://github.com/tree-sitter/tree-sitter-typescript/blob/master/typescript/src/node-types.json
- https://github.com/tree-sitter/tree-sitter-php/blob/master/php/src/node-types.json
