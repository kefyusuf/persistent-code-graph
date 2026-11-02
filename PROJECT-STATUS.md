# Persistent Code Graph — Project Status

**As of 2026-11-02 — M1.6.5 standalone runtime candidate; not production-ready.**

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
| M1.6.4 | Previous GitHub CI passed | Canonical `src/query/`, 163/163 on commit `bf2917ad` |
| M1.6.5 | **Local offline passed / GitHub CI pending** | Root parser dependencies, production-path independence, isolated-real-grammar test |

## M1.6.4 evidence and release gate

- RED: module-resolution failure for the deliberately missing canonical query module. GREEN: seven newly added tests pass.
- Local offline: **147/147** tests, all 13 suites passed. This is `OFFLINE_ONLY`, not proof of real-grammar acceptance.
- Real parser gate: **16** tests in three real-grammar suites must run against this branch on GitHub Actions, not skipped. Do not claim **163/163** until the final commit's CI is verified.
- Query implementation moved unchanged. Old spike paths are re-export-only shims; no schema, cache identity or semantic graph changes.
- The pull-request stack is deliberately left unmerged pending review and evidence.

## Scope boundaries

No cloud hosting, LLM/vector/RAG, MCP server, agent memory, daemon, dashboard, automatic background indexing or cross-file call-target inference. Production portability and token savings remain unproven.

## M1.6.5 evidence and release gate

- RED: three new contract tests, two failed (missing root dependencies and residual spike paths); GREEN: all three passed. Local offline acceptance: **151/151**, `OFFLINE_ONLY`.
- Canonical runtime resolves only from root `package.json` and `node_modules`; root `package-lock.json` pins exact package versions and integrity. Legacy M1.3 fixture installation is retained only for its own tests.
- CI must install root pinned dependencies and execute a second real-grammar scenario from a copied `src/` directory with no `spikes/` directory. Expected: **151 offline + 17 real = 168 total**, no skips. Until verified on the final commit, **do not claim acceptance**.
- Scope unchanged: no new language, semantic graph, MCP, daemon, embeddings, or agent memory. Existing draft PR stack remains unmerged.

- Initial PR #7 CI attempt failed because a stale workflow copy did not install the canonical root dependencies. Corrected workflow and regression assertion are part of the follow-up commit; final CI verification remains required.
