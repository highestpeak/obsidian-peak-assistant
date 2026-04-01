These numbers come from the **same deterministic formula** as the indexer’s hub-discovery pass: they scale with **indexed document count** so small vaults stay cheap and large vaults get enough headroom.

**Why `limitTotal` exists:** It is derived with **square-root growth** on document count (then clamped to min/max). That keeps total work sublinear in vault size instead of growing one-for-one with every new note.

**What each field means (indexer-aligned):**

- **`limitTotal`** — Upper bound on how many hubs can be **selected in the final merged pool** across document / folder / cluster rounds. It is the main “scale knob” for how broad indexer coverage ambition is.
- **`documentFetchLimit`** — How many **top-ranked document rows** SQL may pull when building document-hub candidates. Larger vaults need a wider candidate pool before thinning.
- **`folderFetchLimit`** — Same idea for **folder** hub candidates: more rows allowed when the budget says the vault is large enough to justify more folder-side exploration.
- **`clusterLimit`** — Cap on cluster-discovery **hub candidates** returned from embedding/graph clustering (a slice of the same overall budget).
- **`topDocExcludeLimit`** — How many **top document hubs** are excluded as **cluster seeds** to reduce overlap between document hubs and cluster centers.
- **`clusterSeedFetchLimit`** — How many top documents by semantic PageRank are fetched as **cluster seeds** before exclusion filtering (recall buffer; also capped for safety).

**Snapshot / agent fields (`maxFolderPages`, `maxExploresPerPage`, `docShortlistLimit`, tree depth, folder caps):** These are **derived from the same `limitTotal` and raw limits** so the LLM-facing snapshot matches what the indexer could afford — not independent knobs.

**How you should use this in recon (not hard rules):**

- Treat the JSON as **coverage ambition**: larger `limitTotal` ⇒ the pipeline expects **more branch-level anchors** across the tree when evidence supports them — not a single mega-root.
- These are **not** a target count of `confirmedFolderHubCandidates` per iteration; they explain **why** the host built a tree of a certain size and how much **parallel** structure the vault can support.
- Prefer **`should_stop: false`** while major themes in the digest are still neither confirmed nor rejected, unless tools show no new paths worth testing.
