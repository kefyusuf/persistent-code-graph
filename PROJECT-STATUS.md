# Persistent Code Graph — Project Status

**As of 2026-11-03. Experimental; not production-ready.**

- **Integrated `main` head:** `217a46052c7297f1ab6bfa190a81503b8c3ea5b9` (through M1.6.12).
- **Post-integration CI:** [GitHub Actions run 41514272171](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41514272171), `completed / success`, on that exact `main` head.
- **Pending separate change:** [Draft PR #15](https://github.com/kefyusuf/persistent-code-graph/pull/15) (M1.6.13 managed storage path symlink guard); not part of `main`. Its [head-specific full CI](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41523044322) passed; independent code review and merge authorization remain separate.

## Integrated milestones

| Milestone | Current status | Implementation/evidence |
| --- | --- | --- |
| M0–M1.1 | Design documented | Product boundaries, parser abstractions, universal file-facts model |
| M1.2–M1.3 | Parser feasibility + real grammar gate integrated | PHP/TypeScript/TSX parser tests; temporary parser remains a test-only spike |
| M1.4–M1.5.1 | Experimental store/incremental/verified-query prototypes integrated | Immutable hashed snapshots, explicit refresh, bounded read-only queries |
| M1.5.2 | Merged — PR #1 | Pinned dependencies, fail-closed offline/full acceptance CI |
| M1.6–M1.6.4 | Merged — PRs #2–#6 | Canonical `src/` entrypoint, parser, storage, refresh/inventory and queries; compatibility re-exports |
| M1.6.5 | Merged — PR #7 | Root-pinned Tree-sitter dependencies, isolated runtime without `spikes/` |
| M1.6.6 | Merged — PR #8 | Late-arriving supported language identities handled during refresh |
| M1.6.7 | Merged — PR #9 | Index-root symlink-ancestor path guard |
| M1.6.8 | Integration readiness record | Review-time assessment, not a runtime feature |
| M1.6.9 | Merged — PR #10 | Acceptance report suite-ID/count integrity checks |
| M1.6.10 | Merged — PR #11 | Query selector scope boundary; acceptance report output destination guard |
| M1.6.11 | Merged — PR #13 | Documentation/contract terminology alignment |
| M1.6.12 | Merged — PR #14 | Indexed source coordinates for repeated Tree-sitter fact extraction |

## Verified acceptance versus limitations

The final M1.6.12 PR head `7d96e674` passed **191/191** reported full CI tests (171 offline and 20 real parser/integration) in [run 41456461051](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41456461051). The later integrated `main` merge head has a separate successful [full workflow](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41514272171). These are distinct commits and both are cited separately. Successful tests establish only the exercised contracts, not broad production safety.

The current API operates on **file-local syntax facts**. `verified` means the eligible source working tree matched the indexed snapshot at the two checks performed within that query, **not** continuous freshness or completeness. Missing source observations do not establish absence. No resolved cross-file call targets or complete semantic code graph exist.

Known, unresolved risks: adversarial symlink swaps between path checks and I/O (TOCTOU); Windows locking/rename and crash durability; unproven large-repository latency and token savings; partial parser/relationship coverage; no continuous source freshness guarantee.

## Next bounded work

1. Review [Draft PR #15](https://github.com/kefyusuf/persistent-code-graph/pull/15) and its exact-head CI evidence. Do **not** merge solely because CI passed.
2. [Span-performance issue #12](https://github.com/kefyusuf/persistent-code-graph/issues/12) was closed as completed after PR #14's review, merge, and successful post-merge `main` CI. Repository-scale latency and allocation evidence remain unproven and need a separate scoped investigation.
3. Keep this file and the root README synchronized after each **actual merge**. Historical technical notes are intentionally not rewritten to disguise their prior Draft/pending evidence state.

**Out of scope:** hosted service, cloud indexer, MCP server, agent memory, embeddings/RAG, background daemon, dashboard, new languages or semantic cross-file inference without a separately accepted milestone.
