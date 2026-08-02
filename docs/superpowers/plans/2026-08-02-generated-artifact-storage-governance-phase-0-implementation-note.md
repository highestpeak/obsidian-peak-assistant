# 生成产物与存储治理 Phase 0 Implementation Note

- 日期：2026-08-02
- 状态：**Complete**
- 范围：typed registry、policy/path guards、writer coverage、app ownership、AI Graph first adopter
- 不包含：任何现有 Chat / Project / Resource / Hub 数据迁移，legacy 文件删除，sync transport 配置

## Outcome

Phase 0 已把“系统到底会持久化什么”从文档约定提升成运行时可查询、测试锁定的 typed policy。

- 49 个 descriptor 对应 Artifact Registry 的 `UA-01..15`、`DR-01..16`、`LP-01..10`、`LG-01..08`。
- catalog 按 Chat、Profile、Analysis、Graph、Composer/Media、Local/Legacy domain 拆分，不进入 `core/constant.ts` 或用户 config。
- `AppRuntimeRegistry` 创建并拥有唯一 `GeneratedOutputRegistry`；没有 service singleton 或 `AppContext.getInstance()` 新捷径。
- AI Graph 的 artifact body 和 run event 目录通过 registry 解析；解析结果保持当前物理路径，不触发迁移。
- source guard 扫描 25 个直接 Vault / adapter / fs writer；3 个通用 IO adapter 单独 allowlist，其余必须出现在 descriptor evidence。

## Files

```text
src/core/storage/generated-output/
├── GeneratedOutputRegistry.ts
├── types.ts
├── index.ts
└── catalog/
    ├── helpers.ts
    ├── chatOutputs.ts
    ├── profileOutputs.ts
    ├── analysisOutputs.ts
    ├── graphOutputs.ts
    ├── composerMediaOutputs.ts
    ├── localLegacyOutputs.ts
    └── index.ts

src/app/context/AppRuntimeRegistry.ts
src/app/ai-graph/AIGraphStoragePaths.ts
src/app/ai-graph/composeAIGraphArtifactRuntime.ts
main.ts
test/generated-output-registry.test.ts
test/generated-output-app-composition.test.ts
```

## Enforced invariants

| Invariant | Enforcement |
| --- | --- |
| Descriptor/runtime ID 与文档 ID 唯一 | constructor validation + doc parity test |
| Durable record 必须 `sync=required` | constructor validation |
| Durable record 排除 Peak index、不得物化 | constructor validation |
| SQLite 只能作为 projection | constructor validation |
| Projection/cache/telemetry 必须 local-only | constructor validation |
| 非 legacy Markdown 必须 user-owned | constructor validation |
| JSON/JSONL 必须有正 schema version | constructor validation |
| Legacy source 必须声明 replacement 与 owner-approved retirement | constructor validation |
| Path 变量不可缺失或目录穿越 | resolver validation |
| 新 direct writer 必须登记或属于通用 adapter | source coverage test |

## Verification

```text
PASS  generated-output-registry
PASS  generated-output-app-composition
PASS  app-runtime-registry
PASS  ai-graph-artifact-runtime
PASS  npm run build
PASS  npm run audit:boundary
```

Focused registry 输出：

```text
49 documentation rows matched
25 direct writer files covered
AI Graph custom path injection passed
path traversal bad cases rejected
```

全量测试：`394/398`。

未通过的 4 项不在本任务 diff 中：

- `chat-studio-message-state-ui`：既有 Streamdown source-string assertions；
- `code-block-theme-settings`：既有 Streamdown settings event assertion；
- `composer-architecture-source-guards`：当前分支 `CopilotView.tsx` 引用共享 `ComposerModelSelector`；
- `composer-frontmatter-inline-tag-candidate`：当前并行 Composer tag-chip contract 漂移。

生产 build 完整通过：CSS、esbuild production、`node --check main.js`、simulator boundary。Architecture audit 为 19 个既有 core-upstream type edges，service→app、service→ui、core→ui 都是 0。

## Safety and rollback

- 本 Phase 不读取、转换或删除用户已有文件。
- AI Graph resolved paths 与改造前字节级相同；回滚只需恢复 composition 的两个 hardcoded path，不涉及数据回写。
- Catalog 中 planned / migration-source 条目只表达策略，未自动接管旧 writer。
- 后续 Phase 1 store 未通过 checksum、corruption、idempotence 与 projection rebuild tests 前，不切任何生产 read path。

## Next phase gate

Phase 1 必须一次完成以下地基后，才允许迁移第一个 writer：

1. atomic JSON snapshot store；
2. append-only partitioned JSONL store；
3. artifact body store；
4. schema version、checksum 与 corruption quarantine；
5. migration journal / idempotence key；
6. projection rebuild port + fixture；
7. sync inclusion manifest 与 Peak index exclusion 的 catalog coverage。
