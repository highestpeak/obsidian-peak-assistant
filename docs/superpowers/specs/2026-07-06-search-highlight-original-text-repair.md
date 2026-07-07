# Search Highlight Original Text Repair

**Status:** Phase 1 shipped; Phase 2–4 superseded by [`2026-07-07-search-highlight-vault-first.md`](./2026-07-07-search-highlight-vault-first.md)
**Date:** 2026-07-06
**Owner surface:** Vault Search / Quick Search
**Related root doc:** [`docs/12-feature-search.html`](../../12-feature-search.html)

> **2026-07-07 update:** Phase 1（`chunkId` 贯通 retriever → `SearchResultItem`；`HighlightSourceResolver` 接管 highlight 源）已 landed 在 `codex/peak-modernization-refactor` 分支。Phase 2–4（继续依赖 `doc_chunk.content_raw` 做 chunk-level snippet）已被 Vault-first spec 替代——那份改成 markdown 类直接读 Vault 文件、停止双写 `content_raw`。本 spec 保留作为 Phase 1 交付历史。

## Summary

Vault Search 的 snippet highlight 需要回到用户原始笔记文本上生成，而不是显示 FTS normalized / segmented content。当前 pipeline 已经把高亮放在 final topK 后，这是正确边界；问题是 final result 不一定带 `contentRaw`，于是 `QueryService.textSearch()` 会回退到 `item.content`。当 `item.content` 来自 `doc_fts.content` 时，它可能是分词后的版本，用户会看到 CJK 字符之间被空格打散的 snippet。

本需求不重写 Search pipeline，也不让每个 retriever 提前做高成本高亮。修复方向是：final topK 后，为需要正文 snippet 的结果按 `path/docId/chunkId` 解析原文，再在原文上生成 snippet 和 span。只有原文回查或 span 映射失败时，才回退现有 `contentRaw ?? content` 行为。

## Reader And Goal

本文读者是后续实现 Search highlight 修复的工程师或 coding agent。读完后应该能拆出实现任务、知道哪些模块要动、哪些行为不能动、怎么验证用户截图里的 bad case。

本文不解释完整 Search 排序，不设计新的 retriever，不调整 RRF/PPR/boost 权重。

## Current Facts

| Fact | Evidence | Why It Matters |
| --- | --- | --- |
| Highlight 只在 final topK 后运行。 | `src/service/search/query/queryService.ts` 在 exclude + topK 后循环 `resultItems`。 | 这个边界要保留，避免每一路 retriever 都做高成本高亮。 |
| Highlight 优先使用 `contentRaw`，缺失时回退 `content`。 | `const raw = item.contentRaw ?? item.content ?? ''`。 | 用户看到分词文本的根因是 `contentRaw` 不稳定。 |
| `HighlightEngine.highlightSnippet()` 实际在 `rawContent` 上找 match。 | `src/service/search/query/highlight-engine.ts`。 | 引擎本身不坏；输入 source contract 需要修。 |
| FTS retriever 返回的是 `DocChunkRepo.searchFts()` 的 `f.content`。 | `src/service/search/retriever/fts-retriever.ts` + `DocChunkRepo.searchFts()`。 | `doc_fts` 存的是 normalized content，不适合作为用户可读 snippet。 |
| `doc_chunk` 同时存 `content_raw` 和 `content_fts_norm`。 | `src/core/storage/sqlite/ddl.ts`。 | 可以优先用 indexed raw chunk，不一定每次都读 Vault 文件。 |
| Vector chunk path 已经能拿到 `content_raw`。 | `src/service/search/retriever/vector-retriever.ts` 调 `getByChunkIds()`。 | 修复可以先覆盖 FTS/stem/meta/PPR 扩展这些缺 raw 的路径。 |

## Problem

用户搜索中文词时，结果 snippet 可能显示为类似“文 档 编 辑 优 化”的分词版本，而不是原始笔记里的“文档编辑优化”。这会破坏两个判断：

1. 用户无法确认这条结果是否真的来自原文。
2. 用户会以为搜索或索引损坏，因为展示文本不像自己的笔记。

这个问题不是排序问题，也不是“高亮颜色”问题。它是 snippet source contract 问题：展示层拿到的不是稳定原文。

## Goals

- Final result snippet text 必须尽量来自原始 Vault 文本或 `doc_chunk.content_raw`。
- Highlight span offset 必须对应最终展示的 snippet text。
- 保留 final topK 后统一 highlight 的成本边界。
- 不因为原文回查失败阻断搜索结果返回。
- 给 debug / trace 留出可见字段，方便判断 snippet 来自 raw chunk、Vault read、normalized fallback 还是 title/path fallback。

## Non-Goals

- 不修改 RRF、PPR、ranking boost 或 LLM rerank 的排序语义。
- 不让 retriever 负责最终高亮渲染。
- 不在本轮设计全文 spell-check、模糊解释或 AI-generated snippet。
- 不要求所有非 Markdown 二进制文档都能回读原始正文；这类文件可以继续用 indexed chunk fallback。

## Proposed Design

### 1. Add a `HighlightSourceResolver`

新增一个 service-layer helper，例如：

```ts
type HighlightSourceKind =
  | 'chunk_raw'
  | 'vault_raw'
  | 'summary_raw'
  | 'title_or_path'
  | 'normalized_fallback';

type HighlightSource = {
  text: string;
  kind: HighlightSourceKind;
  path: string;
  docId?: string;
  chunkId?: string;
};
```

Resolver 输入 final `SearchResultItem`，输出最适合展示的 raw-ish text：

1. 如果 result 有 `chunkId`，先从 `DocChunkRepo` 读取 `content_raw`。
2. 如果没有 chunk raw，但 path 是 Vault 可读 Markdown 文件，读 Vault 原文。
3. 如果 result 是 meta 命中且正文读取不可用，用 title/path 生成短 snippet。
4. 如果 result 是 semantic doc-only summary，保留 summary fallback，并标 `summary_raw`。
5. 最后才使用 `item.contentRaw ?? item.content ?? ''`，并标 `normalized_fallback`。

### 2. Preserve Chunk Identity Through Merge

当前 `RetrieverResult` 类型已经有 `chunkType`，FTS 内部 chunks 也临时有 `chunkId`，但 `FtsRetriever.retrieve()` 最终没有把 `chunkId` 返回出去。为了让 resolver 精准回查 raw chunk，需要把 `chunkId` 加回 result contract：

```ts
type RetrieverResult = {
  path: string;
  docId?: string;
  chunkId?: string;
  content?: string;
  contentRaw?: string;
  ...
};
```

`QueryService` 把 `m.best.chunkId` 传入 `SearchResultItem`。如果多个 chunk decay 合并后只保留 best chunk，这正好符合 snippet 的需要：显示最强命中的 chunk，而不是整篇文件开头。

### 3. Add Raw/Normalized Span Mapping Only Where Needed

理想路径是在 raw text 上直接 match。对 CJK exact term、quoted phrase、大小写差异，这通常足够。

当 raw text direct match 找不到，但 normalized text 有 match 时，再启用 mapping：

1. 用同一套 normalization 逻辑生成 `{ normalizedText, normalizedToRaw }`。
2. 在 normalized text 上找 match。
3. 把 normalized span 映射回 raw offset。
4. 用 raw offset 切 snippet 并渲染 highlight。

这一步是 fallback，不应该成为每次 highlight 的主路径。它主要解决 FTS query 命中经过 normalize 后与 raw 形态不完全一致的场景。

### 4. Keep Result-Level Fallback Explicit

每条 result 可以带 debug-only 元数据，不必直接展示给用户：

```ts
highlightSourceKind?: HighlightSourceKind;
highlightFallbackReason?: string;
```

Debug trace 或未来 Inspector 可以显示这些字段。用户界面只需要看到可读 snippet。

## User-Facing Behavior

| Scenario | Expected Behavior |
| --- | --- |
| 中文 query 命中 Markdown 正文。 | snippet 显示原文中文句子，不出现人为分词空格；query term 正确高亮。 |
| FTS 命中某个 chunk。 | snippet 来自 best chunk 的 raw text，而不是整篇文件开头。 |
| PPR 扩展结果没有直接词命中。 | 可以显示原文开头或最相关 chunk，但不要伪造 query highlight；可用 ranking explanation 说明它来自图关系。 |
| Metadata/title 命中。 | 标题高亮正常；正文 snippet 可以短一些，优先避免展示 normalized text。 |
| 原文文件已删除或读取失败。 | 搜索结果仍返回；snippet 回退现有 content，并记录 fallback kind。 |

## Implementation Plan

### Phase 0 — Characterize Current Bad Case

- 增加一个 fixture：raw text 为连续中文，FTS normalized text 带空格。
- 增加测试证明当前 fallback 会显示 normalized text。
- 记录当前 `SearchResultItem` 是否丢失 `chunkId`。

### Phase 1 — Preserve `chunkId`

- 在 `src/service/search/retriever/types.ts` 给 `RetrieverResult` 加 `chunkId?: string`。
- 在 `FtsRetriever` / `FtsStemRetriever` / vector chunk result 中保留 best chunk id。
- 在 `QueryService.textSearch()` map `MergedResult` 时把 `m.best.chunkId` 带入 `SearchResultItem`。

### Phase 2 — Resolve Raw Highlight Source

- 新增 `HighlightSourceResolver`。
- 优先按 `chunkId` 从 `DocChunkRepo.getByChunkIds()` 取 `content_raw`。
- 只对 final topK 执行 resolver。
- 为 resolver 加批量接口，避免 topK 内 N 次重复读库或读文件。

### Phase 3 — Raw-First Highlight Engine Path

- `HighlightEngine.highlightSnippet()` 保持原 API，新增一个 raw-first wrapper：
  `highlightFinalResult(item, plan, sourceResolver)`。
- direct raw match 成功时直接返回。
- direct raw match 失败且 normalized fallback 有 match 时，走 normalization map。
- 如果都失败，返回原文窗口但无 span，不展示分词文本。

### Phase 4 — Debug And Regression Guard

- 在 search debug trace 里记录 source kind 和 fallback reason。
- 增加 bad-case 测试覆盖 CJK、phrase、missing raw、PPR no-direct-match。
- 更新 `docs/12-feature-search.html` 的 Search evidence 和 bad-case 指针。

## Acceptance Criteria

- 搜索 `编辑` 时，结果 snippet 不显示 `编 辑` 这类人为分词空格。
- FTS result 的 snippet source 优先为 `chunk_raw`。
- 没有 `contentRaw` 的 result 不会默认把 normalized FTS content 当用户可读原文。
- PPR 扩展结果可以没有 query span，但不能展示 misleading normalized snippet。
- 原文回查失败时，search 不 throw；debug 信息能说明 fallback。
- 相关测试通过：
  - `test/highlight-engine.test.ts`
  - 新增 `test/search-highlight-source-resolver.test.ts`
  - 新增或扩展 `test/query-service-highlight.test.ts`

## Risks And Tradeoffs

| Risk | Mitigation |
| --- | --- |
| topK 后读 raw text 增加耗时。 | 只对 visible topK 做；优先读 `doc_chunk.content_raw`；批量取 chunk。 |
| Vault 文件已改但 index 还是旧的。 | 优先 chunk raw 保持与 indexed result 一致；Vault raw 可作为后续 fresh-read option。 |
| Raw direct match 找不到。 | 用 normalization map fallback；仍失败则显示 raw window 无 span。 |
| PPR 扩展结果没有词命中。 | 不伪造 highlight，用 explanation 解释图关系来源。 |
| Resolver 变成隐形复杂入口。 | 保持独立 helper + tests，不把逻辑塞进 retriever 或 UI。 |

## Open Questions

- 是否需要在 UI 里显式区分“text match snippet”和“graph-related snippet”？
- 对 PDF/DOCX 这类 imported content，是否只使用 `doc_chunk.content_raw`，不做 Vault file reread？
- 是否要把 `highlightSourceKind` 暴露到 Debug Trace Inspector，还是先只进 test/debug log？

## Code Reading Order

1. `src/service/search/query/queryService.ts` — final topK 后高亮位置。
2. `src/service/search/query/highlight-engine.ts` — snippet window 和 span offset 规则。
3. `src/service/search/retriever/fts-retriever.ts` — FTS result 如何丢失 raw/chunk identity。
4. `src/core/storage/sqlite/repositories/DocChunkRepo.ts` — `searchFts()` 与 `getByChunkIds()`。
5. `src/core/storage/sqlite/ddl.ts` — `doc_chunk.content_raw` 与 `doc_fts.content` 的 source boundary。
