# M1.4 — Persistent Index Store Spike

A dependency-free feasibility experiment for immutable file-fact storage and atomic per-checkout snapshot publication.

## Run

Requires Node.js >=22; no `npm install` necessary.

```sh
npm test
```

## Implemented

- Canonical JSON and SHA-256 object addressing.
- Per-checkout publication pointer with immutable snapshots and file facts.
- Writer lock + optimistic expected-head conflict check.
- Idempotent publish, object reuse, integrity validation, failure injection.
- Hash + parser-identity-based manifest comparison.
- Honest `freshness: unknown` when a snapshot is only loaded from disk.

## Explicitly not implemented

Parser / grammar loading, code graph relations, source inventory, Git lifecycle, live index freshness, repository hooks, MCP, automatic garbage collection, crash-orphaned lock recovery, or a production DB decision.

## Test evidence

- `reports/RED.txt`: 0/14 before implementation.
- `reports/GREEN-1.txt`: 14/14 implementation baseline.
- `reports/GREEN-2.txt`: 18/18 including expanded regression tests.

At the time of this isolated store experiment, the M1.3 grammar gate was locally blocked; it later passed on GitHub CI ([run 41352198935](https://github.com/kefyusuf/persistent-code-graph/actions/runs/41352198935)). See [the M1.4 persistent store decision record](../../docs/M1.4-PERSISTENT-INDEX-STORE-SPIKE.md).
