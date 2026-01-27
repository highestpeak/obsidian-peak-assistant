## The Unified SQLite Knowledge Engine (USKE)

This document describes the plugin's "Unified Search" solution (USKE): consolidating **full-text search, vector search, and graph search** into SQLite to reduce memory usage and improve consistency and maintainability.

> Constraint: Currently only supports Desktop. USKE is used as documentation naming only, not as a code naming/label prefix.

### Design Goals
- **Unified**: All search capabilities expressed through SQL (FTS5 / sqlite-vec / Recursive CTE).
- **Low Memory**: Use file-based persistence, avoiding the memory inflation pattern of in-memory databases.
- **Consistency**: Index updates, deletions, and metadata updates maintain atomicity (within the same DB transaction).
- **Type Safety**: Use Kysely as a type-safe SQL query builder.
- **Extensible**: Future-ready for adding more SQL capabilities (JSON1, expression indexes, more CTE queries, etc.).

### SQLite Backend Selection Journey

#### Initial Attempt: wa-sqlite (WebAssembly)

**Why we tried it:**
- Cross-platform compatible (WebAssembly runs everywhere)
- No native dependencies, can be bundled
- Seemed perfect for Obsidian plugin marketplace

**Problems encountered:**
1. **WASM Loading Issues**: 
   - `import.meta.url` was `undefined` in CommonJS bundled environment
   - Electron security policies blocked `file://` URL loading
   - Multiple attempts to fix WASM loading failed (Base64 inlining, path resolution, etc.)
2. **Complexity**: The string-based code modification approach in esbuild plugins was fragile and error-prone
3. **Performance**: Even if working, WebAssembly has overhead compared to native modules

**Decision**: Abandoned due to persistent loading issues and complexity.

#### Second Attempt: better-sqlite3 (Native Module)

**Why we tried it:**
- Best performance (native C++ bindings)
- Synchronous API, no async/sync bridging needed
- Mature and stable library

**Problems encountered:**
1. **Platform Compatibility**: 
   - Native modules require platform-specific binary files (.node files)
   - Obsidian plugin marketplace doesn't distinguish between operating systems
   - A plugin built on macOS won't work on Windows/Linux
2. **Distribution Challenge**: 
   - Would require separate builds for each platform
   - CI/CD complexity for multi-platform distribution
   - Not suitable for Obsidian plugin marketplace (single package distribution)

**Decision**: Not suitable for Obsidian plugin marketplace, but kept as optional backend for users who want better performance.

#### How to Use better-sqlite3 (For Advanced Users)

If you want to use `better-sqlite3` instead of `sql.js` for better performance, follow these steps:

**Step 1: Check Obsidian's Electron Version**

1. Open Obsidian
2. Go to Settings → About
3. Check the Electron version (e.g., "Electron 28.x.x")
4. Or check in the dev tools console(shortcut or window->dev tools): `process.versions.electron`

**Step 2: Install better-sqlite3 in Plugin Directory**

1. Navigate to your plugin directory:
   ```bash
   cd .obsidian/plugins/obsidian-peak-assistant/
   ```
   
   **Important**: Make sure you're in the correct directory. The path should be:
   - `{vault}/.obsidian/plugins/obsidian-peak-assistant/`
   - Not the source code directory, but the installed plugin directory

2. Install better-sqlite3:
   ```bash
   npm install better-sqlite3
   ```
   
   This will create `node_modules/better-sqlite3/` in the plugin directory.

**Step 3: Rebuild for Electron (Required)**

The native module needs to be compiled for Electron's Node.js version, not your system's Node.js version.

**Option A: Using electron-rebuild (Recommended)**

```bash
# Install electron-rebuild
npm install --save-dev @electron/rebuild

# Rebuild better-sqlite3 for Electron
# (Make sure to specify your Electron version for best compatibility)
npx electron-rebuild -f -w better-sqlite3 --version=28.0.0
# Replace 28.0.0 with your Obsidian's Electron version (found in Settings → About)(or open console and input: navigator.userAgent)
```

**Option B: Manual Rebuild**

```bash
# Get Electron version from Obsidian (e.g., 28.0.0)
# Then rebuild better-sqlite3
npm install better-sqlite3 --build-from-source \
  --runtime=electron \
  --target=28.0.0 \
  --disturl=https://electronjs.org/headers
```

Replace `28.0.0` with your Obsidian's Electron version.

**Step 4: Install sqlite-vec Extension (Optional, for Vector Search)**

If you want to enable vector similarity search, you need to install the `sqlite-vec` extension:

1. Install the main package:
   ```bash
   npm install sqlite-vec
   ```

2. Install platform-specific extension package:
   ```bash
   # For macOS ARM64 (Apple Silicon)
   npm install sqlite-vec-darwin-arm64
   
   # For macOS x64 (Intel)
   npm install sqlite-vec-darwin-x64
   
   # For Linux x64
   npm install sqlite-vec-linux-x64
   
   # For Windows x64
   npm install sqlite-vec-windows-x64
   ```

   **Note**: Install the package that matches your platform. The plugin will automatically detect and load the extension if available.

3. **How it works**:
   - The plugin automatically tries to load `sqlite-vec` extension when using `better-sqlite3` backend
   - If the extension loads successfully, vector similarity search will be enabled
   - If the extension fails to load (e.g., platform package not installed), the plugin will continue to work with fulltext search only
   - The plugin tracks whether vector search is available via `SqliteStoreManager.isVectorSearchEnabled()`
   - Indexing will skip embedding generation if vector search is not available
   - Search will automatically fall back to fulltext-only if vector search is not available

**Step 5: Configure Plugin Settings**

1. Open Obsidian Settings → Peak Assistant
2. Set "SQLite Backend" to `better-sqlite3` (or `auto` to auto-detect)

**Troubleshooting**

- **Error: "Cannot find module 'better-sqlite3'"**
  - **Most common issue**: Obsidian plugin runtime may not be able to access the plugin directory's `node_modules`
  - Make sure `better-sqlite3` is installed in: `.obsidian/plugins/obsidian-peak-assistant/node_modules/better-sqlite3/`
  - Verify the installation: `ls .obsidian/plugins/obsidian-peak-assistant/node_modules/better-sqlite3/`
  - **If still not working**: This is a limitation of Obsidian's plugin system. The plugin runtime may not have access to the plugin directory's `node_modules`. In this case, use `sql.js` instead (default, works out of the box).
  
- **Error: "native binding failed"**
  - The native module is not compatible with Electron's Node.js version
  - Rebuild using the steps above (Step 3)
  - Make sure you're using the correct Electron version from Obsidian Settings → About

- **Error: "Loadble extension for sqlite-vec not found" or "no such module: vec0"**
  - The `sqlite-vec` extension requires platform-specific packages
  - Install the appropriate platform package (see Step 4 above)
  - For macOS ARM64: `npm install sqlite-vec-darwin-arm64`
  - For Linux x64: `npm install sqlite-vec-linux-x64`
  - For Windows x64: `npm install sqlite-vec-windows-x64`
  - **Note**: If the extension fails to load, the plugin will continue to work with fulltext search only
  
- **Still not working?**
  - **Recommended**: Use `sql.js` instead (default, works out of the box)
  - `sql.js` provides good performance for most use cases and doesn't require any setup
  - **Note**: `sql.js` does NOT support SQLite extensions, so vector search will not be available with `sql.js` backend
  - `better-sqlite3` is required for vector similarity search functionality
  - `better-sqlite3` is an advanced option that may not work in all Obsidian plugin environments

**Important Note**: 

Due to Obsidian's plugin architecture, `better-sqlite3` may not work reliably even after installation. The plugin runtime's module resolution may not include the plugin directory's `node_modules`. 

**Recommendation**: 
- **For most users**: Use `sql.js` (default) - it works out of the box, no setup needed
- **For advanced users**: Try `better-sqlite3` if you need maximum performance, but be prepared to fall back to `sql.js` if it doesn't work in your environment

#### Final Solution: Hybrid Approach (sql.js + optional better-sqlite3)

**Actual Implementation:**
- **Default**: `sql.js` (pure JavaScript, cross-platform)
  - ✅ Works out-of-the-box on all platforms
  - ✅ No native dependencies
  - ✅ Perfect for Obsidian plugin marketplace
  - ⚠️ Higher memory usage (loads entire DB into memory)
  - ⚠️ Slower than native modules
- **Optional**: `better-sqlite3` (native module, user-installed)
  - ✅ Best performance
  - ✅ Lower memory usage
  - ⚠️ Requires user to manually install: `npm install better-sqlite3` in plugin directory
  - ⚠️ Platform-specific (user installs for their platform)

**Auto-detection Logic:**
1. Plugin automatically detects if `better-sqlite3` is installed
2. If available, uses `better-sqlite3` (better performance)
3. Otherwise, falls back to `sql.js` (default, works everywhere)

**User Experience:**
- **Most users**: Use default `sql.js`, no configuration needed
- **Performance-sensitive users**: Can install `better-sqlite3` for better performance
- **Plugin marketplace**: Works perfectly with default `sql.js`

### Tech Stack
- **Storage Engine**: 
  - **Default**: `sql.js` (pure JavaScript, cross-platform)
  - **Optional**: `better-sqlite3` (native module, user-installed)
  - File persistence to user-configured path (`dataStorageFolder`)
  - Use WAL mode to improve concurrent performance (when using better-sqlite3)
- **Query Builder**: Kysely
  - Type-safe SQL construction
  - Supports transactions, complex queries
  - FTS5 `MATCH` and `sqlite-vec` operators use raw SQL (Kysely limitation)

### Module Overview

#### Full-Text Search (FTS5)
- **Storage**:
  - `doc_chunk` table: Stores original content (`content_raw`) and normalized content (`content_fts_norm`)
  - `doc_fts` virtual table (FTS5): Fields include `chunk_id/path/title/content`
- **Tokenization & Normalization**:
  - Use `Intl.Segmenter` for language-aware tokenization (supports CJK)
  - JS-level normalization: case-folding + diacritics removal (`normalizeTextForFts`)
  - Normalized text is written to `content_fts_norm`, then synchronized to `doc_fts`
  - Avoid dependency on SQLite-ICU extension, all semantic normalization completed on write side
- **Query**: Use FTS5 `MATCH` operator and `bm25()` function for relevance ranking

#### Vector Search (sqlite-vec)
- **Storage**:
  - `embedding` table: Stores vector metadata, `embedding` column uses BLOB (binary float[]) format
  - `vec_embeddings` virtual table (vec0): Specifically for KNN search, `rowid` corresponds to `embedding.rowid`
- **Why Virtual Table is Needed**:
  - SQLite standard indexes (B-tree) cannot handle vector similarity search
  - vec0 provides specialized ANN index (HNSW) and `MATCH` operator
  - See comments in `src/core/storage/sqlite/ddl.ts` for details
- **Table Creation & Dimension Management**:
  - `vec_embeddings` table is created lazily on first embedding insert (not in DDL migration)
  - Table dimension is determined by the actual embedding model dimension (e.g., 768, 1536)
  - This ensures table dimension always matches the embedding model, avoiding dimension mismatch errors
  - If dimension mismatch occurs (e.g., after changing embedding model), an error is thrown with clear instructions
  - Users need to manually drop the table and re-index if they change embedding models
- **Performance Optimization: Table State Caching**:
  - Table existence is checked once on plugin startup and cached in memory
  - `EmbeddingRepo.initializeVecEmbeddingsTableCache()` is called during `SqliteStoreManager.init()`
  - Subsequent inserts use cached state, avoiding frequent `sqlite_master` queries
  - Fallback logic: If insert fails with "no such table" error, re-check table state and update cache
  - This optimization significantly reduces database queries during bulk indexing operations
- **Extension Loading**:
  - Requires `sqlite-vec` npm package and platform-specific extension package
  - Automatically loaded when using `better-sqlite3` backend
  - If loading fails, plugin continues with fulltext search only (graceful degradation)
  - Extension availability is tracked via `SqliteStoreManager.isVectorSearchEnabled()`
  - Indexing skips embedding generation if vector search is not available
  - Search automatically falls back to fulltext-only if vector search is not available
- **Backend Support**:
  - ✅ **better-sqlite3**: Supports sqlite-vec extension (requires platform-specific package)
  - ❌ **sql.js**: Does NOT support SQLite extensions (vector search unavailable)
- **Query**:
  - Use `WHERE embedding MATCH ?` for KNN search
  - Returns `rowid` and `distance`, join back to `embedding` table via `rowid` to get complete records
- **Hybrid Search**:
  - Full-text search and vector search execute independently
  - Use Reciprocal Rank Fusion (RRF) to merge results
  - If vector search is unavailable, only fulltext search results are returned

#### Graph Search (Recursive CTE)
- **Storage**:
  - `graph_nodes` table: Node information (id, type, attributes)
  - `graph_edges` table: Edge information (id, from_node, to_node, type, weight, attributes)
  - `attributes` field uses JSON string to store dynamic properties
- **Query**:
  - Use Recursive CTE to implement N-degree relationship queries (e.g., within 3 degrees)
  - A single SQL query returns all related node sets
  - More efficient than iterative JavaScript traversal (reduces SQL round trips)

#### Dynamic Metadata (JSON1)
- **Use Case**: frontmatter/YAML fields are not fixed, not suitable for creating columns for each field
- **Storage**: `doc_meta.frontmatter_json` field stores JSON string
- **Query**: Use JSON1 functions like `json_extract(...)`, `json_each(...)`
- **Indexing**: Expression indexes can be added when necessary to speed up JSON field filtering

### About InMemoryGraphAnalyzer
`src/core/storage/graph/InMemoryGraphAnalyzer.ts` will be retained for **advanced graph algorithms** (Graphology).

- **Default Path**: Basic "multi-hop relationship queries" use Recursive CTE (more memory-efficient, fewer SQL round trips)
- **Advanced Path**: When complex algorithms are needed (e.g., community detection, complex shortest path), build temporary subgraphs on-demand for analysis

### Data Consistency Strategy
- **Write**: Index writes should update `doc_meta/doc_chunk/doc_fts/embedding/vec_embeddings` simultaneously within a transaction
- **Delete**: Cascade delete related chunk/fts/embedding by `path`, and synchronously clean up `recent_open` and graph data entries
- **Migration**: Old indexes (Orama / sql.js bytes) are not automatically converted, prioritizing a stable path for "one-time index rebuild"

### Repository Architecture
All data access is encapsulated through the Repository layer:
- **Kysely-based Repositories**:
  - `DocMetaRepo`, `DocChunkRepo`, `EmbeddingRepo`, `IndexStateRepo`
  - `DocStatisticsRepo`, `GraphNodeRepo`, `GraphEdgeRepo`
- **FTS5 and sqlite-vec Operations**:
  - Use `rawDb` (sql.js or better-sqlite3 adapter) to directly execute raw SQL
  - Because Kysely has limited support for FTS5 `MATCH` and vec0 `MATCH`

### Backend Implementation Details

#### SqlJsStore (`sqljs-adapter/SqlJsStore.ts`)
- Pure JavaScript implementation using `sql.js`
- Loads entire database into memory
- Requires explicit `save()` calls to persist changes
- Automatically saves on close
- Cross-platform compatible

#### BetterSqliteStore (`better-sqlite3-adapter/BetterSqliteStore.ts`)
- Native C++ bindings via `better-sqlite3`
- Direct file I/O, no memory loading
- Automatic persistence
- Platform-specific (requires user installation)
- Best performance

#### SqliteStoreManager (`SqliteStoreManager.ts`)
- Manages backend selection and switching
- Auto-detects available backends
- Provides unified interface regardless of backend
- Handles backend-specific operations (e.g., sql.js save)

