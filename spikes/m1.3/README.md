# M1.3 — Tree-sitter Parser Compatibility Gate

**Status: BLOCKED (grammar execution not verified).** The offline file-facts contract tests pass (12/12); the 12 real grammar tests are **not passed** because pinned packages cannot be fetched in the current runtime. Do not use this spike as a production parser or claim broad language support.

## Scope

This isolated, experimental gate checks PHP, TypeScript and TSX extraction via a shared Tree-sitter WASM runtime. It emits file-local declarations and raw reference occurrences. It **does not** implement persisted graph storage, graph edge resolution, incremental index updates, Git integration, MCP, LLM features or general language detection.

The source AST is authoritative. Unsupported syntax remains unclaimed; all supported test success paths report `partial` coverage. Calls never become resolved edges.

## Requirements and reproducibility

- Node.js >=22, tested offline contract runner on Node.js 22.16.0.
- When package access is available: install pinned `web-tree-sitter@0.27.1` and `tree-sitter-wasm@2.0.4` via the exact-version `package.json`.
- **No lockfile is bundled** because dependency fetching and lockfile generation were unavailable here. A successful clean install, generated lockfile, dependency provenance review and independent cross-platform grammar execution are necessary before the gate is eligible to pass.
- At runtime, WASM is loaded exclusively from installed packages, **never** fetched from the network. The parser loader checks package versions and hashes grammar files.

```bash
cd code-graph-spike-m1.3
npm run test:offline   # currently passes without dependencies
npm install --ignore-scripts
npm run check:deps     # fails explicitly if missing or wrong package versions
npm run test:grammar   # requires real Tree-sitter runtime and WASM grammars
npm test               # full gate; blocked until grammar tests pass
```

If `npm install` fails, do not use `--force` to bypass integrity checks or substitute unverified WASM artifacts. When packages become accessible, first review the resolved npm lockfile, run the full gate and commit the lockfile into an actual project repository only after approval.

## Files

- `src/contract.mjs` — minimal language registry, normalized syntax facts, UTF-8 range verification, deterministic IDs, no guessed edges.
- `src/runtime.mjs` — pinned local WASM loader and grammar SHA-256 cache identity. Never downloads at runtime.
- `src/preflight.mjs` — rejects missing/mismatched dependency versions.
- `tests/offline.test.mjs` — 12 tests. Small **simulated syntax nodes**, not evidence of Tree-sitter grammar compatibility.
- `tests/grammar.test.mjs` — 12 real-parser integration tests. Must run against installed WASM assets to pass the gate.
- `fixtures/` — 10 source fixtures inherited or added, including TSX, overloads and PHP trait alias behavior.
- `reports/` — logs of RED, GREEN and blocked dependency tests; the logs document exact local execution.

## Known limitations

- Tree-sitter grammar node types were inspected against upstream PHP and TypeScript `node-types.json`, but compatibility of the installed WASM builds has **not** been executed.
- `spanForNode` validates raw bytes against the syntax node's source text before returning offsets. Parser-specific index units and Unicode behavior remain a real-grammar gate.
- Import extraction supports only a small TS named-import subset; PHP resolution is intentionally absent.
- Nested relationships and scopes are not yet an accepted full M1.1 schema implementation.
- The `tree-sitter-wasm` asset package includes more languages than the two test targets; do not infer that a production binary must ship every grammar.
- In the absence of package access, actual grammar integration is blocked and the milestone must remain open.

## Follow-up when dependency access is restored

1. Run `npm install --ignore-scripts` and review its lockfile, provenance, integrity fields and licensing.
2. Run `npm run check:deps && npm test`; investigate any observed AST mismatches, do not modify expected facts to hide errors.
3. Verify the same test suite on Windows and Linux with explicit timestamps, exact grammar hashes and machine-readable results.
4. Add source position tests spanning Unicode, CRLF and recovered syntax nodes where the real runtime reveals differences.
5. Only after the grammar gate is fully green, make a decision about the production parser/runtime and the M1 durable index milestone.

## Source references

- https://tree-sitter.github.io/tree-sitter/
- https://www.npmjs.com/package/web-tree-sitter
- https://www.npmjs.com/package/tree-sitter-wasm
- https://github.com/tree-sitter/tree-sitter-typescript/blob/master/typescript/src/node-types.json
- https://github.com/tree-sitter/tree-sitter-php/blob/master/php/src/node-types.json
