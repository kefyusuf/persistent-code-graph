# Persistent Code Graph (Experimental)

A deliberately small, offline-first code indexing project. **Not production-ready.** The goal is to index a repository once, reuse unchanged file facts, and refuse stale answers. The universal language adapter and future semantic code graph remain design targets rather than completed functionality.

## Current status

- M0–M1.1: documented product, architecture, and symbol/fact contracts.
- M1.2: temporary PHP tokenizer / TypeScript parser feasibility exercise; not the production parser.
- M1.3: real Tree-sitter grammar gate **OPEN**.
- M1.4–M1.5.1: tested experimental store, file inventory, refresh and bounded read-only queries; not a complete semantic cross-file graph.
- M1.5.2: single command and CI workflow for fail-closed acceptance evidence. No new runtime feature.

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

The first non-spike entry point is `src/index.mjs`, exported as `openCodeGraph` by the root `package.json`. It requires a **real, locally installed** Tree-sitter provider. The orchestration now lives in `src/core.mjs`; the M1.5 import path re-exports the same implementation for existing regression tests. Parser loading, storage, inventory and verified queries still live in their tested experimental modules and will be moved in later, individually gated steps.

```js
import { openCodeGraph } from './src/index.mjs';
const graph = await openCodeGraph({ checkoutRoot: '/path/to/git-checkout', indexRoot: '/path/outside/checkout/index-cache' });
await graph.refresh();
const result = await graph.query('declarations', { name: 'MyClass' });
// Inspect result.state before trusting its results.
```

`npm run test:core` exercises the public API contract offline, without substituting an experimental parser into the public entry point. `npm run test:grammar` requires the pinned Tree-sitter packages installed in `spikes/m1.3/`. The full gate runner includes both suites. The codebase still stores **file-local syntax facts**, not a cross-file resolved semantic graph, and is not production-ready.
