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
| M1.6.4 | **CI accepted; Draft PR review pending** | `src/query/query.mjs`; 147 offline + 16 real parser tests passed (163 total) |

## M1.6.4 evidence and release gate

- RED: module-resolution failure for the deliberately missing canonical query module. GREEN: seven newly added tests pass.
- Local offline: **147/147** tests, all 13 suites passed, `OFFLINE_ONLY`. GitHub Actions **41423090754** subsequently passed the full gate.
- Real parser gate: **16/16** tests passed with zero skips and failures. [GitHub Actions run 41423090754](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41423090754) reported `PASS; 163 passed` for implementation commit `d39403bcb59073eee0f1be3ece7bea3a23d80b55`. Documentation-only updates require their own final-head CI check.
- Query implementation moved unchanged. Old spike paths are re-export-only shims; no schema, cache identity or semantic graph changes.
- The pull-request stack is deliberately left unmerged pending review and evidence.

## Scope boundaries

No cloud hosting, LLM/vector/RAG, MCP server, agent memory, daemon, dashboard, automatic background indexing or cross-file call-target inference. Production portability and token savings remain unproven.
