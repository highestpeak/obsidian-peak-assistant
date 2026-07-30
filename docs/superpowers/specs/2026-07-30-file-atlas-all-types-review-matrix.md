# File Atlas all-types review matrix

> Status: all visible Tree types reviewed in real Obsidian; Inspector and
> projection coverage remains partial
> Date: 2026-07-30
> Scope: review-only; no production implementation

## Canonical fixture

Open this note from the Vault root:

```text
Peak File Atlas All Types Review.md
```

Locked source SHA-256:

```text
c7a7416ead7beac6248a85ff9940d6ed4f7dc2e998801ab5b5153a91ac568fde
```

The note reuses existing Vault assets; every referenced local note/file was
checked to exist.

Production-parser coverage:

```text
property       12
tag             4
heading        12
paragraph      42
list            4
list-item       8
task            3
callout         2
quote           1
table           1
code            1
math            1
mermaid         1
image           2
embed           3
attachment      2
footnote        2
vault-link     12
external-link  24
```

Missing parsed kinds: none.

`Frontmatter` is a synthetic visible group created after parsing. `FileRoot` is
a synthetic model type and is not rendered as a Tree row, so it is explicitly
out of the visual matrix.

## Real-Obsidian recording

Owner-provided recording:

```text
/Users/zhangjike/Downloads/file atlas all type preview.mp4
```

Recording SHA-256:

```text
d98c0f40ce4b7cc086c1f2a9a0738634fe277fe806f3da900b91ded91c4e5724
```

The recording is 52.37 seconds at 3456 × 2168. Its visible file name and header
counts (`716 words`, `108 blocks`, `65 resources`) match the canonical fixture
and production-parser output. This is sufficient for a current-state product
review, but it is not a pixel-parity evidence set.

Coverage by timestamp:

- `00:04`: collapsed `All` Tree and selected H1 Inspector.
- `00:08`: expanded Frontmatter Tree and Frontmatter Inspector.
- `00:15–00:47`: continuous Tree traversal through every visible type.
- `00:24`: lists, nested lists, list items, and tasks.
- `00:29`: callout, table, code, Mermaid, math, and both image forms.
- `00:33`: embeds, attachments, and Vault-link variants.
- `00:39.5`: selected `URL | title` paragraph Inspector.
- `00:40.5`: selected Wikipedia external-link Inspector.
- `00:46`: footnotes, HTML blocks, and the document tail.
- `00:49`: `Resources` preset with Frontmatter expanded.
- `00:51`: return to `All` and collapse-all result.

The recording did **not** open the Filters popover, search, `Overview`,
`Reading`, or `Writing`. It also did not select an Inspector example for every
type. Those cells remain explicitly unverified.

## Evidence levels

- `SOURCE VERIFIED`: observed from the current production parser/view-model and
  the canonical fixture output.
- `TREE REVIEWED`: the type's real row, hierarchy, identity, and surrounding
  projection were visible in the recording.
- `INSPECTOR REVIEWED`: a representative row of that type was selected and its
  Inspector was readable.
- `NOT VERIFIED`: the recording did not show that surface. The source-level
  implementation concern remains a hypothesis, not a visual verdict.

Source inspection cannot upgrade an Inspector or projection to `REVIEWED`.

## All visible types

The verdicts below are per presentation layer. A type can have a reviewed Tree
verdict while its Inspector remains unverified.

| Visible type | Real Tree observation | Tree verdict | Inspector verdict |
| --- | --- | --- | --- |
| Frontmatter group | The group says `15 properties`, but the fixture has 12 property rows plus three frontmatter-tag rows. Expanding it produces a long metadata dump before document content. | **REDESIGN · TREE REVIEWED.** Separate property count from tag count and keep metadata as a compact, collapsed summary outside resource-oriented views. | **REDESIGN · INSPECTOR REVIEWED.** The primary card repeats the whole serialized frontmatter, followed by document-like Keywords/Statistics/Location cards. It is neither a concise summary nor a typed property inspector. |
| Property | Dates are quoted UTC ISO strings; arrays, wikilinks, and URLs are flattened into `key: value`. Link-valued properties add a second nested resource row. | **REDESIGN · TREE REVIEWED.** Use key as identity, typed value as secondary content, readable local dates, and a single ownership presentation for nested resources. | **NOT VERIFIED.** No individual property was selected. |
| Tag | `#tag` is recognizable, and inline versus frontmatter is shown in the sublabel. Frontmatter tags all point to line 1 and also contribute to the group's misleading property count. | **ADJUST · TREE REVIEWED.** The row grammar is usable; correct grouping/count/location semantics and avoid duplicating the `tags` property plus individual tag rows without an explicit reason. | **NOT VERIFIED.** No tag was selected. |
| Heading | Normal headings and hierarchy scan well. A heading containing a wikilink leaks raw `[[...]]` syntax and also owns a separate Vault-link child. | **ADJUST · TREE REVIEWED.** Preserve authored rendered heading text while nesting addressable resources without raw syntax or visual duplication. | **REDESIGN · INSPECTOR REVIEWED.** The selected H1 shows no natural section preview; its keywords are dominated by whole-document URL tokens (`https ×38`, `org ×22`) and its `1160 words` conflicts with the file header's `716 words`, showing an invalid section boundary/metric contract. |
| Paragraph | Plain prose is readable, but mixed-resource paragraphs are followed by extracted resource rows. `URL \| title` stays as a raw URL paragraph, HTML appears as `<div ...>`, and an HTML comment becomes a visible content row. | **REDESIGN · TREE REVIEWED.** Keep the plain-prose row, but redesign projection for inline resources, imported URL-title lines, HTML rendering, and invisible comments. | **REDESIGN · INSPECTOR REVIEWED.** The selected URL-title paragraph repeats raw URL syntax and creates URL-token keywords and generic prose metrics instead of recognizing a link-import record. |
| List | `Bullet list` containers and nesting are visible, but nested one-item lists repeat generic containers and display the grammatical error `1 items`. | **ADJUST · TREE REVIEWED.** Keep hierarchy; improve singular/plural, reduce container repetition, and surface a useful first-item/context summary. | **NOT VERIFIED.** No list container was selected. |
| List item | Plain items are readable. Items containing Vault or external links keep raw Markdown/wikilink syntax and then add a resource child. | **REDESIGN · TREE REVIEWED.** Render clean item text and keep owned resources selectable without exposing source syntax twice. | **NOT VERIFIED.** No list item was selected. |
| Task | Task text and hierarchy are clear, but checked state is repeated by icon, `Checked`/`Unchecked` sublabel, and `task` badge. | **ADJUST · TREE REVIEWED.** Keep the task row and hierarchy; reduce redundant state/type signals. | **NOT VERIFIED.** No task was selected. |
| Quote | The quote is distinguishable and uses a meaningful excerpt in the Tree. | **KEEP · TREE REVIEWED.** No Tree-level identity failure was visible. | **NOT VERIFIED.** Title/preview repetition and generic cards were not shown. |
| Callout | Authored titles such as `长内容警告` and callout type are recognizable; linked content still participates in the general owner/resource duplication pattern. | **ADJUST · TREE REVIEWED.** Preserve this identity grammar and fix owned-resource projection. | **NOT VERIFIED.** No callout was selected. |
| Table | The title is a flattened run of header cells (`能力 当前对象 审查重点 参考`); `3 rows · 4 columns` is useful secondary context. Resource children also appear below it. | **ADJUST · TREE REVIEWED.** Keep dimensions, but use a short semantic table label and avoid flattening every header into the primary identity. | **NOT VERIFIED.** Table preview, overflow, and cards were not shown. |
| Code | The row is only `typescript code block` plus `10 lines`; it identifies syntax but not what the code is. | **ADJUST · TREE REVIEWED.** Use language as secondary metadata and a meaningful first code line or explicit block label as identity. | **NOT VERIFIED.** Code rendering and metrics were not shown. |
| Math | Raw TeX (`\\operatorname{display}{x} =`) is promoted to the Tree identity. | **REDESIGN · TREE REVIEWED.** Use a bounded formula rendering/excerpt, not parser source syntax. | **NOT VERIFIED.** Rendered formula and cards were not shown. |
| Mermaid | The row is `flowchart LR`, which exposes diagram grammar rather than purpose. | **ADJUST · TREE REVIEWED.** Prefer an authored/derived diagram label, with diagram type secondary. | **NOT VERIFIED.** Diagram sizing and metrics were not shown. |
| Image | The Markdown image uses `public-image/20250703182542769.png`; the Obsidian embed uses a long Vault path. The authored alt/alias/caption is absent. | **REDESIGN · TREE REVIEWED.** Identity must prefer authored alt/caption, then filename; path is provenance. | **NOT VERIFIED.** Thumbnail, dimensions, file format, and actions were not shown. |
| Embed | Note-section, Canvas, and Base embeds are presented as long target paths/basenames. The note heading fragment is not visible, so the precise embedded target is unclear. | **REDESIGN · TREE REVIEWED.** Differentiate note section, Canvas, and Base; preserve the selected fragment and use human file identity. | **NOT VERIFIED.** Type-specific previews were not shown. |
| Attachment | PDF and MP4 can be inferred from their filenames, but both use full `A-resources/...` paths and the same generic attachment grammar. | **ADJUST · TREE REVIEWED.** Use filename as identity, file type as secondary metadata, and path only in details. | **NOT VERIFIED.** PDF/video preview and native-open affordances were not shown. |
| Footnote | References remain raw `[^atlas-source]` in paragraphs; definitions are titled only by `[^id]` and own another resource child. | **REDESIGN · TREE REVIEWED.** Present clean definition excerpts and occurrence/backlink context; keep the id secondary. | **NOT VERIFIED.** No footnote was selected. |
| Vault link | Alias links collapse to the target note name; heading and block fragments become long technical target strings. Each label paragraph is also shown separately. | **REDESIGN · TREE REVIEWED.** Preserve authored alias, render fragment meaningfully, and show owner context without a redundant sibling row. | **NOT VERIFIED.** Target preview and action cards were not shown. |
| External link | Named links, bare URLs, imported `URL \| title` lines, GitHub links, and many Wikipedia pages all reduce to domains. The owner paragraph remains next to the resource row. | **REDESIGN · TREE REVIEWED.** Resolve semantic page/repository identity, keep domain secondary, and fix owner/resource projection. | **REDESIGN · INSPECTOR REVIEWED.** The title and preview repeat `en.wikipedia.org`; keywords are URL tokens, generic word/character counts are meaningless, and the authored/imported page title is absent. |

## Owner review: current → target examples

This is the concrete approval table. `ADJUST` is the label used in this
document for the user's “adapt” category.

| Verdict | What it means in this design |
| --- | --- |
| **KEEP** | The current object identity and row grammar are already correct. Preserve them; only fix incidental consistency or card noise if later evidence requires it. |
| **ADJUST** | The user can recognize the object today, but its label hierarchy, metadata, repetition, grammar, or Inspector composition needs a bounded change. |
| **REDESIGN** | The current primary identity, preview, or visible object boundary represents the wrong thing. Replace that presentation contract rather than styling the same content differently. |

The target examples below are proposals for owner review, not claims that the
new UI has been implemented.

| Type and verdict | Current recorded example | Target design example | Actual change |
| --- | --- | --- | --- |
| Frontmatter · **REDESIGN** | Tree: `Frontmatter · 15 properties`. Inspector: the entire serialized block, then Keywords, Statistics, and Location. | Tree: `Metadata` with secondary `12 properties · 3 tags`, collapsed by default. Inspector: a typed summary containing `Status review`, `Priority 2`, `Published No`, `Updated 30 Jul 2026`; no keyword or prose-statistics cards. | Stop counting tags as properties. Replace the raw source dump with a typed metadata summary; raw YAML moves under `Source details`. Exclude this group from `Resources`. |
| Property · **REDESIGN** | `created: "2026-07-30T15:55:00.000Z"` as one long title. A link-valued property also creates a child resource row. | Primary `Created`; secondary `30 Jul 2026 · 3:55 PM`. Inspector: typed date value, property key, and compact location. The ISO source value appears only in `Source details`. | Key becomes identity; formatted value becomes content. Arrays, booleans, dates, URLs, and Vault links receive type-aware value renderers instead of one flattened string. |
| Tag · **ADJUST** | `#peak/file-atlas`, secondary `Frontmatter tag`, location line 1; the same data is also visible inside the `tags` property. | Primary remains `#peak/file-atlas`; secondary `Frontmatter · tags · 1 occurrence`. Inspector lists occurrences and source context; no Keywords or Statistics. | Keep the recognizable tag row. Correct location/count semantics and make the relationship to the `tags` property explicit instead of looking like accidental duplication. |
| Heading · **ADJUST** | `带资源的标题 [[Peak Composer Visual Parity QA\|视觉基准]]`, plus a separate child Vault link. The selected H1 Inspector shows `https ×38` and `1160 words`. | Tree primary `带资源的标题 视觉基准`; optional nested resource `视觉基准`, secondary `Vault link · Peak Composer Visual Parity QA`. Inspector shows a rendered section excerpt and `2 paragraphs · 2 resources`; no whole-document URL keywords. | Render inline markup in the heading identity. Preserve the resource as an addressable child without showing raw syntax. Recalculate section metrics from the actual heading range. |
| Paragraph · **REDESIGN** | A resource-only line appears as the raw URL-title paragraph, followed by `en.wikipedia.org`. Mixed prose similarly appears beside a child resource. | Resource-only line becomes one row: primary `个人知识管理`; secondary `Wikipedia · References`. Mixed prose remains one rendered paragraph with the link inline; the resource is available on expand or in `Resources`. | Decide projection from ownership: natural paragraph in reading contexts, resource row in resource contexts, nested child in `All`. Do not render both as adjacent content. |
| HTML block, paragraph subtype · **REDESIGN** | `<div class="atlas-review-html">` is the row title, and `<!-- comment-only... -->` becomes a visible content row. | The div row uses rendered text `这是一段 HTML block…`, secondary `HTML block`. Comment-only blocks are hidden from normal projections and available only in source/debug details. | Stop treating implementation syntax and invisible comments as document content. |
| List · **ADJUST** | Repeated generic containers such as `Bullet list · 1 items`. | Primary `Bulleted list`; secondary `1 item · 子项目：保留层级…`. Inspector renders the list and shows `1 item · 1 nested list · 1 task` when applicable. | Keep list hierarchy, fix singular/plural, and add a bounded content cue so several nested list containers are distinguishable. |
| List item · **REDESIGN** | `第二条包含 Vault 资源：[[Peak Composer Visual Parity QA\|Composer 视觉基准]]`, followed by another Vault-link row. | Primary `第二条包含 Vault 资源：Composer 视觉基准`; the resource is nested only when expanded, with secondary `Vault link · Peak Composer Visual Parity QA`. | Render clean item text and separate addressability from default visual duplication. |
| Task · **ADJUST** | State is repeated by the checkbox icon, `Checked`/`Unchecked`, and the `task` badge. | Checkbox icon plus primary `未完成任务：检查 Inspector 的状态和动作`; secondary `Open · 列表、嵌套项目与任务`. Inspector shows the rendered task, state, and location. | Keep task identity and hierarchy. Use one strong state signal and remove redundant type/state labels. |
| Quote · **KEEP** | Primary is the clean quote excerpt: `真正自然的预览应该优先呈现内容…`. | Keep the same Tree row. Inspector renders the quote once, with compact location; prose analysis appears only when the quote is long enough to produce useful results. | No Tree identity redesign. Do not add cards merely for visual consistency with other types. |
| Callout · **ADJUST** | Primary `长内容警告`; secondary `warning callout`; badge `callout`. | Primary `长内容警告`; secondary `Warning · 1 paragraph`. Inspector renders the callout and lists its owned resources below the preview. | Keep the authored title. Consolidate duplicated type labels and make owned content/resources part of one callout inspection. |
| Table · **ADJUST** | Primary is all flattened headers: `能力 当前对象 审查重点 参考`; secondary `3 rows · 4 columns`. | Without an authored caption: primary `Table`; secondary `3 × 4 · 能力 / 当前对象 / 审查重点 / 参考`. With a future explicit caption, the caption becomes primary. Inspector shows the real table in bounded horizontal scroll. | Keep dimensions, move headers to compact context, and avoid pretending an automatically concatenated header string is a semantic title. |
| Code · **ADJUST** | `typescript code block · 10 lines`. | Primary `AtlasDisplayIdentity interface`; secondary `TypeScript · 10 lines`. Inspector shows syntax-highlighted code and language/line metadata, without prose Keywords. | Derive deterministic identity from the first meaningful declaration; keep language as metadata rather than the whole title. |
| Mermaid · **ADJUST** | `flowchart LR`, secondary `Mermaid diagram`. | Primary `Source block → Display identity`; secondary `Flowchart · 6 nodes`. Inspector shows the rendered diagram, with Source available separately. | Prefer an authored title or a bounded endpoint summary. Keep Mermaid grammar out of the primary identity. |
| Math · **REDESIGN** | Raw TeX `\operatorname{display}{x} =` becomes the row title. | Primary uses a compact rendered formula: `display(x) = identity(x) + context(x)`; secondary `Display math`. Inspector shows the full rendered equation; no word or character count. | The natural representation is the formula, not its TeX source or prose metrics. |
| Image · **REDESIGN** | `public-image/20250703182542769.png` or a long Vault path; authored `Auckland 路线图` is absent. | Primary `Auckland 路线图`; secondary `PNG · 20250703182542769.png`. Inspector shows the thumbnail, dimensions, size, path, and Open/Reveal actions. | Identity resolution becomes `authored alt/caption → filename → path fallback`. Path is provenance, not title. |
| Embed · **REDESIGN** | A note-section embed, Canvas, and Base all appear mainly as long paths/basenames; the note heading fragment is lost. | Note example: primary `知识库不是单一目录，而是多种结构叠加`; secondary `Peak Composer Visual Parity QA · note section`. Canvas example: `pkm-composer`, secondary `Canvas`. | Preserve the precise embedded target and distinguish embed families. Inspector uses a note excerpt, Canvas card, or Base card rather than one generic media preview. |
| Attachment · **ADJUST** | `A-resources/UOA 新生攻略.pdf` and `A-resources/iShot_2023-09-20_11.09.49.mp4` use the same generic file grammar. | Primary `UOA 新生攻略.pdf`; secondary `PDF · A-resources`. Video primary `iShot_2023-09-20_11.09.49.mp4`; secondary `Video · A-resources`. Inspector provides type, size, path, and native Open. | Keep the recognizable filename and differentiate file type. Demote folder path to provenance. |
| Footnote · **REDESIGN** | Paragraphs expose `[^atlas-source]`; definition rows are only `[^atlas-source]` and `[^atlas-decision]`, followed by resource children. | Primary `来源脚注：这是来源脚注，包含 File Atlas 外部设计参考`; secondary `atlas-source · referenced twice`. Inspector renders the definition and both occurrence backlinks. | Use definition content as identity, keep the id secondary, and connect definitions to occurrences instead of exposing Markdown syntax. |
| Vault link · **REDESIGN** | Alias `PKM 产品分析` is discarded and the row becomes `Peak Composer Visual Parity QA`. Heading/block links become long technical target strings. | Alias example: primary `PKM 产品分析`; secondary `Peak Composer Visual Parity QA · Vault note`. Heading example: primary `图算法与公式`; secondary `Peak Composer Visual Parity QA · Heading`. Inspector shows a bounded target excerpt and the exact path/fragment in details. | Identity resolution becomes `authored alias → target heading/block label → note basename`; raw path and fragment move to provenance. |
| External link · **REDESIGN** | Many distinct pages become `en.wikipedia.org`; Inspector repeats the domain and shows keywords such as `wikipedia`, `org`, and `https`. | Primary `个人知识管理`; secondary `Wikipedia · References`. Inspector has one identity card, raw URL under details, owner context, and Open/Copy actions. GitHub example becomes `obsidianmd/obsidian-api`, secondary `GitHub`. | Identity resolution becomes `authored label → imported companion title → provider identity → decoded slug → domain fallback`. Remove URL-token Keywords and prose Statistics. |

### Projection examples

The same parsed object can project differently without creating a second data
model:

| Surface | Current example | Target example |
| --- | --- | --- |
| Reading | A prose row and every extracted link can appear as separate adjacent rows. | Render the prose once with links inline. Extracted resources remain addressable but are not repeated as reading content. |
| Resources | Begins with expanded Frontmatter properties and tags. | Show external/Vault links, footnotes, images, embeds, attachments, tables, code, math, and diagrams. Exclude ordinary properties/tags; show their owner as secondary context only when relevant. |
| All elements | Preserves source order but exposes owner/resource duplication and raw syntax. | Preserve source order and headings; nest extracted resources under their owner. A resource-only source line produces one resource row. |
| Inspector | Universal Preview + Keywords + Statistics + Location stack. | Compose cards by family: prose analysis for prose, target/context for links, native preview and metadata for media/files, typed values for properties, occurrences for tags. |

## Cross-type verdict

The recording does **not** support treating this as a collection of isolated
title bugs. It shows three shared model failures:

1. **Identity resolution:** property values, raw syntax, domains, paths, and
   parser grammar are promoted above authored semantic identity.
2. **Ownership projection:** inline/nested resources are addressable, but their
   owner block is usually rendered beside them as duplicate visual content.
3. **Inspector composition:** one prose-oriented card stack is applied to
   sections, frontmatter, and links even when the calculations cross object
   boundaries or carry no meaning.

## Preset and filter projections to review

Type rows alone are not enough. Each projection must be inspected against the
same canonical note.

| Projection | Recording evidence | Verdict |
| --- | --- | --- |
| Overview | Not opened. | **NOT VERIFIED** |
| Reading | Not opened. | **NOT VERIFIED** |
| Writing | Not opened. | **NOT VERIFIED** |
| Resources | At `00:49`, the view begins with the expanded Frontmatter group and all ordinary properties/tags; link-valued properties add nested resources. | **REDESIGN · REVIEWED.** This is metadata pollution, not a resource view. The preset needs resource-first rows with owner/property context kept secondary. |
| All | The full continuous scroll preserves source order and hierarchy, but exposes raw syntax, generic rows, and repeated owner/resource pairs. Collapse-all returns to Frontmatter plus the H1 anchor. | **REDESIGN · REVIEWED.** The structural backbone is sound; row identity and projection semantics are not. Keep collapse/source-order behavior while changing the display model. |
| Filters popover | The button is visible but never opened. | **NOT VERIFIED** |
| Search | The input is visible but never used. | **NOT VERIFIED** |

## Remaining real-UI capture

The running Obsidian instance currently exposes no CDP listener, so automation
must not guess or replace evidence with coordinate clicking.

The all-types Tree pass is complete. A smaller follow-up recording is sufficient
to close the remaining Inspector and projection cells:

1. Open the full `Filters` popover once.
2. Click `Overview`, `Reading`, and `Writing`, pausing on each complete result.
3. In `Resources`, select one representative of each still-unverified family:
   property, tag, list/task, quote/callout, table/code/math/Mermaid, both image
   forms, note/Canvas/Base embed, PDF/MP4 attachment, footnote, and Vault
   alias/fragment.
4. Use search once for an authored alias/title that is not the target path or
   domain.
5. Keep each selected Inspector visible long enough to read the natural preview,
   cards, and actions.

The subsequent review must replace every `NOT VERIFIED` cell with:

- `KEEP`
- `ADJUST`
- `REDESIGN`
- `NOT COMPARABLE`

The missing Inspector cells must continue to stay `NOT VERIFIED` until that
evidence exists. No type may inherit the external-link verdict by analogy.
