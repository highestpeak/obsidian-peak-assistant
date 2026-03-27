# Tests

All `*.test.ts` files for this project live here (not under `src/`), so they stay easy to find and run.

## Run

```bash
npm run test
npm run test -- test/textRank.test.ts
```

## Layout

| Path | Purpose |
|------|---------|
| `test/*.test.ts` | Standalone unit tests (e.g. textRank, markdown chunking, boolean parser, manual hub frontmatter) |
| `test/chat-docs/` | `ChatConversationDoc` tests; fixtures in `fixtures/` |
| `test/search-docs/` | `AiSearchAnalysisDoc` tests; fixtures in `fixtures/` |

`run-test.js` discovers all `test/**/*.test.ts` and bundles them with esbuild (`--tsconfig=tsconfig.json` for `@/` imports).
