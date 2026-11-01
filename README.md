# Persistent Code Graph (Experimental)

A deliberately small, offline-first code indexing project. **Not production-ready.** The goal is to index a repository once, reuse unchanged file facts, and refuse stale answers. The universal language adapter and future semantic code graph remain design targets rather than completed functionality.

## Current status

- M0–M1.1: documented product, architecture, and symbol/fact contracts.
- M1.2: temporary PHP tokenizer / TypeScript parser feasibility exercise; not the production parser.
- M1.3: real Tree-sitter grammar compatibility gate **PASSED in CI** (PHP, TypeScript, TSX; 12 tests).
- M1.4–M1.5.1: tested experimental store, file inventory, refresh and bounded read-only queries; not a complete semantic cross-file graph.
- M1.5.2: fail-closed acceptance runner, pinned dependency lockfiles, and **136/136 passing CI tests**; no new runtime feature.

## Prerequisites

Node.js 22+, Git and PHP CLI (for legacy temporary-parser tests). All offline contracts use Node.js built-in tests. Actual grammar tests require the pinned `web-tree-sitter@0.27.1` and `tree-sitter-wasm@2.0.4` dependencies.

```sh
# Does not install network dependencies. This is NOT parser acceptance.
node tools/verify-gates.mjs --mode offline

# Reproducible installs; both lockfiles are version controlled:
npm ci --ignore-scripts --no-audit --no-fund --prefix spikes/m1.2
npm ci --ignore-scripts --no-audit --no-fund --prefix spikes/m1.3

# All offline plus 12 real M1.3 and 3 real M1.5 grammar tests:
node tools/verify-gates.mjs --mode full
```

The runner writes JSON and per-suite logs to `reports/m1.5.2/` (gitignored). `OFFLINE_ONLY` means parser acceptance has **not** happened; `BLOCKED` (exit code 2) means evidence is unavailable; `PASS` is possible only after all offline and actual grammar test suites run without skips or failures. The two pinned `package-lock.json` files are committed and enforced in GitHub Actions.

## CI and repository handoff

`.github/workflows/parser-acceptance.yml` runs on pushes and pull requests. The runner installs both pinned dependency sets with `npm ci`; missing lockfiles fail the reproducibility condition. The artifact also includes test logs and the JSON gate result even on failure.

Do **not** interpret a green real grammar test on its own as production readiness: false relation edges, performance, Windows behavior, concurrency, and cross-language semantic correctness need their own acceptance gates.

## Non-goals

No hosted service, automatic background daemon, RAG, embeddings, remote memory, AI-generated summaries, dashboard, or MCP server in this milestone. Do not use test stubs as a production parser fallback.

See [M1.5.2 decision record](docs/M1.5.2-ACCEPTANCE-RUNNER.md) and [project status](PROJECT-STATUS.md).

## M1.6 — Canonical orchestration API (draft PR #2)

The single orchestration owner is `src/core.mjs`; the M1.5 import is a backward-compatible re-export. `src/index.mjs` exports `openCodeGraph`, which requires real, locally installed Tree-sitter grammar assets. There is **no** experimental parser fallback in the public entry point. Low-level parser, persistence, inventory and query modules remain under their gated `spikes/` paths for this first consolidation step.

```js
import { openCodeGraph } from './src/index.mjs';
const graph = await openCodeGraph({ checkoutRoot: '/path/to/git-repo', indexRoot: '/path/outside/checkout/store' });
await graph.refresh();
const result = await graph.query('declarations', { name: 'Invoice' });
// Check result.state before using results as current facts.
```

The M1.6 offline suite passed **125/125** locally. A new real PHP/TypeScript/TSX integration test runs in the full CI gate; **its acceptance is pending on PR #2**. This is still a partial file-facts index, not a cross-file resolved semantic graph or a production-ready package. See [M1.6 decision](docs/M1.6-CANONICAL-API-BRIDGE.md).

## M1.6.2 — Canonical storage (Draft PR #4)

`src/storage/store.mjs` is now the sole implementation of persistent object/snapshot/head storage. `spikes/m1.4/src/store.mjs` remains a compatibility re-export, and historical refresh/query consumers import the canonical owner directly. Disk format, schema version, cache identity, immutable snapshot semantics, and public API are unchanged. Six RED→GREEN migration tests passed locally; all 134 offline tests passed. Full parser and CI acceptance for PR #4 must be verified separately. See [M1.6.2 decision](docs/M1.6.2-CANONICAL-STORAGE-MIGRATION.md).
