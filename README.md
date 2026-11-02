# Persistent Code Graph (Experimental)

A deliberately small, offline-first code indexing project. **Not production-ready.** The goal is to index a repository once, reuse unchanged file facts, and refuse stale answers. The universal language adapter and future semantic code graph remain design targets rather than completed functionality.

## Current status

- M0–M1.1: documented product, architecture, and symbol/fact contracts.
- M1.2: temporary PHP tokenizer / TypeScript parser feasibility exercise; not the production parser.
- M1.3: real Tree-sitter grammar gate verified on GitHub CI (not production-semantic-graph acceptance).
- M1.4–M1.5.1: tested experimental store, file inventory, refresh and bounded read-only queries; not a complete semantic cross-file graph.
- M1.5.2: single command and CI workflow for fail-closed acceptance evidence. No new runtime feature.

## Prerequisites

Node.js 22+, Git and PHP CLI (for legacy temporary-parser tests). All offline contracts use Node.js built-in tests. Actual grammar tests require the pinned `web-tree-sitter@0.27.1` and `tree-sitter-wasm@2.0.4` dependencies.

```sh
# Does not install network dependencies. This is NOT parser acceptance.
node tools/verify-gates.mjs --mode offline

# Locked dependencies for canonical runtime and historical grammar tests:
npm ci --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund --prefix spikes/m1.3
npm ci --ignore-scripts --no-audit --no-fund --prefix spikes/m1.2

# Full acceptance, including a standalone src/ package with no spikes tree:
node tools/verify-gates.mjs --mode full
```

The runner writes JSON and per-suite logs to `reports/m1.5.2/` (gitignored). `OFFLINE_ONLY` means parser acceptance has **not** happened; `BLOCKED` (exit code 2) means evidence is unavailable; `PASS` is possible only after all offline and actual grammar test suites run without skips or failures. A reproducible project baseline **also requires a committed `package-lock.json`**, enforced in GitHub Actions.

## CI and repository handoff

`.github/workflows/parser-acceptance.yml` runs on pushes and pull requests. CI installs the locked canonical parser dependencies at the repository root and separately installs locked dependencies needed by historical regression suites. All three lockfiles are required. The artifact also includes test logs and the JSON gate result even on failure.

Do **not** interpret a green real grammar test on its own as production readiness: false relation edges, performance, Windows behavior, concurrency, and cross-language semantic correctness need their own acceptance gates.

## Non-goals

No hosted service, automatic background daemon, RAG, embeddings, remote memory, AI-generated summaries, dashboard, or MCP server in this milestone. Do not use test stubs as a production parser fallback.

See [M1.5.2 decision record](docs/M1.5.2-ACCEPTANCE-RUNNER.md) and [project status](PROJECT-STATUS.md).

## M1.6 — single orchestration owner (in progress)

The first non-spike entry point is `src/index.mjs`, exported as `openCodeGraph` by the root `package.json`. It requires a **real, locally installed** Tree-sitter provider. The orchestration now lives in `src/core.mjs`; the M1.5 import path re-exports the same implementation for existing regression tests. Parser, storage, inventory/refresh, and verified query implementations now have canonical owners under `src/`; historical spike paths are compatibility re-exports.

```js
import { openCodeGraph } from './src/index.mjs';
const graph = await openCodeGraph({ checkoutRoot: '/path/to/git-checkout', indexRoot: '/path/outside/checkout/index-cache' });
await graph.refresh();
const result = await graph.query('declarations', { name: 'MyClass' });
// Inspect result.state before trusting its results.
```

`npm run test:core` exercises the public API contract offline, without substituting an experimental parser into the public entry point. `npm run test:grammar` requires pinned Tree-sitter packages installed at the project root. The full gate runner includes both suites. The codebase still stores **file-local syntax facts**, not a cross-file resolved semantic graph, and is not production-ready.

## M1.6.2 canonical storage (draft)

`src/storage/store.mjs` is the single persistent index implementation. The previous `spikes/m1.4/src/store.mjs` path remains a compatibility re-export, while refresh/query consumers now import canonical storage directly. The schema, canonical serialization, and on-disk snapshot format are unchanged. Run `node tools/verify-gates.mjs --mode offline` locally; only CI full mode (including real Tree-sitter grammars) can accept this PR. See `docs/M1.6.2-CANONICAL-STORAGE-MIGRATION.md`.

## M1.6.3 canonical inventory and refresh (draft)

`src/incremental/inventory.mjs` and `src/incremental/refresh.mjs` now own the existing Git-aware working-tree scan and explicit refresh. The M1.4.1 paths are compatibility-only re-exports; `src/core.mjs` and the real parser provider use canonical modules. The index format, parser identities, source-verification boundaries, and reparse behavior are unchanged. The verified query module is migrated to `src/query/query.mjs` in M1.6.4. Run `npm run test:incremental` or `node tools/verify-gates.mjs --mode offline`; only full CI acceptance with the real grammars can close the PR gate. See `docs/M1.6.3-CANONICAL-INCREMENTAL-MIGRATION.md`.

## M1.6.4 canonical verified queries (draft)

`src/query/query.mjs` owns the bounded single and batch read boundaries. The M1.4.2 and M1.5.1 paths are compatibility re-exports and `src/core.mjs` uses the canonical implementation. Freshness double-scans, parser identity checks, output budgets, snapshot format, and partial coverage are unchanged. The new migration suite is `npm run test:query`; full CI acceptance is required before the refactor can be merged. See `docs/M1.6.4-CANONICAL-VERIFIED-QUERY-MIGRATION.md`.

## M1.6.5 standalone runtime dependency boundary (draft)

The production entry point (`src/index.mjs`) and its transitive `src/` imports no longer use any `spikes/` files or package installation directories. Root `package.json` and `package-lock.json` own the pinned Tree-sitter runtime and grammar artifacts; the historical M1.3 lockfile stays for its independent fixture tests. Cache identities continue to hash the actual runtime/extractor source and grammar bytes.

`npm run test:independence` checks the dependency manifest, isolated missing-assets behavior, and the CI installation sequence offline. Full acceptance also runs the same PHP/TypeScript parser workflow from a copied `src/` directory **without** `spikes/` using only its installed dependencies. See `docs/M1.6.5-STANDALONE-RUNTIME-BOUNDARY.md`.

M1.6.5 implementation acceptance (GitHub Actions): **168/168 tests passed** on commit `d2519292` in [run 41424973376](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41424973376). This is a narrow source-package independence gate, not a production-readiness or cross-file semantic resolution claim. The Draft PR remains unmerged.
