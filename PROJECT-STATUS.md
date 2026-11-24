# Persistent Code Graph — Project Status

**As of 2026-11-24. Experimental; not production-ready.**

- **Integrated `main` head:** `d75348cf719e128582628b97b69ae00aa189dde9` (through M1.6.13).
- **Post-integration CI:** [GitHub Actions run 45385865850](https://github.com/kefyusuf/persistent-code-graph/actions/runs/45385865850), `completed / success`, **209/209** tests, on that exact `main` head.
- **Open pull requests:** none. [PR #15](https://github.com/kefyusuf/persistent-code-graph/pull/15) (M1.6.13 managed storage path symlink guard) was merged on 2026-11-24 after an independent review recorded on the PR. Its merged head `7a63e73cecaa6c221d12c7c35e2746602409768d` passed [full GitHub Actions run 42222767563](https://github.com/kefyusuf/persistent-code-graph/actions/runs/42222767563); its last runtime-corrective commit `b663cf79b05bcbd470aaefa56d6f5a3d51658416` passed [full GitHub Actions run 42221913715](https://github.com/kefyusuf/persistent-code-graph/actions/runs/42221913715). Review findings on checkout/managed-path collisions and JSON leaf symlinks were repaired with RED→GREEN tests.
- **Open review note from PR #15:** containment is checked in one direction. A checkout nested *inside* a managed directory (index root `/work`, checkout `/work/objects/proj`) is accepted by the constructor and both entrypoints; reproduced locally, no write reaches the checkout.

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
| M1.6.13 | Merged — PR #15 | Static pre-operation guards for managed directories, checkout overlap and stored JSON leaf symlinks |

## Verified acceptance versus limitations

The final M1.6.12 PR head `7d96e674` passed **191/191** reported full CI tests (171 offline and 20 real parser/integration) in [run 41456461051](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41456461051). The later integrated `main` merge head has a separate successful [full workflow](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41514272171). M1.6.13 added 18 storage-boundary regressions; its merged PR head passed full CI in [run 42222767563](https://github.com/kefyusuf/persistent-code-graph/actions/runs/42222767563) and the post-merge `main` run is cited above. These are distinct commits and each is cited separately. Successful tests establish only the exercised contracts, not broad production safety.

The current API operates on **file-local syntax facts**. `verified` means the eligible source working tree matched the indexed snapshot at the two checks performed within that query, **not** continuous freshness or completeness. Missing source observations do not establish absence. No resolved cross-file call targets or complete semantic code graph exist.

Known, unresolved risks: adversarial symlink swaps between path checks and I/O (TOCTOU); one-directional containment (a checkout nested inside a managed directory is accepted); Windows locking/rename and crash durability; unproven large-repository latency and token savings; partial parser/relationship coverage; no continuous source freshness guarantee.

## Next bounded work

1. Resolve the PR #15 review note: reject a checkout nested inside a managed storage directory at construction, or document it as an allowed layout.
2. [Span-performance issue #12](https://github.com/kefyusuf/persistent-code-graph/issues/12) was closed as completed after PR #14's review, merge, and successful post-merge `main` CI. Repository-scale latency and allocation evidence remain unproven and need a separate scoped investigation.
3. Keep this file and the root README synchronized after each **actual merge**. Historical technical notes are intentionally not rewritten to disguise their prior Draft/pending evidence state.

**Out of scope:** hosted service, cloud indexer, MCP server, agent memory, embeddings/RAG, background daemon, dashboard, new languages or semantic cross-file inference without a separately accepted milestone.
