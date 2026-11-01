# Persistent Code Graph — Project Status

**As of 2026-11-02.** GitHub: https://github.com/kefyusuf/persistent-code-graph

| Milestone | State | Evidence |
|---|---|---|
| M0 | Design recorded | Product definition and architecture constraints |
| M1.0–M1.1 | Design recorded | Language adapter and normalized facts models |
| M1.2 | Independent experiment accepted | Temporary parser tests: 11/11 |
| M1.3 | **Parser compatibility gate PASSED** | Offline contracts 13/13; real Tree-sitter 12/12 in GitHub Actions |
| M1.4 | Independent experiment accepted | Persistent snapshot store: 18/18 |
| M1.4.1 | Independent experiment accepted | Git inventory and incremental reuse: 21/21 |
| M1.4.2 | Independent experiment accepted | Verified bounded queries: 26/26 |
| M1.5 | **Parser integration gate PASSED** | Offline pipeline 12/12; real grammar integration 3/3 in GitHub Actions |
| M1.5.1 | Independent experiment accepted | Verified batch query: 14/14 |
| M1.5.2 | **CI acceptance PASS** | Gate runner 6/6; offline + grammar tests **136/136**; both lockfiles committed |

**Acceptance evidence:** [GitHub Actions successful run #3](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41352082086), Node.js 22 / Ubuntu runner. CI passed with npm `ci` for both locked parsers. The current repository is an experimental baseline, not a production code intelligence service.

**Git flow:** Draft [PR #1](https://github.com/kefyusuf/persistent-code-graph/pull/1) on `chore/m1.5.2-parser-acceptance-baseline`. **Do not merge automatically.** Review and follow-up design are required.

**Still unverified:** Windows portability, high-load/concurrent index behavior, broad language semantics and correctness beyond fixtures, end-to-end agent token savings, and production hardening.

**Out of scope:** MCP, cloud, LLM calls, embedding/RAG, multi-agent memory, dashboard, and automatic background workers.

## M1.6 — Canonical API bridge (Draft PR #2)

- [PR #2](https://github.com/kefyusuf/persistent-code-graph/pull/2) is stacked on the already CI-verified [PR #1](https://github.com/kefyusuf/persistent-code-graph/pull/1), not on `main`.
- `src/core.mjs` now owns the existing orchestration; the M1.5 import re-exports it to preserve prior tests.
- Public `src/index.mjs` exposes only the real Tree-sitter opener `openCodeGraph`.
- Local offline verification: **125/125 passed**. The real parser entry-point test passed on [GitHub Actions run #41353335458](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41353335458).
- No semantic cross-file edge resolution, MCP, background service, LLM, RAG or cloud layer was added.
- The `spikes/` dependencies are intentionally transitional. Production packaging and Windows support remain unverified.

## M1.6.1 — Canonical Parser Module Migration (Draft PR #3)

- [PR #3](https://github.com/kefyusuf/persistent-code-graph/pull/3) is stacked on PR #2 and remains draft; `main` is unchanged.
- Canonical parser ownership: `src/parser/{contract,runtime,provider}.mjs`, with re-export-only legacy paths.
- The parser dependency installation and lockfiles stay under `spikes/m1.3` until a distinct packaging milestone.
- Extractor source-code SHA-256 changes because ownership moved; previously stored facts must be re-parsed rather than reused with an incompatible identity.
- **Full parser acceptance: PASS, 144/144 tests**, including 128 offline and 16 real grammar/integration tests on [GitHub Actions run #41355128869](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41355128869).
- Not a production-ready cross-file semantic code graph. No MCP, memory, daemon, additional languages or automatic merge.

## M1.6.2 — Canonical Storage Migration (Draft PR #4)

- [PR #4](https://github.com/kefyusuf/persistent-code-graph/pull/4) is stacked on PR #3 and remains draft; `main` is unchanged.
- Canonical `CodeGraphStore`, canonical JSON serialization and manifest comparison moved unchanged to `src/storage/store.mjs`.
- Historical store module re-exports the same symbols; refresh/query consumers import canonical storage.
- RED: six tests initially failed because the canonical module did not exist; GREEN: 6/6 passed. The full local offline gate passed **134/134**.
- Snapshot schema, content-addressed objects, checkout-specific heads, writer locks, parser identities, and public API were not changed.
- The **full 134 offline + 16 real-grammar** CI acceptance on PR #4 is pending verification; no merge has been performed.
