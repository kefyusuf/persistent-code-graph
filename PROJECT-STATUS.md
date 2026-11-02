# Persistent Code Graph — Project Status

Updated: 2026-11-02. This status reflects the M1.6.3 implementation commit; check the latest PR head and CI before merge.

| Milestone | Evidence / state |
|---|---|
| M0–M1.1 | Documented scope, invariants, language adapter, and file-facts contracts |
| M1.2 | Temporary-parser feasibility: 11 offline tests |
| M1.3 | Real Tree-sitter PHP/TypeScript/TSX grammar gate passed in GitHub Actions |
| M1.4–M1.4.2 | Experimental persistent store, working-tree inventory, and verified bounded queries |
| M1.5–M1.5.2 | Parser/store integration and fail-closed acceptance runner with pinned lockfiles |
| M1.6 | Canonical `src/core.mjs` and `src/index.mjs`; API gate passed |
| M1.6.1 | Canonical `src/parser/`; 144 tests passed in CI |
| M1.6.2 | Canonical `src/storage/`; 150 tests passed in CI |
| M1.6.3 | Canonical `src/incremental/`; **156/156 tests passed** on implementation commit `4390cdbdd30f4b03adea402635b2b4dafe127329` |

## Acceptance and PR chain

- M1.6.3 offline gates: 140/140 passed. Real grammar/integration gates: 16/16 passed. The complete acceptance runner reported `PASS` on [GitHub Actions run 41406157939](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41406157939).
- Branch: `refactor/m1.6.3-canonical-incremental`; Draft [PR #5](https://github.com/kefyusuf/persistent-code-graph/pull/5) based on the M1.6.2 branch.
- PR #1–#5 are stacked Draft pull requests. **Do not merge** until review, ordered branch integration, and CI on the final head are complete. `main` remains unchanged by the M1.6.x work.
- The local offline runner reports `OFFLINE_ONLY`, never full parser acceptance.

## Scope / remaining risks

- This remains a syntax-only file-facts index with partial language coverage, not a resolved cross-file semantic code graph.
- Every refresh rehashes eligible files; verified read queries rehash twice. There are no measured production-scale token savings.
- Crash recovery for writer locks, Windows crash durability, and concurrent filesystem races remain unproven.
- Out of scope: MCP, agent memory, LLM calls, embedding/RAG, dashboard, cloud, and automatic background processes.

## Next narrow milestone

M1.6.4: move the existing bounded verified query implementation to `src/query/`, preserving fail-closed stale/unknown behavior and historical import compatibility; tests → PR → full CI. No feature expansion.
