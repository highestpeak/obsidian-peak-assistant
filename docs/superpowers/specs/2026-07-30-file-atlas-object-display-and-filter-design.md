# File Atlas object display and filter design

> Status: evidence-backed Tree design direction; individual Inspector and
> projection review remains partial
> Date: 2026-07-30
> Implementation: not started; this document does not authorize code changes

> Audit correction (2026-07-30): the first draft was driven too heavily by the
> recorded external-link example. The follow-up recording now covers every
> visible type in the real Tree and directly verifies the H1, Frontmatter,
> paragraph, and external-link Inspectors plus `All` and `Resources`. It does
> not cover every individual Inspector, Filters, search, Overview, Reading, or
> Writing. The canonical real-UI fixture is the Vault-root note
> `Peak File Atlas All Types Review.md`. Source-level findings and the pending
> evidence cells are tracked in
> `2026-07-30-file-atlas-all-types-review-matrix.md`. Do not treat unobserved
> Inspector or projection behavior in this document as visually accepted.

## 1. Problem statement

File Atlas currently identifies many objects by their storage syntax or source
host instead of by the thing a person is trying to recognize.

The clearest example is the external-link run in:

```text
kb2-learn-prd/B-2-创意和想法管理/C-大类-信息聚合-PKM/101-Z-mess.md
```

The source distinguishes:

- `个人知识管理`
- `Wiki software`
- `知识管理软件`
- `知识库`
- `Knowledge worker`
- `Knowledge management`
- `元认知`
- `伟大的辞职`
- `SECI model of knowledge dimensions`
- `Personal information management`
- `Graph (discrete mathematics)`

File Atlas instead renders these rows primarily as repeated
`en.wikipedia.org`. The selected-link Inspector then repeats that domain again
and generates keyword/statistic cards from the URL. The result is technically
traceable but not human-recognizable.

This is not a one-off Wikipedia bug. It exposes a general display-model problem:
one generic `title + sub + preview + keywords + statistics + location` template
is being applied to fundamentally different objects.

## 2. Evidence from `file atlas adjust.mp4`

The 15.8-second recording establishes four related failures:

1. Multiple semantically different Wikipedia pages collapse into identical
   `en.wikipedia.org` rows.
2. The right Inspector promotes the same domain to both the selected title and
   the preview title, while the meaningful page identity is absent.
3. In `All`, prose containing a link is followed by a separately extracted link,
   so the same source line can read as duplicated content.
4. The source note already contains useful labels, including imported
   `URL | title` pairs and named Markdown links. The information is present but
   the Atlas display contract does not preserve or rank it correctly.

The recording also exposes adjacent examples:

- `[PKMer](https://pkmer.cn/)` is represented by a raw-looking paragraph and a
  separate `pkmer.cn` resource.
- `[Fetching Title#7egc](https://github.com/danny0838/webscrapbook)` exposes a
  temporary auto-title placeholder instead of the stable repository identity.
- `learn 学习 https://github.com/OpenBB-finance/OpenBB` creates prose and a
  generic `github.com` resource even though `OpenBB-finance/OpenBB` is the
  recognizable object.
- Frontmatter properties, tags, prose, and resources share almost the same row
  grammar even though users inspect them for different reasons.

### 2.1 Evidence from `file atlas all type preview.mp4`

The 52.37-second follow-up recording uses the canonical all-types fixture. The
visible filename and header totals match the production-parser output:

```text
716 words · 108 blocks · 65 resources
```

It establishes the following cross-type findings:

1. Every visible Tree family is present, so the review is not extrapolated from
   external links alone.
2. Normal headings, plain prose, quote identity, callout identity, hierarchy,
   source order, and collapse-all orientation are useful foundations worth
   preserving.
3. Raw representation leaks across families:
   - quoted ISO dates and flattened arrays in properties;
   - `[[...]]` and `[text](url)` in headings/list items;
   - `flowchart LR` and raw TeX as diagram/formula identity;
   - Vault paths as image/embed/attachment identity;
   - `[^id]`, `<div ...>`, and even an HTML comment as visible content rows.
4. Addressable nested resources repeatedly duplicate their owner paragraph,
   list item, property, table, or footnote in the visible Tree.
5. Authored identity is discarded for Vault aliases, image alt/captions,
   embedded note fragments, and every external-link form.
6. The selected H1 Inspector aggregates URL-heavy content across the document:
   `https ×38`, `org ×22`, and `wiki ×19`. It reports `1160 words`, while the
   file header reports `716 words`. Section statistics therefore do not respect
   a trustworthy object boundary.
7. The selected Frontmatter Inspector repeats the entire serialized metadata and
   then adds generic Keywords/Statistics/Location cards. Its group says
   `15 properties`, although the fixture has 12 property rows plus three
   frontmatter tags.
8. The selected `URL | title` paragraph and its child external link both produce
   URL-token keywords and generic prose metrics; neither promotes the available
   page title.
9. The `Resources` preset begins with expanded ordinary frontmatter properties
   and tags, directly confirming metadata pollution.

Detailed per-type Tree and Inspector verdicts live in the all-types review
matrix. Types whose Inspector was not selected remain explicitly unverified;
their Tree verdict does not silently validate the Inspector.

## 3. Verdict

The current UI is source-first where it should be object-first.

The primary label should answer:

> What is this thing?

The secondary line should answer:

> Where did it come from, and what kind of thing is it?

The preview should answer:

> What useful content or context can I inspect before opening it?

Domain, raw URL, Markdown syntax, line number, and parser state are provenance.
They must remain available, but they should not displace the object's semantic
identity.

## 4. Root causes

### 4.1 External-link identity is discarded

The parser currently assigns the external-link `title` from the extracted
domain. A named Markdown link therefore loses its authored label even though
the source contains it.

This also conflicts with the original File Atlas design, which requires the
first version to expose link text, domain, raw URL, source block, and
named-versus-naked status.

### 4.2 Imported `URL | title` lines are split into two unrelated objects

The note contains several lines in this common imported form:

```text
https://en.wikipedia.org/wiki/Knowledge_base | 知识库 - 维基百科
```

Because the suffix is not standard Markdown-link syntax, Atlas sees:

- a paragraph containing the full line; and
- a bare external-link child whose identity is only the domain.

The title suffix must be treated as companion display metadata for the URL, not
as an unrelated paragraph.

### 4.3 Temporary fetch labels leak into the product identity

`Fetching Title#7egc` is an enrichment state, not user content and not a stable
link title. It should never become the primary row label.

### 4.4 The Inspector is universally composed instead of kind-aware

The current owner-review contract forces Keywords, Statistics, and Location to
appear for every selected object. That produces low-value output such as:

- `wikipedia ×4`
- `org ×4`
- `https ×2`
- word and character counts for a URL

Kind-aware calculation is not enough. Card presence itself must be kind-aware.

### 4.5 Preset names and actual contents have drifted

The current `Resources` preset includes properties and tags, which are metadata,
not reusable resources. The current `Writing` preset contains only tasks,
callouts, and quotes, so its name promises an argument-review capability the
Phase 1 object model does not yet provide.

### 4.6 Inline resources do not have a clear ownership presentation

The data model extracts resources from paragraphs so they can be addressed. That
is useful. Presenting the owner paragraph and every extracted resource as
adjacent peers is not. Addressability and visual duplication are separate
concerns.

## 5. Unified display contract

Every Atlas object should expose four layers, but only when each layer adds
meaning:

| Layer | Purpose | Rule |
| --- | --- | --- |
| Primary identity | Recognize the object | Prefer authored or deterministic semantic names; never default to a domain when a better identity exists. |
| Secondary context | Understand kind and provenance | Kind, site/domain, format, state, count, or parent path. Keep it compact. |
| Preview | Inspect useful content | Render the object's natural representation, not raw syntax, unless the user enters a debug/source mode. |
| Actions | Do the next relevant thing | Reveal/open/copy/add to tray. Do not show actions or cards that do not apply to the object. |

Cross-kind rules:

1. Do not use raw Markdown syntax as the normal row label.
2. Do not show parser/enrichment placeholders as content.
3. Do not repeat the primary identity in the preview.
4. Do not generate generic prose metrics for links, tags, properties, images, or
   attachments.
5. Preserve source order and addressability without rendering the same source
   line twice.
6. Keep raw URL, source text, anchor, and line range discoverable in a compact
   details/source disclosure.

## 6. External-link title resolution

The display title should be selected in this order:

1. Meaningful authored Markdown label.
2. Meaningful imported companion title in a supported `URL | title` line.
3. Provider-aware identity derivable from the URL:
   - GitHub: `owner/repository`
   - Wikipedia: decoded page slug
   - documentation sites: final meaningful path segment plus section when useful
4. Decoded, humanized URL path slug.
5. Domain only when the target is genuinely a homepage or no better identity
   can be derived.

Title cleaning must:

- strip redundant site suffixes such as `- Wikipedia`, `- 维基百科`,
  `· GitHub`, or a repeated domain when the source/site remains visible
  separately;
- decode percent escapes;
- replace `_` and safe slug separators with spaces;
- retain meaningful acronyms and repository casing;
- treat `Fetching Title...`, `Loading...`, `Untitled`, and empty labels as
  unresolved enrichment states;
- keep URL fragments as secondary section context rather than allowing a long
  fragment to dominate the title.

This hierarchy is deterministic and requires no network request. Future
OpenGraph or remote-title enrichment can improve the result, but the UI must
remain useful before enrichment succeeds.

### Expected rendering for the recorded note

| Source | Primary row | Secondary row |
| --- | --- | --- |
| `.../Personal_knowledge_management#References \| 个人知识管理 - 维基百科` | `个人知识管理` | `Wikipedia · References` |
| `.../Wiki_software \| Wiki software - Wikipedia` | `Wiki software` | `Wikipedia` |
| `.../Knowledge_management_software \| 知识管理软件 - 维基百科` | `知识管理软件` | `Wikipedia` |
| `.../Knowledge_base \| 知识库 - 维基百科` | `知识库` | `Wikipedia` |
| `[Fetching Title#7egc](.../danny0838/webscrapbook)` | `danny0838/webscrapbook` | `GitHub · title unresolved` |
| `learn 学习 https://github.com/OpenBB-finance/OpenBB` | `OpenBB-finance/OpenBB` | `GitHub · linked from “learn 学习”` |
| `[PKMer](https://pkmer.cn/)` | `PKMer` | `pkmer.cn` |

Repeated links to the same page with different fragments remain distinct
addressable resources. They may share a primary page title, but their section or
citation fragment must be visible as secondary context. They must never be
deduplicated merely because they share a domain.

## 7. Natural presentation by object type

### 7.1 Structure and prose

| Kind | Tree identity | Inspector |
| --- | --- | --- |
| Heading | Authored heading text | Section context and relevant section-level statistics; no repeated raw `# heading` block. |
| Paragraph | Clean rendered-text excerpt with Markdown syntax removed | Full rendered Markdown; optional prose keywords/statistics. |
| List | `Bulleted list` or `Numbered list` plus item count | Rendered list with item/task counts. |
| List item | Clean item text; task marker removed from identity | Rendered item and owned-resource context. |
| Task | Task text with state icon | Rendered task, checked state, and location; no redundant `task` badge text if the icon/state already communicates it. |
| Quote | Clean quote excerpt | Rendered quote; prose analysis only when it has enough text. |
| Callout | Authored callout title, otherwise meaningful first line | Rendered callout with callout type as secondary context. |

Inline resource ownership:

- In `Reading`, render links naturally inside their owner paragraph/list item and
  hide separately extracted resource children.
- In `Resources`, show the resource as the primary row and show its owner text as
  a short context line.
- In `All`, keep the resource nested under its owner block. Do not render it as an
  adjacent peer.
- A resource-only source line should produce one visible resource row.

### 7.2 Rich blocks

| Kind | Tree identity | Inspector |
| --- | --- | --- |
| Table | Meaningful header summary or `Table`, plus `rows × columns` | Real table preview with bounded scroll. |
| Code | Language plus meaningful first code line, with line count secondary | Syntax-highlighted code; code lines/language, not prose keywords. |
| Math | Formula excerpt | Rendered formula; no generic word count. |
| Mermaid | Diagram title/type when available, otherwise `Mermaid diagram` | Rendered diagram and useful structural counts when available. |

### 7.3 Media and files

| Kind | Tree identity | Inspector |
| --- | --- | --- |
| Image | Authored alt/caption, then filename | Thumbnail, dimensions, format, size, target. |
| Embed | Note/media title or basename | Type-appropriate preview or a clear file card. |
| Attachment | Filename | File type, size, target, and native open action. |

### 7.4 References and metadata

| Kind | Tree identity | Inspector |
| --- | --- | --- |
| Vault link | Authored alias, then note basename | Target note, fragment, path, optional bounded note excerpt. |
| External link | Resolved semantic link title | Site/domain, raw URL, fragment, owner context, open/copy actions. |
| Footnote | Footnote id plus clean first-line excerpt | Rendered definition and backlinks/occurrences when available. |
| Property | Property key | Typed/formatted value; nested link resources if present. |
| Tag | `#tag` | Occurrence and source context; no keyword/statistic cards. |

Date properties should use readable local display formatting in the Inspector,
while preserving the original serialized value in source/details. A property
row should not flatten `key: value` into one oversized pseudo-title.

## 8. Inspector composition

The Inspector should be assembled by object kind, not by a universal fixed card
stack.

| Object family | Default cards |
| --- | --- |
| Prose/section | Natural preview, optional keywords, meaningful statistics, compact location |
| List/task | Natural preview, item/task state counts, compact location |
| Table/code/math/diagram | Native preview, type-specific metrics, compact location |
| Link/reference | Identity + target/site/owner context, compact location, relevant actions |
| Image/file/embed | Native/file preview, media/file metadata, compact location |
| Property/tag | Value or occurrence context, compact location |

Specific corrections:

- Remove Keywords and generic word/character Statistics from external links,
  vault links, tags, properties, images, embeds, and attachments.
- Keep Location available, but collapse it into a compact footer/details row
  unless location is the main thing being inspected.
- For external links, merge the duplicated selected-title and preview-title
  areas into one strong identity card.
- Show raw URL in a selectable/copyable secondary area, not as the visual title.
- Do not render `wikipedia`, `org`, `https`, `wiki`, or similar URL tokens as
  content keywords.

## 9. Filter and preset redesign

### 9.1 Advanced filter groups

The advanced filter should use user-recognizable groups:

| Group | Kinds |
| --- | --- |
| Content | Paragraphs, Lists, Tasks, Quotes, Callouts |
| Links & references | Vault links, External links, Footnotes |
| Media & files | Images, Embeds, Attachments |
| Structured blocks | Tables, Code, Math, Diagrams |
| Metadata | Properties, Tags |

Properties and tags must no longer live under `References`.

### 9.2 Top-level presets

| Preset | Purpose | Phase 1 behavior |
| --- | --- | --- |
| Overview | Quickly understand the file | Headings, tasks, callouts, and high-signal resources. Frontmatter is one collapsed summary, not every property row. |
| Read | Follow the note naturally | Prose, lists, tasks, quotes, callouts, tables, media, code/math/diagrams. Links stay inline with their owner. |
| Actions | Find actionable items | Tasks and action-like callouts. This replaces the misleading Phase 1 `Writing` label. |
| Resources | Inspect reusable/reference objects | Links, footnotes, media/files, and reusable structured blocks. Excludes properties and tags. Owner prose appears only as context. |
| All elements | Inspect the complete parsed object map | Every type in source order, with extracted resources nested under owners. This is a detailed/debug-like view, not the default. |

When persisted claims/evidence/actions/issues are implemented, `Actions` can
evolve into an honest `Review` or `Writing` preset. The current raw-block-only
model should not advertise that future semantic capability early.

### 9.3 Filter behavior

- Headings remain structural anchors and stay visible when needed to preserve
  orientation.
- A filter controls visual projection, not parser ownership.
- Switching presets must not change source order.
- Search should match semantic display labels, aliases, decoded paths, targets,
  and owner context, not only raw source/domain.
- Custom filter changes may keep the modified-dot behavior.
- The result count should count visible meaningful rows, not hidden extracted
  duplicates.

## 10. Acceptance examples

The recorded note is the primary acceptance fixture.

The design is successful only when:

1. The Wikipedia run shows distinct page identities instead of a wall of
   `en.wikipedia.org`.
2. Domain remains visible as provenance but is not the primary identity.
3. `[Fetching Title#7egc]` is not presented as user-facing content.
4. `danny0838/webscrapbook` and `OpenBB-finance/OpenBB` are recognizable without
   opening the links.
5. Named Markdown links preserve their authored labels.
6. `URL | title` lines do not render as a paragraph plus a duplicate domain row.
7. External-link Inspector does not show URL-token keywords or prose word counts.
8. `Resources` does not begin with ordinary frontmatter properties and tags.
9. `Reading` presents the note naturally without separately repeating every
   inline link.
10. `All elements` preserves addressability and source order while nesting
    extracted resources under their owner blocks.
11. All results remain useful without network title fetching.

## 11. Non-goals for the first correction

- No automatic rewrite of the user's Markdown.
- No mandatory network request or OpenGraph crawler.
- No domain-level deduplication of distinct pages.
- No new AI classification requirement.
- No silent grouping that makes an individual resource impossible to select.
- No code implementation under this design-only task.

## 12. Recommended later implementation order

When implementation is explicitly authorized:

1. Preserve authored labels and companion imported titles in the object model.
2. Add a deterministic, tested display-identity resolver.
3. Separate resource ownership from visual projection to remove duplicate rows.
4. Make Inspector cards kind-aware.
5. Correct filter groups and Phase 1 preset semantics.
6. Validate against the recorded note in real Obsidian across `Overview`,
   `Read`, `Actions`, `Resources`, and `All elements`.
