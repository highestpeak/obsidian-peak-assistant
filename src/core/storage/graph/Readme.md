# Design Overview: Graph Query Solution

The core idea behind this plugin's graph query solution is described below, focusing on the collaboration mechanism between SQLite and Graphology:

---

## 1. Storage Layer — Persistent SQLite Storage

- **Structured Design**: All node and edge information is uniformly stored in a SQLite database (e.g., sql.js/wa-sqlite), which is ideal for local operation within the Obsidian plugin environment.
- **Supported Data**:
  - Document nodes and their metadata
  - All relationships between nodes (such as explicit edges for tags, links, categories, etc.)
- **Key Advantages**:
  - Efficient and lightweight: Basic operations like insert, delete, and neighbor node searches are performed with SQL, providing good performance
  - Only persistent storage is used, so it does not consume excessive memory

---

## 2. Query Layer — Graph Structure Queries

- **Basic Queries**: Common graph-related queries (e.g., fetching neighbors, N-hop traversals) are all implemented efficiently and reliably using SQL in SQLite.
- **SQL Coverage**: Most simple and routine structural relationship analyses rely directly on SQLite/SQL, with no need to load the entire large graph into memory.

---

## 3. Dynamic Analysis Layer — In-Memory Graphology Graph

- **On-Demand Temporary Construction**: Only when the user needs advanced graph algorithms (such as community detection, shortest path, multi-level graph analysis, etc.), the relevant nodes and edges are read from SQLite and an in-memory Graphology graph object is temporarily built.
- **Minimal Graph Structure**: The in-memory graph only stores the essential graph structure:
  - **Node IDs only** (no metadata like attributes, type, label)
  - **Edge connections and weights** (no edge type or attributes)
  - This keeps memory footprint minimal while preserving graph topology for algorithm execution
- **On-Demand Metadata Loading**: Metadata (attributes, type, label) is stored in SQLite and queried on-demand via `GraphStore.getNode()` when needed, rather than being loaded into memory.
- **Selective Loading**: Supports loading only nodes within N hops (typically 2) of specified center nodes, avoiding full graph loading for large datasets.
- **Minimal Overhead**: Normally, no large in-memory graph objects persist; they are used only for analysis and are released immediately afterwards.
- **Example Workflow**:  
  1. User triggers analysis → SQLite queries required node IDs & edge connections within 2 hops → Build minimal in-memory graph (IDs + connections only)
  2. Perform graph algorithm analysis using Graphology
  3. Query metadata on-demand from SQLite if needed
  4. Once the algorithm finishes, the in-memory structure is destroyed and memory is automatically released

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

