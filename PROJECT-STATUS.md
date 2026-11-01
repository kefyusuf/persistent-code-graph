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
