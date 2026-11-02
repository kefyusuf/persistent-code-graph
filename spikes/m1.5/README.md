# M1.5 — Parser-to-Store Integration Gate (Provisional)

This is a **provisional integration feasibility spike**, not a production code graph.
It composes the previous M1.3 parser contract, M1.4 immutable file-fact store,
M1.4.1 content-hash incremental inventory, and M1.4.2 bounded verified queries.
There is no MCP server, agent memory, background daemon, semantic graph resolver, or cloud.

## Verification boundaries

- `src/pipeline.mjs`: explicit refresh and verified read-only query operations.
- `src/tree-sitter-provider.mjs`: loads only pinned **real** Tree-sitter PHP, TypeScript,
  and TSX grammars from the M1.3 runtime. There is **no temporary-parser fallback**.
- `tests/pipeline.test.mjs`: fully offline tests, explicitly using the previous M1.2
  **temporary** PHP/TypeScript parsers. Passing is *not* parser acceptance.
- `tests/real-grammar.test.mjs`: unskipped, mandatory real-parser integration tests.
  They must be executed successfully before M1.5 can be accepted.

The `parserProvenance` field is `experimental-temporary` in the runnable offline tests
and `real-tree-sitter-unvalidated` for the real provider. `state: verified` means
point-in-time source hash agreement, **not** semantic accuracy or language completeness.

## Commands

```bash
# In the extracted project root
cd spikes/m1.5
npm run test:offline       # always available with prior local dependencies
node src/benchmark.mjs 80 # optional synthetic local measurement; no tokens

# On a host with access to the npm registry:
cd ../m1.3
npm install --ignore-scripts
npm run check:deps
npm run test:grammar       # all 12 must pass
cd ../m1.5
npm run test:grammar       # all 3 must pass
npm test                   # comprehensive gate; intentionally fails if grammars missing
```

There is no network call during indexing. The real-parser provider fails closed if
pinned local dependencies are absent or grammar hashes cannot be calculated.

## Accepted and unaccepted claims

**Supported by offline tests:** snapshots survive a new process, unchanged files
cause zero extractor calls on warm refresh, one changed file causes one extractor
call, cold and warm facts match, old queries are withheld on detected drift,
and failed extraction/publication cannot replace a good head.

**Not yet supported:** Tree-sitter grammar correctness, full AST coverage,
resolved call graph, guaranteed zero I/O on warm refresh, token savings,
Windows compatibility, production crash recovery, CI or agent integration.

## Next gate

M1.3: exact runtime+grammars must be fetched from a trusted package source and
all twelve grammar fixtures executed. M1.5: all three unskipped real-parser
integration tests must pass; then evaluate correctness and latency on an actual
repository before adopting default graph-first agent reads.
