You label a vault note with **topic tags** (human-facing: what it is about), **functional tags** (system-facing: what information role it plays when answering questions), and **context tags** (time, place, people) as structured identifiers.

## Functional tags (closed list)
Functional tags MUST be chosen only from this closed list:
{{functionalTagList}}

Use the hints below: if the note clearly reflects a semantic dimension, prefer functional tags listed for that dimension (still pick **1–5** total that best fit the whole note).

**Functional tags are mandatory:** for any non-empty note you **must** output at least **one** `functionalTagEntries` object. Never return an empty `functionalTagEntries` array. If several roles fit, pick the **1–3** strongest; if uncertain, choose the **closest** id from the closed list rather than omitting functional tags.

**Dimension → functional tag hints**
{{functionalHintsTable}}

For each chosen functional tag you may add an optional **label** (short phrase) to disambiguate how this note uses that role (e.g. same id, different emphasis). Omit **label** when unnecessary.

## Context tags (prefix rules — required shape)
Output separate arrays. Each label MUST be **one CamelCase token** starting with the prefix:

- **timeTags**: start with `Time`, then a descriptive part, e.g. `TimeYear2025`, `TimeQuarter2025Q1`, `TimeDecade2020s`. Use when the note clearly anchors to a calendar period or event time. If unknown, use `[]`.
- **geoTags**: start with `Geo`, e.g. `GeoCountryChina`, `GeoCityShanghai`, `GeoRegionEurope`. Use for explicit geography. If unknown, use `[]`.
- **personTags**: start with `Person`, e.g. `PersonEinstein`, `PersonZhangSan` (ASCII transliteration is fine). Real people or clearly named personas only; not generic roles. If unknown, use `[]`.

Do not copy user #tags into these arrays unless they already match the prefix pattern after normalization.

## Document type (vault role)
Express the note’s **high-level role** primarily via **functional tag choice** and optional **labels** (same closed list). You may also emit the optional top-level fields below for structured output; downstream they are **merged into a functional tag label** (no separate storage).

Classify the vault role (not MIME type). Pick exactly one **docType** from:

- **principle** — durable rules, standards, “how we work”, evergreen doctrine.
- **profile** — person/org/entity dossier, biography, contact, resume-like.
- **index** — MOC, hub, curated list, table of contents for a topic area.
- **daily** — journal, dated log, routine capture (often day-scoped).
- **project** — scoped work with goals, tasks, milestones, deliverables.
- **note** — general atomic note (default when nothing else clearly fits).
- **other** — only when none of the above apply.

Include **docTypeConfidence** in `[0,1]` (how sure you are) and a short **docTypeReasoning** (one sentence, max ~500 chars). If the role is unclear, still pick the **best single** label and lower confidence rather than using **other** unless truly none apply.

{{#if title}}
Title: {{title}}
{{/if}}

Content:
{{content}}

{{#if existingTopicTags}}
Prior topic hints (merge or refine; your **topicTagEntries** ids are authoritative): {{existingTopicTags}}
{{/if}}

{{#if existingUserTags}}
User tags from #hashtags and frontmatter (for disambiguation only; may be wrong): {{existingUserTags}}
{{/if}}

{{#if textrankKeywords}}
TextRank key terms (unsupervised; align topic **id** fields with these when they match the note): {{textrankKeywords}}
{{/if}}

{{#if textrankSentences}}
TextRank anchor sentences (extractive; use to ground topic tags): 
{{textrankSentences}}
{{/if}}

Return **only** a JSON object (no markdown fence), shape:
{"topicTagEntries":[{"id":"...","label":"optional short nuance"}],"functionalTagEntries":[{"id":"<id from closed list>","label":"optional short nuance"}],"timeTags":["..."],"geoTags":["..."],"personTags":["..."],"inferCreatedAt":null,"docType":"note","docTypeConfidence":0.7,"docTypeReasoning":"..."}

Rules:
- **topicTagEntries**: 3–12 objects. **id** = short stable topic phrase for search/graph (natural language or compact phrase). **label** = optional extra nuance for *this note* (how it uses the topic); omit or null if unnecessary.
- **functionalTagEntries** (required): **1–5** objects, never `[]`. Each **id** must be exactly one id from the closed list above. **label** optional (omit or null if not needed). Do not skip this field.
- timeTags / geoTags / personTags: each 0–8 items; must match prefix rules exactly.
- **inferCreatedAt**: optional string only (never a number). Prefer compact form **`yyyyMMdd`** (date only) or **`yyyyMMdd HHmmss`** (24h, space between date and time). Example: `20250324 143052`. Use **null** or omit when you cannot infer reliably (do not guess from file path alone).
- **docType** / **docTypeConfidence** / **docTypeReasoning**: optional; **docType** must be one of `principle`, `profile`, `index`, `daily`, `project`, `note`, `other`. Prefer reflecting the role in **functionalTagEntries** first; these fields are optional extras merged into a functional **label** by the plugin.
