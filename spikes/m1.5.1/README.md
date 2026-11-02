# M1.5.1 — Verified Batch Query Feasibility Spike

Standalone offline tests of a bounded, verified multi-query read against the existing M1.4.2 file-fact index.

```bash
# Run within the complete project archive under spikes/m1.5.1/
npm test
node src/benchmark.mjs
```

The interface is exported by `src/batch.mjs`, which re-exports `verifiedQueryBatch` from the existing M1.4.2 query engine. The M1.5 pipeline also exposes `app.queryBatch([...], {maxTotalResultBytes: 8192})`. Both rely on the sibling spike modules in this archive. No network access or parser installation is required for these **offline contract tests**.

**No production parser claim:** M1.3/M1.5 real Tree-sitter tests require the missing pinned packages. See `../../docs/M1.5.1-VERIFIED-BATCH-QUERY-SPIKE.md` for evidence, limits, and gate criteria.
