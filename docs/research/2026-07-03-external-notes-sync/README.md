# External Notes Sync — 2026-07-03

## 一句话结论

**分三档决策：flomo（推荐先做，有稳定 API/RSS）；Apple Notes（推荐做，通过 AppleScript / EventKit 单向导入）；Google Calendar（推荐做，用官方 OAuth API 单向导入）。三条都走"每 N 小时全量拉 + 增量哈希 diff → 落 Vault 里 `sync-inbox/<source>/` 子目录 → Vault 索引层照常吃"。不做双向同步（复杂 + 冲突高发）。**

## 逐条源分析

### flomo

- **API 状态**：官方付费用户有 IFTTT + Zapier + Webhook。RSS 也可用（`https://flomoapp.com/mine/?token=...`）。
- **数据**：小卡片（≤ 千字），tag，创建时间。
- **同步方向**：单向 flomo → Vault。
- **推荐 pipeline**：
  1. Settings 里粘 flomo token（存 vault 加密 blob）
  2. 每 6 小时 fetch RSS/API → 拉最近 100 条
  3. 每条转成 `sync-inbox/flomo/<yyyy-mm-dd>-<hash>.md`（frontmatter 带 `source: flomo` + `flomoId`）
  4. 哈希 diff，只写新增
  5. VaultLint / Search 自动索引（因为进了 vault）
- **复杂度**：中。~2-3 天工程。
- **优先级**：**高**。用户明确要过。

### Apple Notes

- **API 状态**：无官方 REST API。可通过：
  - AppleScript（`osascript` bridge）— macOS only
  - EventKit / NotesKit（macOS/iOS 系统 framework）
  - Third-party `apple-notes-liberator` / `notes.app-cli`
- **数据**：富文本、附件、tag、smart folder。
- **同步方向**：单向 Apple → Vault。反向复杂（Apple Notes 富文本 → md 转换有损，且 Apple 不提供写入 API）。
- **推荐 pipeline**：
  1. macOS 用户装配 AppleScript bridge（Obsidian plugin 通过 `child_process` 调 osascript）
  2. 每 12 小时（用户可调）dump 所有 note ID + mtime
  3. mtime 变了的 note → 拉全文 → 写入 `sync-inbox/apple-notes/<title>.md`
  4. iOS 用户暂不支持
- **复杂度**：中-高。macOS 特有代码 + AppleScript 兼容。~1 周工程。
- **优先级**：**中**。需求存在但受限于 macOS。

### Google Calendar

- **API 状态**：官方 REST + OAuth 2。稳定。
- **数据**：事件 title / description / attendees / start-end / location / recurrence。
- **同步方向**：单向 Calendar → Vault（作为 Daily Note 参考）。
- **推荐 pipeline**：
  1. Settings 里通过 OAuth flow 授权（Vault 存 refresh token）
  2. 每小时 fetch 未来 7 天 + 过去 24 小时事件
  3. 每天生成/更新 `sync-inbox/calendar/<yyyy-mm-dd>.md`：
     - Frontmatter: `date: yyyy-mm-dd`, `source: gcal`
     - Body: markdown 表格列出事件
  4. 与 Daily Note plugin 联动（如果启用）
- **复杂度**：中。~3-5 天工程。
- **优先级**：**中-高**。整合"我今天在做什么"的 Ambient Push 场景（D1）。

## 通用架构

一个 `ExternalSyncRegistry` 类似 CapabilityRegistry，每个 source 实现 `ExternalSyncAdapter { name, fetchSince(lastSyncAt): Promise<SyncItem[]>, mapToMarkdown(item): { path, content } }`。核心 loop 用 `SyncScheduler`（复用 CascadeScheduler 的 idle-timer 机制）。

## 竞品参考

- **Obsidian Sync**（官方）：只同步 Vault 内部。
- **Readwise + Obsidian**：Readwise 已经做了这种模式，效果不错。
- **Notion Sync**：闭源。
- **Anytype Sync**：更本地化。

## 决策

- **必要性**：**中-高**。用户明确想要 flomo + Calendar。
- **优先级**：Wave 6。Apple Notes 可以等 macOS-only feature bundle。
- **形态**：单向导入，不做双向。

## Next steps

1. `ExternalSyncAdapter` port 设计
2. flomo adapter PoC
3. Calendar adapter PoC
4. Settings tab
5. Sync scheduler + telemetry
