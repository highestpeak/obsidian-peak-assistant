You are completing one **structured submit** step for a **vault intuition skeleton**.

## Merge rules

- You receive **working memory** (JSON) from previous iterations plus **tool results** from this iteration.
- Output a JSON object that **updates** the intuition map. Prefer **refinement** over duplicates: merge logically with prior memory (the host will dedupe by keys).
- **Partitions**: at most **6** high-level buckets. Names must be grounded (digest / backbone / tools). Each partition includes **entryPaths** (0–2 vault-relative folder prefixes where a reader should start browsing that area).
- **Core entities**: up to **8** items; each needs a **location** (folder path or representative note path prefix) and **whyItMatters** (one short clause: why this note matters for understanding the vault).
- **Topology** (see below): up to **8** edges; `relation` must be **complete English**, not graph-label stubs.
- **Evolution**: if time signals are weak, state that the vault looks **static** or **no clear timeline** instead of inventing eras.
- **Entry points** (see below): count scales with vault size (up to **24**), richer prose, navigation-first.
- **should_stop**: true when additional tool rounds are unlikely to improve grounding or coverage.

## Topology: `relation` phrasing

The rendered line is `from → to: relation`. Treat **`relation`** as a short clause that **fully describes the directed link** so a human can read it aloud without missing words.

- Write **3–14 words**, sentence case, **no leading “Is ” / “Are ”** unless the rest is a full clause.
- Use **finite verb phrases** or clear prepositional phrases: e.g. “feeds technical notes into”, “organizes ideas that support”, “documents approaches for”, “overlaps with themes in”.
- **Do not** output dangling predicates that need another object to make sense, e.g. avoid: “is a core component of”, “is represented by”, “belongs to”, “contributes to overall development” when they read unfinished after the colon.
- **Do not** end with a stranded preposition (“of”, “by”, “to”) unless the phrase is already complete (e.g. “feeds into the learning track” is fine).

## Entry points: count and depth

The **Vault scale** block in the user message already gives **N** = how many `entryPoints` to emit (computed by the host). **Do not derive or recalculate N yourself** — copy the count from that block.

- Each `entryPoints` object is one **distinct reader intent**. **Never exceed 24** and never emit more than **N**.
- Emit **exactly N** entry points unless tools prove the vault is **clearly** a single narrow project — then you may use **max(4, N − 2)**; otherwise stick to **N**.
- Each entry point must be a **different navigational intent** (not minor wording variants of the same goal).

Each `entryPoints[]` item:

- `intent`: concrete reader goal in **first person or imperative** (“If you want to understand X…”, “Start here to…”). Avoid generic section titles.
- `startPaths`: **1–2** vault-relative folder prefixes that are realistic first stops (from digest, backbone, or tools).
- `whatYouWillFind`: **about 25–60 words** in **1–2 sentences**. Explain what material lives there, what perspective or workflow it supports, and **why this path is a good first stop** for that intent. This is the main “guide” text — do not keep it to one short sentence.

## Grounding

- Every partition, entity, topology edge, and entry point should be traceable to **digest, backbone, tool output, or Vault scale**. If unsure, omit or shorten and leave an `openQuestions` entry.

## Language

- JSON string fields: **English** (consistent with the rest of the indexing pipeline).
