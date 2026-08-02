# Planned Requirements 11 项完成审计

日期：2026-07-31
分支：`codex/planned-requirements-20260731`
文档状态：**Historical audit · superseded by 2026-08-02 product IA correction**
执行时的 Source of truth：`docs/planned-requirements.html`

> 本文保留第一次 11 项实现审计的源码、测试与构建证据，但其中四个 surface 归属已被 owner 纠偏：Vault Graph Segment 迁到 Quick Search → Vault Intelligence；Document Local Graph 迁到 File Atlas；Search Hub Drawer 合并为 Search → File Atlas handoff；Ambient Floating Panel 撤销。当前决策与逐项 review 请读 [2026-08-02 产品 IA 纠偏](./2026-08-02-planned-requirements-product-ia-correction.md) 和 [Planned Requirements 关闭批次](../../planned-requirements.html#closed-2026-07)。

## 结论

11/11 项需求已有生产组合路径和自动化证据。实现遵守既有 runtime
ownership：Contextual Graph、Document Intelligence、Shared AI Instruction、
AI Graph Artifact、Ambient 和 File Atlas 都复用 app-owned 能力，没有建立
第二套事实源或 surface-local agent。

真实 Obsidian renderer 当前没有 CDP listener，且隔离 worktree 没有覆盖正在
运行的原插件目录。因此本审计只确认源码、契约、持久化与构建边界；以下交互
仍统一标记为 `INTERACTION NOT VERIFIED`，不将其写成真机验收通过：

- Quick Search mode menu、history/detail/back 与键盘焦点；
- Native Markdown modal 的选区、发送、handoff、关闭后焦点恢复；
- File Atlas rail / flatten / suggestion handoff；
- Ambient typing persistence、refresh、close/reopen；
- directed marker、Timeline unassigned lane 和 folder collapse 的真实视觉结果。

## 逐项证据

| Requirement | 生产实现 | 自动化证据 |
| --- | --- | --- |
| `PR-VAULT-GRAPH-SEGMENT` | `VaultMaintenanceSegment` 通过 `ContextualGraphPort` 组合 stats、overview、hubs、current note 与 last report。 | `planned-requirements-production-contract`、`contextual-graph-port-contract` |
| `PR-DOC-LOCAL-GRAPH` | `DocumentContextGraphStrip` 显示 primary/candidate hubs、source chain、local graph 与 orphan 状态。 | `contextual-graph-port-contract` |
| `PR-SEARCH-HUB-DRAWER` | Quick Search `HubSection` 复用同一 read-only projection，可打开 hub document / local graph。 | `planned-requirements-production-contract` |
| `PR-AMBIENT-FLOATING-PANEL` | workspace-root floating host；显式 refresh、collapse、close；关闭 surface 不停止 runtime。 | `ambient-canonical-surface`、`ambient-push` |
| `PR-FILE-ATLAS-WORK-FILE-RAIL` | open files 优先、recent 补足固定容量；recent / frequent / name 三种排序。 | `file-atlas-work-file-rail-contract`、`file-atlas-rail-model`、`file-atlas-rail-preference` |
| `PR-COPILOT-INTELLIGENCE-NATIVE-MODAL` | Native Markdown context 捕获 selection/heading/offset；modal 只保留 Copilot / History；复用 Composer runtime、candidate/history/receipt；复杂 review 携 run ID handoff；保存并恢复原 editor focus。 | `native-markdown-intelligence-context`、`composer-open-policy`、`composer-generation-history-lifecycle` |
| `PR-FILE-ATLAS-COPILOT-SUGGESTIONS-FLATTEN` | Atlas 只做 selection/context handoff；建议来自 Composer Copilot 同源 projection；filter/flatten icon-only；flatten 保留 path crumb，不直接写 Markdown。 | `file-atlas-owner-review-contract`、`file-atlas-display-model` |
| `PR-SHARED-AI-INSTRUCTION-COMPOSER` | Chat、Composer Copilot、AI Search / AI Graph 共用 `SharedAIInstructionController`、PromptInput primitives 和统一 attachment/context/submission contract；支持 `@` / `[[` / `/`、IME、Enter / Shift+Enter / Escape、draft/history、submit/stop/error。 | `shared-ai-instruction-controller`、`composer-entry-semantics`、`composer-sidecar-session-interaction`、`planned-requirements-production-contract` |
| `PR-AI-SEARCH-UNIFIED-MODES` | 顶层仅 Vault Search + AI workspace selector；普通打开默认 AI Search；低频 mode 不跨 modal 记忆；run/history/artifact deep link 可精确恢复；AI Graph 使用单列 history。 | `ai-search-input-action-layout`、`ai-search-button-geometry`、`planned-requirements-production-contract` |
| `PR-COMPOSER-AI-GRAPH` | stable graph/version ID；canonical JSON + append-only immutable versions；source/evidence/review/provenance；JSONL run events；SQLite rebuildable projection；Vault/Web/manual/existing-graph sources；typed heterogeneous extraction；entity alias resolution；semantic diff accept gate；source/update 分离；relation review、compare、restore、duplicate、Markdown export；cross-surface exact graph/version deep link。 | `ai-graph-artifact-runtime`、`ai-graph-generated-import`、`ai-graph-agent-typed-extraction`、`graph-edge-direction-contract`、`graph-output-to-lens`、`timeline-layout` |
| `PR-COMPOSER-GRAPH-EMPTY-FOLDER-COLLAPSE` | compound frame 只属于直接拥有当前可见内容的目录；纯 transit chain 按最近可见祖先折叠，节点 canonical path 不变。 | `graph-folder-compound-model` |

## AI Graph 关键门禁

- Add/remove/check source 只更新 source registry 和 freshness，不启动 AI、不创建版本。
- `Update graph` 在 current graph、head version、selection、active sources 和 review
  context 上生成 semantic diff；Cancel 不写入，Accept 才 append version。
- Vault source 使用 ctime-based stable identity；source registry 使用 tombstone，旧
  version/evidence 不因 remove source 失效。
- Web source 只在用户显式选择或显式 Update 时读取。Web relation 在没有 fetched
  source、content hash 和 captured evidence 时不能 accept。
- suggested、低 confidence 或无 evidence relation 使用不确定性样式；renderer 从
  canonical `directed` 决定 target arrow，inspector 同时输出
  `source → predicate → target`。
- Thinking Tree 先投影允许的 relation family；Timeline 去重 canonical temporal
  edge，并把无日期节点放进可见的 `No date / Unassigned` lane。
- Markdown 只作为显式 export；graph body 不写回笔记或 Vault links。
- AI Search 分析快照只保存 exact graph/version artifact reference，不复制 graph
  body；完整节点、关系与 evidence 仍只存在 immutable artifact version。

## 验证记录

- Requirement-focused：15/15 通过。
- 补充跨 surface / layout suites：通过。
- 全量：392/396 通过。4 个失败与本任务未触碰的既有基线一致：
  - `chat-studio-message-state-ui`
  - `code-block-theme-settings`
  - `composer-architecture-source-guards`
  - `composer-frontmatter-inline-tag-candidate`
- `npm run build`：通过，包括 CSS、production bundle、`node --check` 和
  simulator boundary。
- 任务改动文件的 TypeScript error 过滤：0。
- `git diff --check`：通过。
- Obsidian CDP：未发现 listener；`INTERACTION NOT VERIFIED`。
