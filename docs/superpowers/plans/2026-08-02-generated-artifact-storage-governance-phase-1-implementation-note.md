# 生成产物与存储治理 Phase 1 实施记录

日期：2026-08-02
范围：shared persistence foundation；不切换任何领域 read path，不删除或移动现有用户/legacy 文件。

## Outcome

Phase 1 已把 typed output policy 从“登记表”推进为 app-owned 的真实持久化 runtime：

- `AtomicJsonSnapshotStore`：schema envelope、稳定 identity、SHA-256 checksum、串行写入、临时文件校验、上一版 backup、崩溃 replace 恢复、损坏文件 quarantine；
- `PartitionedJsonlStore`：按 output/path partition、稳定 event ID 幂等、逐行 checksum、损坏点报告、显式 tail quarantine + valid-prefix repair；
- `GeneratedArtifactBodyStore`：binary/native body 不可变写入、临时文件校验、SHA-256 receipt ref、同内容幂等、同路径异内容 fail-loud；
- `GeneratedOutputMigrationJournal`：DR-17 durable JSONL，记录 source/target/checksum/cutover 状态，重复 checkpoint 不重复追加；
- `GeneratedOutputSyncManifest`：由 50 项 typed catalog 派生 include / conditional / exclude / preserve-legacy，确保同步策略不靠第二张手写表；
- `ProjectionRebuildRegistry`：仅接受 `projection` output，显式声明 canonical source IDs，提供 app-owned rebuilder 注册与报告合同，不进入 Command Palette；
- `ObsidianGeneratedOutputDataAdapter` + `composeGeneratedOutputPersistenceRuntime`：raw Vault byte/text 操作停在 app adapter，core store 不引入 Obsidian；runtime 绑定到每个 `AppRuntimeRegistry` 实例并随 unload 释放。

## Safety contract

- 现有 Chat、Project、Resource、Hub、Composer、AI Analysis read/write path 本 Phase 均未切换。
- snapshot recovery 只移动 machine-owned canonical/backup/quarantine 文件；不会删除 user artifact 或 legacy Markdown。
- JSONL 修复必须显式调用 `quarantineCorruptTail`；原 corrupt stream 以旁路文件完整保留。
- migration source 继续是 `owner-approved-retirement`，后续迁移只 copy/import/validate，绝不自动删除原文件。

## Verification

- `npm run test -- test/generated-output-persistence-runtime.test.ts test/generated-output-registry.test.ts test/generated-output-app-composition.test.ts`：3/3 suites 通过；覆盖 snapshot recovery、JSONL idempotence/quarantine、artifact immutability、migration journal、sync completeness、projection contract 与 app ownership。
- `npm run build`：通过；bundle syntax 与 simulator boundary 通过。
- `npm run audit:boundary`：维持 19 个既有 core-upstream edges；service -> app/ui 为 0，core/service Obsidian import 为 0。
- `git diff --check`：通过。

## Next execution

Phase 2 直接使用本 runtime 迁移 Resource Summary、User Profile、Project state/Brief 和 receipts。每个 adopter 必须先有 legacy fixture、new-format checksum、read parity 与 no-delete assertion；满足后才能停止对应旧 writer。
