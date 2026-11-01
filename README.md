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
