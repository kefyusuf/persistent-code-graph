# M1.2 — Two-language parser feasibility spike

**Status: partial technical verification, not a production indexer.**

This small, isolated test project probes whether PHP and TypeScript parsers can emit a compatible file-local facts shape while retaining source evidence and refusing guessed call edges. It does not modify any target repository, implement a persisted graph, perform Git updates, or provide MCP tools.

## Requirements

- Node.js 22+ (tested: 22.16.0) with a usable `typescript` package (tested: 5.8.3).
- PHP CLI with tokenizer enabled (tested: 8.4.24).
- No API key, network service, database, or LLM.

The test runner first tries `require('typescript')` and then a globally installed TypeScript module (`npm root -g`). If neither is available, install TypeScript with `npm install --no-save typescript` **when network access is available**. PHP must be on `PATH`.

```sh
cd code-graph-spike-m1.2
npm test
```

The captured test outputs are in `reports/`:
- `RED.txt`: six initial failing tests with an unimplemented adapter.
- `GREEN.txt`: six tests passing after the first implementation.
- `RED-2.txt`: two additional failing tests exposing a false positive and a missing call occurrence.
- `GREEN-2.txt`: ten tests passing after the correction.
- `RED-3.txt`: two newly added assertions fail because coverage is overstated.
- `GREEN-3.txt`: eleven tests passing after conservative coverage labels.

## What is actually proven

- Two dissimilar parsing backends can emit one small normalized file-facts shape.
- Two TypeScript same-named interface declarations remain distinct.
- Import original spelling/local alias and source ranges survive normalization.
- PHP trait declarations, class/method declarations, trait-use occurrences and trait-alias occurrences can be recorded without inventing a semantic `implements` edge.
- An unresolved PHP member call and TS call remain raw occurrences.
- UTF-8 offsets, deterministic per-snapshot-like local IDs, and syntax-error diagnostics are represented in the test subset.

## What is not proven

- No Tree-sitter PHP/TypeScript grammar was executed. External package installation was blocked by the running environment's network/DNS settings.
- PHP's `token_get_all` is a lexical tokenizer, not a complete syntax tree. Its local scope tracking is deliberately incomplete. Do **not** use this PHP extraction path in a production indexer.
- No compiler-equivalent semantic resolution, typed call graph, complete name scope, import resolution, namespace/trait adaptation validation, or correctness on large repositories is claimed.
- The TypeScript compiler API is a feasibility backend only; it is not an accepted production parser choice.
- No persistent file manifest, durable snapshot, atomic publication, cache reuse, per-file invalidation, cross-file relations, Git lifecycle, source freshness gate or MCP interface exists here.
- Tests pass on the seven small fixture files; this is not evidence of broad language coverage or performance.

## Next gate

1. Acquire and pin Tree-sitter runtime + PHP and TypeScript grammars in an environment with vetted package access.
2. Repeat the same fixture tests using actual Tree-sitter CST queries (including parse errors and both language dialects).
3. Add negative fixtures for trait use in nested scopes, PHP namespace aliases, TS overloads and malformed syntax.
4. Compare normalized facts to the expected canonical fixture outputs without losing references or byte ranges.
5. Only then select the M1 implementation parser/runtime and begin RED tests for durable index storage.

See `../code-graph-m0/M1.2-PARSER-FEASIBILITY-SPIKE.md` for the decision record.
