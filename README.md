# Persistent Code Graph (Experimental)

A deliberately small, offline-first code indexing project. **Not production-ready.** The goal is to index a repository once, reuse unchanged file facts, and refuse stale answers. The universal language adapter and future semantic code graph remain design targets rather than completed functionality.

## Current status

- M0–M1.1: documented product, architecture, and symbol/fact contracts.
- M1.2: temporary PHP tokenizer / TypeScript parser feasibility exercise; not the production parser.
- M1.3: pinned real Tree-sitter grammar gate **passed in GitHub Actions** for the M1.6.3 branch.
- M1.4–M1.5.1: tested experimental store, file inventory, refresh and bounded read-only queries; not a complete semantic cross-file graph.
- M1.5.2: fail-closed acceptance runner with committed lockfiles; latest M1.6.3 code CI ran 156 tests successfully.

## Prerequisites

Node.js 22+, Git and PHP CLI (for legacy temporary-parser tests). All offline contracts use Node.js built-in tests. Actual grammar tests require the pinned `web-tree-sitter@0.27.1` and `tree-sitter-wasm@2.0.4` dependencies.

```sh
# Does not install network dependencies. This is NOT parser acceptance.
node tools/verify-gates.mjs --mode offline

# Bootstrap dependency lockfile once, with network access:
npm install --ignore-scripts --no-audit --no-fund --prefix spikes/m1.3
# IMPORTANT: version-control spikes/m1.3/package-lock.json

# With a committed lockfile, use the repeatable install:
npm ci --ignore-scripts --no-audit --no-fund --prefix spikes/m1.3

# All offline plus 12 real M1.3 and 3 real M1.5 grammar tests:
node tools/verify-gates.mjs --mode full
```

The runner writes JSON and per-suite logs to `reports/m1.5.2/` (gitignored). `OFFLINE_ONLY` means parser acceptance has **not** happened; `BLOCKED` (exit code 2) means evidence is unavailable; `PASS` is possible only after all offline and actual grammar test suites run without skips or failures. A reproducible project baseline **also requires a committed `package-lock.json`**, enforced in GitHub Actions.

## CI and repository handoff

`.github/workflows/parser-acceptance.yml` runs on pushes and pull requests. If the lockfile is absent it bootstraps one on the runner and uploads it as an artifact, but intentionally fails the reproducibility condition. Commit the generated lockfile and rerun. The artifact also includes test logs and the JSON gate result even on failure.

Do **not** interpret a green real grammar test on its own as production readiness: false relation edges, performance, Windows behavior, concurrency, and cross-language semantic correctness need their own acceptance gates.

## Non-goals

No hosted service, automatic background daemon, RAG, embeddings, remote memory, AI-generated summaries, dashboard, or MCP server in this milestone. Do not use test stubs as a production parser fallback.

See [M1.5.2 decision record](docs/M1.5.2-ACCEPTANCE-RUNNER.md) and [project status](PROJECT-STATUS.md).

## M1.6 — single orchestration owner (in progress)

The first non-spike entry point is `src/index.mjs`, exported as `openCodeGraph` by the root `package.json`. It requires a **real, locally installed** Tree-sitter provider. The orchestration now lives in `src/core.mjs`; the M1.5 import path re-exports the same implementation for existing regression tests. Parser, persistent storage, Git inventory, and explicit refresh now have canonical implementations under `src/`; bounded verified queries remain in `spikes/` and will be moved in a later, separately gated step.

```js
import { openCodeGraph } from './src/index.mjs';
const graph = await openCodeGraph({ checkoutRoot: '/path/to/git-checkout', indexRoot: '/path/outside/checkout/index-cache' });
await graph.refresh();
const result = await graph.query('declarations', { name: 'MyClass' });
// Inspect result.state before trusting its results.
```

`npm run test:core` exercises the public API contract offline, without substituting an experimental parser into the public entry point. `npm run test:grammar` requires the pinned Tree-sitter packages installed in `spikes/m1.3/`. The full gate runner includes both suites. The codebase still stores **file-local syntax facts**, not a cross-file resolved semantic graph, and is not production-ready.

## M1.6.2 canonical storage

`src/storage/store.mjs` is the single persistent index implementation. The previous `spikes/m1.4/src/store.mjs` path remains a compatibility re-export, while refresh/query consumers now import canonical storage directly. The schema, canonical serialization, and on-disk snapshot format are unchanged. Run `node tools/verify-gates.mjs --mode offline` locally; only CI full mode (including real Tree-sitter grammars) can accept this PR. See `docs/M1.6.2-CANONICAL-STORAGE-MIGRATION.md`.

## M1.6.3 canonical inventory and refresh

`src/incremental/inventory.mjs` and `src/incremental/refresh.mjs` now own the existing Git-aware working-tree scan and explicit refresh. The M1.4.1 paths are compatibility-only re-exports; `src/core.mjs` and the real parser provider use canonical modules. The index format, parser identities, source-verification boundaries, and reparse behavior are unchanged. The verified query module remains under `spikes/` for a later separate migration. Run `npm run test:incremental` or `node tools/verify-gates.mjs --mode offline`; the M1.6.3 implementation commit passed full CI (156/156); verify the latest PR head after every change. See `docs/M1.6.3-CANONICAL-INCREMENTAL-MIGRATION.md`.
