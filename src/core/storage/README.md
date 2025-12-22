## The Unified SQLite Knowledge Engine (USKE)

This document describes the plugin's "Unified Search" solution (USKE): consolidating **full-text search, vector search, and graph search** into SQLite to reduce memory usage and improve consistency and maintainability.

> Constraint: Currently only supports Desktop. USKE is used as documentation naming only, not as a code naming/label prefix.

### Design Goals
- **Unified**: All search capabilities expressed through SQL (FTS5 / sqlite-vec / Recursive CTE).
- **Low Memory**: Use `better-sqlite3` for file persistence, avoiding the memory inflation pattern of `sql.js` that requires "import/export full bytes".
- **Consistency**: Index updates, deletions, and metadata updates maintain atomicity (within the same DB transaction).
- **Type Safety**: Use Kysely as a type-safe SQL query builder.
- **Extensible**: Future-ready for adding more SQL capabilities (JSON1, expression indexes, more CTE queries, etc.).

### Tech Stack
- **Storage Engine**: `better-sqlite3` (Desktop-only, Node.js)
  - File persistence to user-configured path (`dataStorageFolder`)
  - Use WAL mode to improve concurrent performance
  - Runs on main thread (requires batch writes to avoid UI blocking)
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
  - See comments in `src/core/storage/sqlite/database.ts` for details
- **Query**:
  - Use `WHERE embedding MATCH ?` for KNN search
  - Returns `rowid` and `distance`, join back to `embedding` table via `rowid` to get complete records
- **Hybrid Search**:
  - Full-text search and vector search execute independently
  - Use Reciprocal Rank Fusion (RRF) to merge results

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
  - `DocMetaRepo`, `DocChunkRepo`, `EmbeddingRepo`, `IndexStateRepo`, `RecentOpenRepo`
  - `DocStatisticsRepo`, `GraphNodeRepo`, `GraphEdgeRepo`
- **FTS5 and sqlite-vec Operations**:
  - Use `rawDb` (better-sqlite3) to directly execute raw SQL
  - Because Kysely has limited support for FTS5 `MATCH` and vec0 `MATCH`

