# Persistent Code Graph — Project Status

**As of 2026-11-02 — M1.6.4 candidate on GitHub branch; not production-ready.**

| Milestone | State | Evidence |
|---|---|---|
| M0–M1.1 | Design recorded | Scope, constraints, universal file-facts model |
| M1.2 | Prototype complete | Temporary parser contract tests |
| M1.3 / M1.5 | Real parser gate confirmed by previous CI | PHP/TypeScript/TSX Tree-sitter test suites; limited fixtures |
| M1.4–M1.5.1 | Independent prototypes | Persisted snapshots, incremental refresh, verified single/batch queries |
| M1.5.2 | Repo baseline PR #1 | Reproducible acceptance runner / lockfiles |
| M1.6 | Canonical API PR #2 | Public `openCodeGraph()` and regression gates |
| M1.6.1 | Parser migration PR #3 | `src/parser/` ownership and shims |
| M1.6.2 | Storage migration PR #4 | `src/storage/` ownership and shims |
| M1.6.3 | Incremental migration PR #5 | `src/incremental/` ownership and shims; previous CI 156/156 |
| M1.6.4 | **Pending CI / review** | `src/query/query.mjs`; seven new migration tests; local offline 147/147 |

## M1.6.4 evidence and release gate

- RED: module-resolution failure for the deliberately missing canonical query module. GREEN: seven newly added tests pass.
- Local offline: **147/147** tests, all 13 suites passed. This is `OFFLINE_ONLY`, not proof of real-grammar acceptance.
- Real parser gate: **16** tests in three real-grammar suites must run against this branch on GitHub Actions, not skipped. Do not claim **163/163** until the final commit's CI is verified.
- Query implementation moved unchanged. Old spike paths are re-export-only shims; no schema, cache identity or semantic graph changes.
- The pull-request stack is deliberately left unmerged pending review and evidence.

## Scope boundaries

No cloud hosting, LLM/vector/RAG, MCP server, agent memory, daemon, dashboard, automatic background indexing or cross-file call-target inference. Production portability and token savings remain unproven.
