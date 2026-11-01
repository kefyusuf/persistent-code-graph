# Persistent Code Graph — Project Status

**As of 2026-11-01.** This local artifact has not been pushed to any remote repository.

| Milestone | State | Evidence |
|---|---|---|
| M0 | Design recorded | Product definition and architecture constraints |
| M1.0–M1.1 | Design recorded | Language adapter and normalized facts models |
| M1.2 | Independent experiment accepted | Temporary parser tests: 11/11 |
| M1.3 | **BLOCKED** | Offline contract: 13/13; real Tree-sitter grammar: 12 unexecuted |
| M1.4 | Independent experiment accepted | Persistent snapshot store: 18/18 |
| M1.4.1 | Independent experiment accepted | Git inventory and incremental reuse: 21/21 |
| M1.4.2 | Independent experiment accepted | Verified bounded queries: 26/26 |
| M1.5 | **PROVISIONAL / BLOCKED** | Offline pipeline: 12/12; actual grammar: 3 unexecuted |
| M1.5.1 | Independent experiment accepted | Verified batch query: 14/14 |
| M1.5.2 | Acceptance runner offline passed | Runner tests: 6/6; all offline suites: **121/121** |

**Full real parser gate:** BLOCKED (missing pinned npm packages); CI not yet run. Node.js 22/Linux environment.  
**Repo handoff:** NOW RECOMMENDED. Create an empty repository so GitHub Actions can run the real grammar gate. Do not yet label the indexing engine production-ready.  
**Out of scope:** MCP, cloud, LLM calls, embedding/RAG, multi-agent memory, dashboard, semantic resolution, and automatic background workers.
