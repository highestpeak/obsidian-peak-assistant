# Deprecated Code - To Be Removed

This directory contains deprecated code that will be removed in a future commit.

## What's Here

### Orama Search Index (`orama/`)
- **OramaSearchIndex.ts** - Orama-based full-text and vector search implementation
- **orama-document.po.ts** - Orama document PO (Persistent Object) type definitions

**Reason for deprecation**: Replaced by SQLite FTS5 + sqlite-vec (USKE architecture). See `src/core/storage/README.md` for details.

### Worker-Based Search (`worker/`)
- **context.ts** - Worker context managing worker-side singletons
- **handlers.ts** - Worker request handlers
- **router.ts** - Worker RPC router
- **entry.ts** - Worker entry point
- **types-rpc.ts** - RPC type definitions

**Reason for deprecation**: Worker-based search has been replaced by main-thread SQLite search to support file-backed persistence with `better-sqlite3`.

### SearchEngine (`SearchEngine.ts`)
- **SearchEngine.ts** - Search engine implementation that used Orama

**Reason for deprecation**: Replaced by main-thread `SearchClient` using SQLite.

### SQLite Metadata Store (`sqlite/`)
- **SqliteMetadataStore.ts** - SQLite store backed by sql.js (WASM)

**Reason for deprecation**: 
- `SqliteMetadataStore` (sql.js) has been replaced by `BetterSqliteStore` (better-sqlite3) for file-backed persistence
- All repositories have been migrated from `QueryBuilder` to Kysely
- `SearchClient` now uses repositories (backed by Kysely) instead of direct SQL queries

## Migration

All search functionality has been migrated to:
- **Main thread**: `src/service/search/SearchClient.ts`
- **SQLite-based**: Uses FTS5 for full-text search and sqlite-vec for vector search
- **File-backed**: Direct file persistence (no worker needed)

## Next Steps

These files can be safely deleted after confirming no remaining references exist in the codebase.

