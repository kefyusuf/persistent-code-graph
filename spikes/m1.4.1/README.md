# M1.4.1 Git-aware incremental inventory spike

This is a **bounded, parser-neutral experiment**, not a production code graph engine. It uses only Node built-ins and Git for the core; the optional M1.2 smoke integration uses temporary TypeScript/PHP extraction implementations already present in the project.

## Test

```bash
cd spikes/m1.4.1
npm test
```

No `npm install` is required in this spike. Test fixtures create ephemeral local Git repositories under OS temporary directories. They do not affect the source repository.

## API

`inventoryGitCheckout(checkoutRoot)` enumerates supported tracked and eligible untracked working-tree files and returns raw bytes and SHA-256 hashes.

`refreshFileFacts({checkoutRoot,indexRoot,parserIdentity,extract})` uses M1.4 `CodeGraphStore` for immutable storage, makes incremental file-fact extraction decisions, checks source bytes again before publication and atomically updates the checkout head. Caller owns parser identity and extraction. This is an explicit refresh, not an automatic watcher or hook.

`fixtureExtractor` is a dummy for contract tests; `experimentalExtract` invokes the M1.2 PHP/TS prototype and **must not be described as a passing M1.3 Tree-sitter integration**.

## Status

- 21/21 tests passed locally on Linux / Node.js 22.16.0.
- M1.3 real grammar tests remain blocked by npm `EAI_AGAIN`; grammar compatibility is not accepted.
- See `../../docs/M1.4.1-GIT-AWARE-INCREMENTAL-INVENTORY.md` for tests, limitations, and next gate.
