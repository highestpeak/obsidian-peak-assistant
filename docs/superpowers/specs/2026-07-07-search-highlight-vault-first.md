# Search Highlight — Vault-First Source Contract

**Status:** proposed
**Date:** 2026-07-07
**Owner surface:** Vault Search / Quick Search
**Related root doc:** [`docs/12-feature-search.html`](../../12-feature-search.html)
**Supersedes (partial):** [`2026-07-06-search-highlight-original-text-repair.md`](./2026-07-06-search-highlight-original-text-repair.md) — that spec's Phase 1 (preserve `chunkId` through retriever → `SearchResultItem`, and route highlight through a resolver) is already shipped on this branch. This document replaces its Phase 2–4 with a Vault-first source design and adds a storage cleanup phase.

## Summary

Vault Search 的 snippet highlight 现在能拿到 raw text，但代价是 `doc_chunk.content_raw` 把每条 markdown chunk 的原文又抄了一份存进 SQLite。同一段内容在库里被存了四遍：`doc_chunk.content_raw`（raw）、`doc_chunk.content_fts_norm`（normalized）、`doc_fts.content`（FTS5 内部同一份 normalized）、`doc_fts_stem.content`（stemmed）。对 markdown / 纯文本类，Vault 磁盘上的 `.md` 才是权威原文，SQLite 里那份 `content_raw` 是冗余。

本 spec 提出：resolver 对 markdown / 纯文本类结果**直接读 Vault 文件**（Obsidian `cachedRead`）作为高亮源，整篇文件喂给 `HighlightEngine` 选窗口；然后停止对这些类型写 `content_raw`。binary / derived 类（PDF / DOCX / PPTX / Image OCR / URL）保留 `content_raw`——它们的提取文本只此一份，是宝贵资产，不能丢。

## Reader And Goal

本文读者是后续实施 Search highlight 存储重构的工程师或 coding agent。读完后应能：区分哪些 `doc_type` 属于"可从 Vault 回读"vs"必须存 extracted-content"；知道 resolver 从哪些 hook 点读文件；知道 Phase 2 迁移能删多少字节、怎么验证不回归；理解为什么 `content_fts_norm` 也可以顺带清掉。

本文不重写 Search pipeline，不改 RRF/PPR/boost/LLM rerank 排序，也不改 chunker 的分片语义。

## Current Facts

| Fact | Evidence | Why It Matters |
| --- | --- | --- |
| `content_raw` 只落 SQLite `doc_chunk`。没有 filesystem cache。 | 全仓 `grep content_raw` 只在 `ddl.ts` / `DocChunkRepo.ts` / `indexService.ts:1090` / retriever/resolver 见到。 | 删除前提是替代源可靠。 |
| Binary loader 的 extracted text 走 `cacheFileInfo.content` 内存中转，最终落 `content_raw`。 | `PdfDocumentLoader.ts:85`, `DocxDocumentLoader.ts:24`, `indexService.ts:1090`。 | 这份就是用户所说的"宝贵资产"。不能删。 |
| Markdown chunker 是原文精确子串。 | `MarkdownDocumentLoader.chunkContent()` 用 `RecursiveCharacterTextSplitter.createDocuments([content])`；`preprocessMarkdownForChunking` 只改 fenced code。 | 对无 fenced-code 的正常 markdown，Vault 原文 = chunk raw 拼接（顺序、字节都对齐）。 |
| `doc_fts` 是 FTS5 非-external 表，自持一份 `content`。 | `ddl.ts:607` `CREATE VIRTUAL TABLE ... doc_fts USING fts5(chunk_id UNINDEXED, doc_id UNINDEXED, content)` 没有 `content='doc_chunk'` clause。 | `doc_chunk.content_fts_norm` 与 `doc_fts.content` 完全重复；前者无消费者。 |
| Obsidian `Vault.cachedRead(TFile)` 走内存 LRU，同 tick 命中 O(1)。 | 官方 API；插件其他 loader（`MarkdownDocumentLoader:131` `vault.readText`）与 `ChatStore.ts:202/322/529` `vault.read` 都直接用。 | 高频重复读是可接受的；topK 内还可加一层 query-scoped 去重。 |
| 老 spec Phase 1 已 shipped：`chunkId` 已加入 `RetrieverResult` / `SearchResultItem` / 各 retriever return；`HighlightSourceResolver` 已接管 highlight 源。 | 本分支 `src/service/search/retriever/types.ts:9`、`src/service/search/query/highlight-source-resolver.ts`、`queryService.ts:244`。 | Phase 1 结果为本 spec 的起点，可直接改造 resolver 优先级。 |
| Chunker 目前**不产 char offset**。`chunk_meta_json` 只装 TextRank / summary 元数据。 | `assembleIndexedChunks.ts:73/93`；`RecursiveCharacterTextSplitter.createDocuments()` 无 offset 输出。 | 方案 B 不依赖 offset；因此不需要动 chunker。 |

## Problem

Phase 1 shipped 后高亮质量已经恢复，但引入了两个次生问题：

1. **存储冗余**：`content_raw` 对 markdown 类完全是 Vault 文件的另存。以典型 vault（N 篇 markdown，平均 M 字节）估算，`doc_chunk` 里的 `content_raw` 约 `N × M`；加上 `content_fts_norm` 与 `doc_fts.content` 两份 normalized（正常情况 CJK 分词后 ~1.5×），仓库文本部分占用远超实际内容。
2. **陈旧风险**：用户改笔记后，Vault 文件是最新的，但 `content_raw` 直到下一次 reindex 才更新；resolver 拿到的 chunk raw 可能落后于文件当前状态，snippet 里会出现"已经删掉的段落"。

## Goals

- Markdown / 纯文本类 highlight 源：**Vault 磁盘原文**优先。永远反映当前文件状态，不受索引滞后影响。
- 停止为 markdown / 纯文本 chunk 写 `content_raw`；一次性清理存量。
- 顺带清理 `doc_chunk.content_fts_norm`（无消费者，与 `doc_fts.content` 重复）。
- Binary / derived 类（PDF/DOCX/PPTX/Image/URL/Canvas/Excalidraw 中的 extracted 文本）**继续**用 `content_raw` 作为唯一 extracted-content 存储。
- 高亮阶段延迟不显著变差（预算 <30 ms 冷启动、<5 ms 热搜索）。

## Non-Goals

- 不改 chunker：不引入 offset、不改分片规则。
- 不改 RRF / PPR / ranking boost / LLM rerank 排序。
- 不改 vector 搜索的 embedding / similarity 计算。
- 不做 `doc_fts` external-content 化（那是正交优化，另开 spec）。
- 不引入 filesystem-based extracted-content cache（未来若要把 PDF 提取文本挪出 SQLite，单独立项）。

## Proposed Design

### 1. 明确"可 Vault 回读"边界

新增一个纯函数 `isVaultReadableSource(doc_type: DocumentType): boolean`，白名单：`markdown` / `plaintext` / `canvas`（Canvas 也是 JSON 文本，`readText` 可读）/ `excalidraw`（`.excalidraw` / `.excalidraw.md` 走 markdown 一致的文件读）。

黑名单（Vault-unreadable，走 `content_raw` 兜底）：`pdf` / `docx` / `pptx` / `image` / `url` / `heading`（虚拟类型无原文文件）。

这个函数是 resolver 唯一的分流入口。今后新增 loader 时必须在这里显式登记，避免忘记。

### 2. Resolver 源优先级重排

现在 `HighlightSourceResolver.resolveOne()` 是：`chunk_raw`（`doc_chunk.content_raw`）→ Vault → `contentRaw` → title/path → normalized。改成：

1. **Vault-first for markdown-like**：如果 `item.type` 属于 Vault-readable 白名单且 `path` 可访问，读整篇文件文本作为 raw source。命中记 `kind: 'vault_raw'`。
2. **Chunk raw for binary/derived**：否则若 `chunkId` 存在，`getByChunkIds()` 拿 `content_raw`。命中记 `kind: 'chunk_raw'`。
3. **Explicit `contentRaw`**：vector 语义 summary 分支的 `contentRaw`。记 `kind: 'summary_raw'`。
4. **Meta / fuzzy label**：`title — path`。记 `kind: 'title_or_path'`。
5. **Normalized fallback**：`item.content`。记 `kind: 'normalized_fallback'`。

### 3. 整篇文件 + hint 高亮

`HighlightEngine.highlightSnippet()` 增加可选参数：

```ts
highlightSnippet(
  rawContent: string,
  normalizedContent: string,
  plan: QueryPlan,
  windowBefore = 80,
  windowAfter = 140,
  hintOffset?: number,      // NEW: 期望 window 起点提示
): HighlightResult
```

`findBestWindow()` 打分公式在 `score = coveredKeywords * 2 + density` 之外加一项 `+ hintProximityBonus`：`hintProximityBonus = HINT_WEIGHT * exp(-(|winCenter - hintOffset|) / decay)`。数值放 `src/core/constant.ts` 里：`SEARCH_HIGHLIGHT_HINT_WEIGHT`、`SEARCH_HIGHLIGHT_HINT_DECAY`。

`hintOffset` 由 resolver 计算：`hintOffset = round(chunkIndex / totalChunks * fileLength)`。`totalChunks` 需要查一次；避免每 item 单独一次 query，用一个 batch call 拿到 `Map<docId, totalChunks>`（见 `DocChunkRepo.countChunksByDocIds()`，需新增）。当拿不到时 hintOffset 传 `undefined`，退化到原打分（不影响正确性）。

### 4. 读文件的批处理和缓存

- **Query-scoped path dedup**：resolver 内维护 `Map<string, Promise<string|null>>`，同一次 `resolveMany` 里同一个 path 只发一次读请求。这里的批处理不是 SQL batch，而是 `Promise.all` + 内存去重。
- **Cross-query LRU**：resolver 通过构造函数注入一个 `VaultTextCache` 端口，实现类可以选择开启 LRU（capacity 建议 32 文件）；测试环境注入 no-op 实现。默认实现挂在 `AppRuntimeRegistry`，跨 query 复用。
- **Read timeout guard**：单个文件读 wrap 一个 200 ms timeout，超时视为 miss，走下一个 fallback。避免慢盘拖垮 highlight 阶段。

### 5. 索引侧：Markdown chunk 停止写 content_raw

`indexService.ts:1082` 的 `upsertChunk` 里根据 `doc.type` 决定 `content_raw`：

```ts
const shouldPersistRaw = !isVaultReadableSource(doc.type);
await docChunkRepo.upsertChunk({
  ...,
  content_raw: shouldPersistRaw ? (chunk.content ?? null) : null,
  content_fts_norm: null,   // 同步停写，见 Section 7
});
```

同一函数下游读 `content_raw` 的地方（`indexService.ts:1034` 复用 chunk content 做重排/摘要生成）改成：如果 `content_raw` 空，且 doc 是 Vault-readable，就重新调 `assembleIndexedChunks` 得到的 chunk 顺序 + `cachedRead` 拿到当前 file，切出对应片段。这一路不是热路径，允许多做一次 file read。

### 6. 存量迁移

一次性 SQL 迁移，写在 `src/core/storage/sqlite/migrations/` 下新脚本 `202607071_drop_markdown_content_raw.ts`：

```sql
UPDATE doc_chunk
   SET content_raw = NULL,
       content_fts_norm = NULL
 WHERE doc_id IN (
   SELECT id FROM indexed_document
    WHERE type IN ('markdown', 'plaintext', 'canvas', 'excalidraw')
 );
VACUUM;
```

迁移 idempotent，重复执行没有副作用。VACUUM 一次以回收磁盘。

### 7. 顺带清 content_fts_norm

由于 `doc_fts.content` 已经在 FTS5 里；`doc_chunk.content_fts_norm` 目前**没有消费者**（全仓 grep 只有写入路径，没有读取路径），可以直接置 NULL；下一波 spec 走一次 `ALTER TABLE ... DROP COLUMN` 或表重建。这一步放到本 spec 的 Phase 2 里，作为"顺手"。

### 8. Debug trace 字段扩展

`SearchResultItem.highlightSourceKind` 已存在。加两个可选字段（debug-only，不入 UI）：

- `highlightVaultReadMs?: number` — Vault 读取耗时。
- `highlightHintOffset?: number` — 传给 engine 的 hint。

`recordFinalizeSearchSummary` 里聚合 `sourceKind` 直方图，写进 debug trace。

## User-Facing Behavior

| Scenario | Expected |
| --- | --- |
| 中文 query 命中 markdown 正文。 | Snippet 直接来自当前 `.md` 文件文本，永远不出现分词空格；改笔记后立刻反映最新内容。 |
| 多 chunk 命中同一 markdown 文件。 | `findBestWindow` 结合 hintOffset 优先选打分最高 chunk 附近的 window。 |
| PDF / DOCX 命中。 | 使用 `content_raw`（extracted text）；行为与 Phase 1 相同。 |
| Excalidraw / Canvas 命中。 | 读取 `.excalidraw` / `.canvas` 文本内容；highlight 直接搜索 JSON 文本里的 query。 |
| Vault 文件被删。 | Vault read 失败 → 走 chunk_raw（若在）→ normalized_fallback；结果仍返回，用 kind 标注。 |
| 慢盘导致文件读 >200 ms。 | 超时视为 miss，走下一个 fallback；不阻塞高亮阶段。 |

## Implementation Plan

### Phase 1 — shipped ✓
- `chunkId` 贯通 retriever → `SearchResultItem`。
- `HighlightSourceResolver` 上线；highlight 循环走 resolver。

### Phase 2 — Vault-first resolver
- 新增 `isVaultReadableSource(type)` 白名单，放 `src/core/search/searchTypes.ts` 或 `src/core/document/types.ts`。
- Resolver 源优先级重排（本文 Section 2）。
- 引入 query-scoped path dedup 和 LRU 端口。
- 引入读文件 200 ms timeout。
- `HighlightEngine.highlightSnippet` 接受 `hintOffset`，`findBestWindow` 加权。常量入 `constant.ts`。
- Resolver 计算 `hintOffset`；`DocChunkRepo.countChunksByDocIds(docIds)` 新增。
- 新增/扩展测试：`test/highlight-source-resolver.test.ts` 覆盖 Vault-first、超时、LRU 命中；`test/highlight-engine.test.ts` 覆盖 hintOffset 加权。

### Phase 3 — 索引侧停写 + 存量迁移
- `indexService.ts` 按 `isVaultReadableSource(doc.type)` 决定是否写 `content_raw`；同步停写 `content_fts_norm`。
- Reindex 的 chunk-read 回退路径（本文 Section 5 末段）。
- 迁移脚本：`202607071_drop_markdown_content_raw.ts`。
- 变更 `docs/12-feature-search.html` 的存储描述段。

### Phase 4 — Debug 打点 + 观测
- `highlightVaultReadMs` / `highlightHintOffset` / `sourceKind` histogram 进 debug trace。
- 在 Inspector（如启用）里展示每条 result 的 source kind。

## Acceptance Criteria

- 搜索 `docs` / `编辑` 时，markdown result 的 snippet：
  1. 不含 `文 档` 这种分词空格。
  2. 与用户当下 `.md` 文件里的正文一字不差（含用户刚保存的新内容）。
- Binary result（PDF/DOCX/Image OCR）snippet 仍来自索引期提取的 `content_raw`。
- `doc_chunk` 表 markdown 类行 `content_raw IS NULL AND content_fts_norm IS NULL`。
- `test/highlight-source-resolver.test.ts`、`test/highlight-engine.test.ts`、`test/query-service-highlight.test.ts`（新增）全绿。
- 迁移脚本可反复执行；不留孤儿 FTS 行。
- 高亮阶段冷启动 <30 ms、热搜索 <5 ms（Stopwatch 覆盖 `highlighting` 段）。

## Risks And Tradeoffs

| Risk | Mitigation |
| --- | --- |
| Vault 文件被 rename／moved 后 `SearchResultItem.path` 与真实路径不一致。 | Resolver 用 `getAbstractFileByPath(path)` 判断 TFile 是否存在；miss 直接走 fallback。索引器已经监听 rename 事件，本条只是防御性。 |
| Chunk hint offset 偏差导致 snippet 选择不理想。 | HINT_WEIGHT 起点 <=1，让密度/覆盖仍主导；开关放 constant.ts 可 tune。 |
| 慢盘 / 移动端 iCloud 冷读文件卡。 | 200 ms timeout；命中 timeout 走 chunk_raw 或 normalized；debug 里标 `sourceKind='normalized_fallback'` + `readMs`。 |
| `content_fts_norm` 隐藏消费者。 | Phase 2 落地前再全仓 grep 一次；如发现遗漏，收归 Phase 3。 |
| 二进制类沿用 `content_raw`，storage 优化不彻底。 | 显式列成 Non-Goal；backlog 里登记"binary extracted-content cache 外迁"作为未来 spec。 |
| Excalidraw / Canvas JSON 全文喂 highlight 可能命中 UUID / 内部字段。 | 可选：resolver 对 canvas/excalidraw 类先跑一次 JSON 文本抽取（提 `text` 字段），失败降回原 JSON。放 open question 里。 |

## Open Questions

- `hintOffset` 是否值得引入？若测试 snippet 质量差异不显著，可裁掉，简化 resolver。
- Canvas / Excalidraw 走"整篇 JSON 全文"是否会产生 UUID 干扰？（需真机验证）
- Binary extracted-content 是否值得后续挪到 `ChatFolder/A-*/extracted/` 文件缓存？（新 spec 讨论）
- `doc_fts` external-content 是否与本 spec 阶段合并？（本 spec 明确 Non-Goal，如需可开姊妹 spec）

## Code Reading Order

1. `src/service/search/query/highlight-source-resolver.ts` — resolver 源优先级现状。
2. `src/service/search/query/queryService.ts:240–260` — highlight 阶段与 resolver 的接线。
3. `src/service/search/query/highlight-engine.ts` — window 打分逻辑，`hintOffset` 落地点。
4. `src/service/search/index/indexService.ts:1044–1103` — chunk / FTS 写入路径，Phase 3 停写 `content_raw`。
5. `src/core/storage/sqlite/repositories/DocChunkRepo.ts` — `getByChunkIds()`、新增 `countChunksByDocIds()`。
6. `src/core/document/loader/PdfDocumentLoader.ts` / `DocxDocumentLoader.ts` — binary loader `cacheFileInfo.content` 来源，说明 `content_raw` 为什么必须保留。
7. `src/core/storage/sqlite/ddl.ts:588–622` — `doc_chunk` / `doc_fts` / `doc_fts_stem` 表定义，说明 `content_fts_norm` 冗余。
