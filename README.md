# Persistent Code Graph

An offline-first, provider-independent code intelligence experiment.

**Goal:** Index a code repository once; reuse unchanged structural facts; update only what changed; serve bounded, verified context to coding agents.

## Status

- M0–M1.2: product constraints and preliminary parser design.
- M1.3: real Tree-sitter PHP / TypeScript / TSX compatibility gate **OPEN**.
- M1.4–M1.5.2: independent prototypes and 121 passing offline tests **in the local project package**, not yet accepted as a production system.
- Real parser tests must pass in CI before accepting the integration.

## Boundaries

No LLM indexing, cloud, vector database, RAG, agent memory, dashboard, or background daemon. Do not silently serve a stale index.

The initial `main` branch is intentionally minimal. Implementation and verification artifacts are staged on a dedicated development branch and merged only after review and evidence.

## Engineering workflow

Tests first (RED → GREEN → refactor), dedicated feature branch, pull request, CI verification, and no merge while required acceptance gates remain blocked.
