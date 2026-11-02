# M1.4.2 — Verified Query Boundary (Experimental)

This spike reads persisted symbol/reference observations from M1.4/M1.4.1 **only after validating** the Git working-tree byte contents and the caller's current parser identity. It returns only bounded records with source positions and conservative coverage. It is **not** a production graph, semantic resolver, MCP server, or full language implementation.

## Test

```bash
npm test          # 26 offline/read-only tests; Node 22+, Git, PHP and TypeScript for experimental smoke cases
npm run demo      # first index, query, change, detect stale, one-file refresh, query
```

All imports use the included `../m1.4` and `../m1.4.1` sources. The `demo` additionally requires M1.2's temporary PHP CLI tokenizer and TypeScript compiler; no online API or daemon is used.

## API

```javascript
import { verifiedQuery } from './src/query.mjs';
const response = await verifiedQuery({
  checkoutRoot: '/path/to/git/repo',
  indexRoot: '/path/to/external/cache',
  parserIdentity: (language) => '<64-digit-current-extractor-key>',
  operation: 'declarations',
  name: 'CheckoutService',
  limit: 8,
  maxBytes: 4096,
});
```

The `parserIdentity` function must return a **real current** 64-character lowercase SHA-256 hex cache identity for each language; using a constant or the old stored key defeats parser-compatibility checking. This example is illustrative, not a functioning identity implementation.

Operations: `status`, `declarations`, `references`, `outline` (requires `file`). Filters are exact and bounded. Responses include `verified`, `stale`, `unknown` or `missing`. In stale/unknown states, no old source facts are returned. For partial coverage, an empty result is **not** proof the source symbol does not exist. Call targets remain unresolved.

The code rescans and hashes all eligible source files twice **per query**. The `verified` state is therefore a narrow point-in-time check, not continuous freshness or a zero-I/O performance claim. M1.3 real Tree-sitter grammar tests are still blocked by unavailable npm package access.

For architecture rationale, limitations, test evidence and next acceptance gate see `../../docs/M1.4.2-VERIFIED-QUERY-BOUNDARY.md`.
