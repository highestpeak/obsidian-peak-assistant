# Design Overview: Graph Query Solution

The core idea behind this plugin's graph query solution is described below, focusing on the collaboration mechanism between SQLite and Graphology:

---

## 1. Storage Layer — Persistent SQLite Storage

- **Structured Design**: All node and edge information is uniformly stored in a SQLite database (sql.js or better-sqlite3), which is ideal for local operation within the Obsidian plugin environment.
- **Supported Data**:
  - Document nodes and their metadata
  - All relationships between nodes (references, `tagged_topic` / `tagged_functional` / `tagged_keyword`, folder `contains`, etc.)
- **Key Advantages**:
  - Efficient and lightweight: Basic operations like insert, delete, and neighbor node searches are performed with SQL, providing good performance
  - Only persistent storage is used, so it does not consume excessive memory

---

## 2. Query Layer — Graph Structure Queries

- **Basic Queries**: Common graph-related queries (e.g., fetching neighbors, N-hop traversals) are all implemented efficiently and reliably using SQL in SQLite.
- **SQL Coverage**: Most simple and routine structural relationship analyses rely directly on SQLite/SQL, with no need to load the entire large graph into memory.

---

## 3. Optional — In-Memory Graphology (advanced algorithms)

- **Default**: Relationship queries and UI previews use SQL via `MobiusEdgeRepo` / `GraphRepo` (no full-graph load).
- **If needed**: For community detection, custom shortest path, etc., a caller may build a **temporary** Graphology graph from SQLite rows, then discard it. Metadata stays in SQLite; use `GraphRepo.getNode()` (or repos) when labels/types are required.
- **Selective loading**: Prefer N-hop subgraphs (e.g. `GraphRepo.getPreview`) instead of loading the entire vault graph.

---

## 4. Summary

- **Data always resides in SQLite, keeping the plugin lightweight, stable, and efficient**
- **Graphology is used to build in-memory graphs only when complex analysis is truly needed, saving resources**
- **The vast majority of queries and display tasks are handled efficiently by SQLite**

---

**Design Principles**  
- Use only SQLite to persist the entire graph structure (nodes, edges, and all metadata), supporting all basic relationship queries
- Use Graphology solely for advanced graph algorithm analyses, always in a temporary and minimized manner
- In-memory graphs store only essential structure (node IDs and connections), not metadata
- Metadata (attributes, type, label) remains in SQLite and is queried on-demand when needed
- Support selective loading: load only the subgraph needed for analysis (e.g., 2-hop neighborhood) rather than the entire graph

