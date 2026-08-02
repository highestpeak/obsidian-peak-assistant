# 生成产物存储治理 Phase 2-5 实施记录

- 日期：2026-08-02
- 状态：Implemented
- 读者：负责生成产物存储治理的维护者
- 对应设计：[生成产物与存储治理实现设计](../specs/2026-08-02-generated-artifact-storage-governance-implementation-design.md)
- 产物目录：[生成产物注册表](../../conventions/generated-artifact-registry.md)

## 结论

Phase 2-4 已完成生产 cutover：

- 昂贵机器事实由 JSON snapshot、分片 JSONL 或 immutable JSON artifact 拥有。
- SQLite 只保留查询投影。
- Markdown 只在用户拥有内容或显式 Materialize 时创建。

Phase 5 完成了旧 writer 停写、幂等导入与 migration journal。所有 legacy Markdown 均不移动、不覆盖、不删除；物理 archive/delete 仍是独立的 owner-approved 工作。

## 最终数据流

```text
domain write
  -> app-owned GeneratedOutputPersistenceRuntime
  -> canonical JSON / partitioned JSONL / immutable artifact
  -> SQLite projection rebuild
  -> Chat / History / Peak Graph / Hub Detail

explicit user action
  -> Brief / Profile / Hub Materialize / Export
  -> Markdown or native user artifact

legacy Markdown
  -> read-only parse + checksum
  -> canonical import + validation event
  -> source preserved
```

这里有三个关键边界：

- 新的 machine-owned Markdown 自动 writer 已从本次迁移范围退出。
- canonical 写入先于 SQLite projection；projection 失败不会使已写事实失效。
- legacy reader 只承担迁移与回滚，不再成为新数据的写入路径。

## 已实现的领域切换

### Chat、Project 与 receipts

- `ChatConversationRecordStore` 按 conversation 分片保存 metadata、message、context 与 tombstone 事件。
- `ChatStore` 对新 conversation 只写 JSONL；旧 `Conv-*.md` 在首次读取或启动迁移时导入，不再续写。
- Project machine state 保存为 JSON snapshot；只有存在 description/instructions 时才创建 `Brief.md`。
- Assistant definition 与 Project Plan state 从 SQLite-only 改为 JSON snapshot；删除使用 tombstone。
- Turn receipt、artifact receipt 与 media job lifecycle 写 JSONL，SQLite 继续提供列表和关联查询。
- Maintenance cleanup 以 canonical tombstone 判断可清理项，不再把“Markdown 文件缺失”当成删除依据。

### Resource Summary 与 User Profile

- Resource Summary 以 source hash、model 与 provenance 写 JSON snapshot；相同来源可复用，旧 Markdown 只读导入。
- User Profile 启动时不再创建空文件。
- Profile proposal、accept 与 reject 保存到 JSONL；只有 accepted content 才写用户可编辑 Markdown。

### Hub virtual-first

- `HubRecordStore` 保存 stable `hubId`、decision、membership、summary version、provenance 与 materialization state。
- Hub Curator 与 Materializer 先写 manifest/events，再更新 `hub_doc` 和 `hub_constituent` 投影。
- scheduler、stale regeneration 与 curator 默认只更新 virtual Hub，不创建 Markdown。
- Peak Graph 使用 `peak-hub://<hubId>` 打开 Hub Detail；用户显式 Materialize 后才生成 Hub note。
- 旧 Hub Markdown 被登记为已物化 source；后台更新不会移动或覆盖该 note。

### AI Graph 与旧 Review

- AI Graph 已使用 stable graph/version identity、immutable version JSON、run JSONL 与 rebuildable SQLite projection；本轮确认它无需第二套实现。
- Auto Review 与 Vault Review 新写入改为 `composer.generation-history` JSONL。
- 旧 Review Markdown 可幂等导入并登记 checksum；生产 runtime 不再创建旧目录 README 或 report Markdown。

## Migration 与 no-delete 保护

启动迁移按以下顺序执行：

1. 读取 legacy source 或 SQLite row。
2. 写 canonical record。
3. 读取并校验 schema/checksum。
4. 追加 imported/validated migration events。
5. 从 canonical record rebuild projection。
6. 保留 legacy source 作为回滚证据。

重复启动使用稳定 record key、event ID 与 checksum 保持幂等。损坏、解析失败或 source hash 冲突会形成 warning，不会以新数据覆盖源文件。

## 主要实现位置

- `src/core/storage/generated-output/`：typed catalog、snapshot、JSONL、artifact body、migration journal 与 projection registry。
- `src/core/storage/vault/ChatStore.ts`：Chat/Project/receipt canonical cutover 与 projection rebuild。
- `src/service/chat/context/`：Resource Summary 与 Profile proposal。
- `src/service/hub/HubRecordStore.ts`、`HubGenerationRuntime.ts`：Hub canonical state、legacy import 与 rebuild。
- `src/service/agents/HubMaterializationAgent.ts`：virtual-first materialization policy。
- `src/service/copilot/CopilotReviewRecordStore.ts`：Document/Vault Review JSONL 与 legacy import。
- `main.ts`、`src/app/context/AppRuntimeRegistry.ts`：app-owned composition、启动迁移与 boot recovery。

## 验证

自动化验证覆盖：

- generated-output registry、path、sync 与 persistence runtime；
- Chat conversation replay、tombstone、Project/Profile/receipt contracts；
- Hub manifest、virtual regeneration、explicit materialization 与 curation retirement；
- AI Graph immutable versions、source updates 与 projection fallback；
- old Review writer retirement 与 runtime ports；
- Maintenance cleanup 的 canonical tombstone 行为；
- production build 与 bundle checks。

最终结果：

- 17 个存储治理 focused test files 全部通过。
- `npm run build` 通过，包含 CSS、production bundle、bundle syntax 与 simulator boundary。
- `npm run audit:boundary` 维持 19 个既有 lower-layer type edge；service -> UI、service -> app shell 与 service/core -> Obsidian side effect 均为 0。
- 全量 `npm run test` 为 395/399；4 个失败是既有或并行变更中的 Chat Streamdown、code theme 与 Composer source/visual guard，未涉及本次 canonical storage 文件。
- `git diff --check` 通过。

本任务没有为通过测试而修改并行 UI 文件。

## 未验证边界

- `INTERACTION NOT VERIFIED`：真实 Obsidian 中从 Peak Graph 点击 virtual Hub、打开 Hub Detail、执行 Materialize、进入原生 Graph。
- 未在脱敏 Vault 副本执行完整 live migration、删除 SQLite 后的全产品浏览恢复。
- 未执行第二 Vault 只同步 required set 的灾备演练。

这些边界不会恢复旧 writer，也不会授权物理删除。它们是后续真实环境验收，不是 canonical storage 实现缺口。

## 回滚

- 保留 legacy Markdown reader；切读异常时可用原文件检查或恢复，不反向覆盖源文件。
- canonical JSON/JSONL 即使 projection 更新失败也保留。
- Hub 可以继续以 virtual detail 工作；已物化 note 不受后台 regenerate 覆盖。
- archive/delete、SQLite 物理搬迁与 `.peak/artifacts` 清理必须独立提交，不与格式回滚混在同一变更中。

## 不要做

- 不批量删除或改名 legacy Markdown。
- 不把 SQLite、FTS、embedding 或 telemetry 提升为同步事实源。
- 不因需要同步就让 JSON/JSONL 进入 Peak knowledge index。
- 不让新 UI surface 直接发明持久化路径或第二套 artifact catalog。
