# Architecture Modernization — Completion Plan

Date: 2026-07-02
Source: `docs/01-architecture.html` §roadmap（T0-T12 现状表）
Upstream: `docs/superpowers/specs/2026-06-01-peak-system-architecture-modernization-handbook.html`

## Goal

把 `01-architecture.html` §roadmap 里所有 **partial / planned** 的任务包收口，完成从"现状"到"Capability Contract + RunEnvelope + Ports + Skill v2"的迁移。目前地基已经部分落地（Owned Runtimes、Ports 首批、CapabilityRegistry surface 形态、RunEnvelope 核心类型 + VaultLint 首个 adopter），本 spec 排出剩余任务的执行顺序、依赖关系与每一波的验收标准，让后续每个子任务包（T0/T1/T3/T5/T6/T7/T8/T9/T10/T12）有独立的 design spec 可以承接。

## Non-Goals

- 本 spec **不**替代各任务包（T1、T3、T5、T6……）自己的 design spec。它只排序、划边界、写验收；具体接口、schema、迁移步骤留给子 spec。
- 不改代码；不写测试；不修 `01-architecture.html`（landed 后回填状态是另一件事）。
- 不重新讨论 handbook §3 已经拍板的决策（Capability Contract、RunEnvelope、No Dual System 等）；本 spec 只负责实施排程。

## Current Status Inventory

从 `docs/01-architecture.html` §roadmap 表格转抄，保留 evidence 指针：

| 任务 | 状态 | 现状（evidence） |
|---|---|---|
| **T0** Boundary Baseline | partial | `test/ambient-source-guard.test.ts` 类 source guard 已有若干；未统一成 import-scan + no-new-violation |
| **Owned Runtime pattern** | landed | Ambient / Lint / VaultReview / QuickSearchBackground / CopilotAction 5 个 runtime |
| **Ports 首批** | landed | `src/core/ports/*` 已有 30+ 个 port 文件 |
| **T1** Contract Seeds | planned | 当前 `CapabilityRegistry` 只做 surface readiness，无 `id`/`inputContract`/`outputContract` |
| **T2** Port Sketches 完整版 | partial | ProviderPort 已通过 `core/providers/*` 抽象但未成正式 port；ToolPort / ArtifactPort 缺 |
| **T3** RunEnvelope Core | partial | T3A 类型 + `InMemoryRunRecorder` 已在 `src/service/run-envelope/`；T3B VaultLint 已跑；Chat/Search/Copilot/AI Analysis/Harness/Knowledge Jobs 六条链路尚未接入 |
| **T4** Capability Replacement | planned | 依赖 T1 + T3 |
| **T5** ToolDef Envelope | partial | `service/mcp/MCPToolAdapter.ts` + `service/agents/harness/tool/*` 各有一半 |
| **T6** Skill v2 Compiler | planned | `service/skills/SkillRegistry.ts` + `service/agents/harness/skill/*` 双 registry 需合并到 v2 |
| **T7** UI RunEvent Projection | planned | 依赖 T3 |
| **T8** IndexService Facade | planned | `service/search/index/indexService.ts` 仍是上帝对象 |
| **T9** Pilot Capability | planned | 候选 `doc.review.current` 或 `vault.search` |
| **T10** Conformance + Golden Trace | planned | 依赖 T9 |
| **T12** Command Gateway Capstone | planned | spec 已在 `docs/superpowers/specs/2026-06-03-…-command-gateway-capstone-review.html` |

补充 `§trace-artifact` 的两块 partial（会被 T1/T3 覆盖，不单列任务包）：

- **Trace**：只有 `service/agents/harness/trace` 雏形，无跨引擎统一格式 → 收敛到 T3 RunEvent。
- **Artifact**：`CopilotReviewHistoryService` / AI Analysis 落 Vault / Chat message 落 SQLite 各写一套，无统一 `ArtifactRef` → T1 定合同 + T3 统一投递。

补充 `§runenvelope` 里点名的"状态真相分散"三处（全部由 T3 + T7 覆盖，不单列）：

- AI Analysis session：`ReportOrchestrator` + `ui/store/searchSessionStore` 切两半。
- Copilot review：action registry + panel props 切两半。
- Chat streaming：真相在 `chatDataStore` 里。

## Dependency Graph

```
          [T0 Boundary]      [T1 Contract Seeds]      [T5 ToolDef Envelope]
                \                   |                          |
                 \                  |                          |
                  \                 v                          |
                   \        [T3 RunEnvelope 全量]              |
                    \               |                          |
                     \              v                          |
                      \      [T7 UI Projection]                |
                       \            \                          |
                        \            \                         |
                         \            \      [T6 Skill v2] <---+
                          \            \             |
                           \            \            |
                            \            v           v
                             \-----> [T4 + T9 Pilot Capability]
                                            |
                                            v
                                    [T10 Conformance + Golden Trace]
                                            |
                                            v
                                    [T12 Command Gateway Capstone]

           [T8 IndexService Facade] — 独立，任何 wave 都可以插入
```

- T0 / T1 / T5 相互独立，可以并行开工。
- T3 依赖 T1（RunEvent 里的 `artifact` 事件需要 `ArtifactRef` 定型），也依赖 T5（RunEvent 里 tool_call 需要 ToolDef 统一）。
- T7 依赖 T3。
- T4 = T9（"Capability Replacement" 与 "Pilot Capability" 在实操上是同一条链路的两个视角，本 spec 合并推进）。
- T6 可以在 T3 推进期间并行开工，T4/T9 需要它就绪。
- T8 独立，何时做只看容量。
- T12 是 T5 + T6 落地后的 capstone，收尾用。

## Wave 1 — 三条独立地基（并行）

**目标：** 锁形状、加防线、收 ToolDef。**不动业务代码**，让 Wave 2 起步时不再被"形状悬空"卡住。

### Wave 1.A — T0 Boundary Baseline

**做什么**
- 把现有分散的 source guard（`test/ambient-source-guard.test.ts` 等）收敛到一个统一的 import-scan 测试模块（建议 `test/boundary/`），列全 `service/*` 不允许 import `obsidian` / `useXxxStore` / `AppContext.getInstance` 的规则。
- 加 no-new-violation 白名单机制：新增违规必须显式加白名单条目 + 注释理由，PR 才能过。
- 覆盖 Wave 2 会动的六条链路（chat / search / copilot / ai analysis / harness / knowledge jobs）在 service 侧的入口目录。

**验收**
- 单个 `npm run test test/boundary/…` 命令能跑完所有 import-scan。
- 现有违规都有一次性 baseline snapshot，任何新增违规立刻红。
- README / CLAUDE.md 补一段"如何加白名单 / 如何清白名单"。

**子 spec**：`2026-07-XX-boundary-baseline-design.md`（另写）。

### Wave 1.B — T1 Contract Seeds

**做什么**
- 在 `src/core/types/capability.ts` 新增 `CapabilityManifest` 类型，含 handbook §8 里点名的字段（`id` / `inputContract` / `outputContract` / `permissionKind` / `costTier` / `backendPolicy` / `skillRef` / `surfaceBinding`）。
- 在 `src/core/types/artifact.ts` 新增 `ArtifactRef` 类型（已在 `src/service/run-envelope/types.ts` 有雏形，本次上升到 core 层，成为跨 capability 契约）。
- 写至少一份 fixture：`test/fixtures/capabilities/doc-review-current.fixture.ts`，把 `doc.review.current` 的完整 manifest 定型（**不接线**，只作 shape 锁定）。
- 加一个类型层面的守卫测试：`test/capability-manifest-shape.test.ts`，通过 source scan 保证 manifest 字段不能被"部分实现"。

**验收**
- `CapabilityManifest` / `ArtifactRef` 存在于 core 且被 T3 直接引用。
- fixture 可以被 T3 / T4 直接 import 作为设计基准。
- 不影响运行时（本 wave 不接线，不注册任何 capability）。

**子 spec**：`2026-07-XX-capability-contract-seeds-design.md`。

### Wave 1.C — T5 ToolDef Envelope

**做什么**
- 在 `src/core/types/tool.ts`（或 `src/core/ports/ToolPort.ts`）定义统一 `ToolDef`：`id` / `source: 'local' | 'mcp' | 'obsidian-command'` / `inputSchema` / `outputSchema` / `permissionKind` / `executor`。
- 现有 `service/mcp/MCPToolAdapter.ts` 与 `service/agents/harness/tool/*` 两侧改为 `ToolDef` 生产者，AgentLoop 只消费 `ToolDef`。
- 保证已有 chat tools / harness tools / MCP tools 全部经过同一个 registry 出场。
- 收编 `service/agents/harness/tool/*` 里的死代码（历史双 registry 的残留），删旧不留双 system。

**验收**
- Chat / Harness / MCP 三条 tool 通道对 UI 呈现的形状一致。
- AgentLoop 里 tool call 事件 payload 与新 `ToolDef.id` 对齐，为 T3 RunEvent 的 `tool_call` 事件铺路。
- 现有 chat tool + harness tool + MCP tool 全部有单测过。

**子 spec**：`2026-07-XX-tool-def-envelope-design.md`。

## Wave 2 — RunEnvelope 全量推广 + UI 收敛

**目标：** 让所有长任务链路走同一套 RunEvent 协议，UI store 退化为投影。这一波会直接让 handbook §7 落成。

### Wave 2.A — T3 剩余六条链路接入

**顺序**：从最简单到最难，每条链路独立 PR，同 PR 内删旧的独立 stream/session 真相（No Dual System）：

1. **Knowledge Jobs**（最简单，无 UI 流依赖）—— 已有 job progress notion，直接换 RunEvent。
2. **Search retrieval**（`SearchClient` + `QuickSearchBackgroundRuntime`）—— 借用现有 `QuickSearchBackgroundRuntime` 的 session/cancel 骨架。
3. **AI Analysis**（`ReportOrchestrator`）—— 拆掉 `searchSessionStore` 里的运行真相，UI 只订阅 RunEvent。
4. **Copilot review**（action registry + panel）—— 状态真相从 action registry / panel props 迁到 RunEnvelope，review-before-write 由 `artifact` 事件承载。
5. **Chat streaming**（`useChatSubmit` + `chatDataStore`）—— 最复杂，兼顾 provider stream normalizer；`LLMStreamEvent` 保留为 provider 层内部形状，向 RunEvent 转换在 service 边界完成。
6. **Harness agent loop**（`AgentLoop.ts`）—— 最后，把 `tool_call` / `text` / `usage` 事件正式改成 RunEvent，`service/agents/harness/trace` 收敛。

**每条链路的验收**
- 该链路的 UI store 不再持有运行状态真相；只持 RunSession id + 事件投影。
- 至少一个 golden-trace 测试（fixture + 断言事件序列）。
- 旧的独立 session/stream 真相在同一 PR 里删除。

**子 spec**：每条链路一份，命名 `2026-07-XX-runenvelope-adopt-{knowledge-jobs|search|analysis|copilot|chat|harness}-design.md`。

### Wave 2.B — T7 UI RunEvent Projection

**做什么**
- 抽出 `useRunEventProjection(runId)` 通用 hook，覆盖 status/progress/artifact/error/log 五种事件。
- 每条链路的 UI store 收敛到"只存投影 + Selector"，不再自定义 status 语义。
- 定义 `RunEventProjectionPort`（放 `core/ports/`），app 层用 `InMemoryRunRecorder` / 未来的 SQLite recorder 实现。

**验收**
- 六条链路的 UI store 平均行数缩减 30%+（数字后跟）。
- 单个新 feature 加运行状态展示的成本：1 个 hook + 1 个 selector，不再需要新写 store。
- 现有的三处"状态真相分散"（AI Analysis session / Copilot review / Chat streaming）在 T7 收尾时确认已解决。

**子 spec**：`2026-07-XX-ui-runevent-projection-design.md`。

## Wave 3 — Pilot Capability 端到端打通 + Skill v2

**目标：** 走完一条完整链路，验证 T1 契约 + T3 envelope + T5 ToolDef + T6 Skill 的组合，为 Golden Trace 建 baseline。

### Wave 3.A — T6 Skill v2 Compiler

**做什么**
- 合并 `service/skills/SkillRegistry.ts` 与 `service/agents/harness/skill/*` 两个 registry。
- 新 `CompiledSkill` 类型：`skillId` / `allowedTools: ToolDef.id[]` / `promptRef` / `quarantine: 'strict' | 'permissive'`。
- Skill compiler 在启动或首次注册时把源文件（markdown + frontmatter）编译成 `CompiledSkill`，缓存到 `AppRuntimeRegistry` 拥有的 SkillRuntime。
- 提供 quarantine 策略：strict skill 只能调白名单 tool，越权直接 fail-loud。

**验收**
- 现有 skills 全部走 v2 compiler，双 registry 删除。
- Skill v2 与 T1 `CapabilityManifest.skillRef` 打通。
- 单测覆盖 quarantine 违规、tool 未白名单、prompt 缺失三类失败路径。

**子 spec**：`2026-07-XX-skill-v2-compiler-design.md`。

### Wave 3.B — T4 + T9 Pilot Capability（合并推进）

**选择候选**：本 spec 建议先做 **`doc.review.current`**，理由：
- 已有 CopilotReviewHistoryService 天然近 artifact 语义，改造小。
- Copilot 已在 Wave 2 接入 RunEnvelope。
- 用户可见的完整闭环（选文档 → run review → 看 artifact → 决定 accept/discard）。
- `vault.search` 也可作为并行候选（依赖也已就位），但改动面比 doc review 大。

**做什么**
- 新增 `CapabilityRunner` in `service/capabilities/CapabilityRunner.ts`：读 `CapabilityManifest`，选 backend（Hermes Harness / Claude SDK / 普通 provider），装配 skill + tools，跑一次运行、发 RunEvent、投递 ArtifactRef。
- `doc.review.current` 从 `CopilotActionRegistry` 迁到 `CapabilityRunner`，旧 action 入口保留为 facade（handbook §3 决策 6 允许），业务实现只走新路径。
- Review UI 消费 ArtifactRef + RunEvent，不再自己拼状态。

**验收**
- 一次 `doc.review.current` run 的完整事件序列可 fixture 回放。
- 旧 CopilotAction "review current document" 的业务实现从 CopilotActionRegistry 里删除（保留一层薄 facade 指向 CapabilityRunner）。
- Handbook §3 决策 6 "No Dual System" 在 PR review checklist 里明确对勾。

**子 spec**：`2026-07-XX-pilot-doc-review-capability-design.md`。

### Wave 3.C — T10 Conformance + Golden Trace

**做什么**
- 把 Wave 3.B 的 fixture 提升成"conformance 测试"：换 backend（Hermes vs Claude SDK vs 直接 provider）跑同一个 capability，断言 RunEvent 序列 + ArtifactRef 内容一致（时间戳、id 除外）。
- CI 加 golden trace check。

**验收**
- CI 里至少一个 capability 有多 backend conformance 测试。
- 新 capability 加入必须提供 golden trace fixture。

**子 spec**：`2026-07-XX-conformance-golden-trace-design.md`。

## Wave 4 — 收尾

### Wave 4.A — T8 IndexService Facade

**做什么**
- 把 `service/search/index/indexService.ts` 按 handbook §12 拆成 `IndexWriterRuntime` / `IndexReaderRuntime` / `SemanticGraphRuntime` / `IndexMaintenanceRuntime` 四个 owned runtime。
- 保留原 `IndexService` 名字作为薄 facade 委托到四个 runtime，不留双 system。
- 现有 caller 全部迁到具体 runtime 引用（`useServiceContext().indexReader` etc.）。

**验收**
- `indexService.ts` 缩到 <100 行，只做 facade + 转发。
- 四个 runtime 各自 owned by AppRuntimeRegistry。
- 现有 index 相关测试全过。

**子 spec**：`2026-07-XX-index-service-facade-design.md`。

**执行时机**：不阻塞其它 wave，容量允许时任何时间插入。

### Wave 4.B — T12 Command Gateway Capstone

**依赖**：T5 + T6 全部落地。

**做什么**：见现有 spec `docs/superpowers/specs/2026-06-03-obsidian-plugin-command-gateway-capstone-review.html`；本 wave 只是启动信号。

**验收**：外部 Obsidian 插件 command 可以被声明为 `ToolDef`，注入 `Skill.allowedTools`，被 Capability 调度。

## Cross-Cutting Rules

以下规则贯穿所有 wave，落地时 PR review 必须对齐：

- **No Dual System**（handbook §3 决策 6）：每个任务包必须回答"删掉了哪个旧实现"。partial 迁移最多允许一个 PR，下 PR 必须收口。
- **Runtime Ownership**（`CLAUDE.md`）：任何长期状态必须由 app 层 own；本 spec 所有新 runtime（SkillRuntime / IndexReader/Writer/Graph/Maintenance）全部走 `AppRuntimeRegistry` 五件套。
- **Ports 用 feature 词汇**：新 port 不允许出现 `getApp()` / `getWorkspace()`。
- **Configurability**：新 capability 里的 label / threshold / permission 文案走 `templates/config/`，不硬编码。
- **文档回填**：每个任务包 landed 后，回 `docs/01-architecture.html` §roadmap 把 pill 从 `gold` 改成 `green`，evidence 列补具体 file 路径；同一 PR 同步。

## Risk

- **Wave 2 是最大风险区**：六条链路接入 RunEnvelope 会触及所有主要 feature 的 UI + service，容易出回归。缓解：每条链路独立 PR + golden trace fixture + Wave 1.A 的 boundary baseline 兜底。
- **T6 Skill v2 合并双 registry**：旧 skill 使用者较多，兼容路径要仔细。缓解：编译期报错优先于运行期，禁止 skillId 冲突。
- **T4/T9 Pilot 选错候选**：如果 `doc.review.current` 的边界比预期大（比如 review artifact 需要与 Chat 共用格式），可能被迫扩到 Chat 侧。缓解：Wave 3.B 开工前先出一份 20-30 行的 candidate 边界确认。
- **进度并行度**：Wave 1 可 3 条并行，但需要不同上下文；建议排 1.B（T1）先，因为 T3 依赖它。1.A 与 1.C 有余力时再启。

## Non-Goals（再次强调）

- 本 spec 不深入任何单个任务包的接口设计；每个 wave 的子 spec 独立起草。
- 不承诺具体时间线；只承诺依赖顺序与验收标准。
- 不做架构层的新决策；handbook 已经给的决策照搬。

## Spec Index（后续需要产出的子 spec）

| 顺序 | 子 spec 名字 | 覆盖任务 |
|---|---|---|
| 1 | `2026-07-XX-capability-contract-seeds-design.md` | T1 |
| 2 | `2026-07-XX-boundary-baseline-design.md` | T0 |
| 3 | `2026-07-XX-tool-def-envelope-design.md` | T5 |
| 4 | `2026-07-XX-runenvelope-adopt-knowledge-jobs-design.md` | T3 (1/6) |
| 5 | `2026-07-XX-runenvelope-adopt-search-design.md` | T3 (2/6) |
| 6 | `2026-07-XX-runenvelope-adopt-analysis-design.md` | T3 (3/6) |
| 7 | `2026-07-XX-runenvelope-adopt-copilot-design.md` | T3 (4/6) |
| 8 | `2026-07-XX-runenvelope-adopt-chat-design.md` | T3 (5/6) |
| 9 | `2026-07-XX-runenvelope-adopt-harness-design.md` | T3 (6/6) |
| 10 | `2026-07-XX-ui-runevent-projection-design.md` | T7 |
| 11 | `2026-07-XX-skill-v2-compiler-design.md` | T6 |
| 12 | `2026-07-XX-pilot-doc-review-capability-design.md` | T4 + T9 |
| 13 | `2026-07-XX-conformance-golden-trace-design.md` | T10 |
| 14 | `2026-07-XX-index-service-facade-design.md` | T8 |
| — | 已有 `2026-06-03-…-command-gateway-capstone-review.html` | T12 |

## Verification（本 spec 自身）

- 本 spec 无代码改动，验收在于：
  - Wave 1 起步时首份子 spec（T1 Contract Seeds）能直接照本 spec §Wave 1.B 起草，不需要重新讨论顺序或依赖。
  - `docs/01-architecture.html` §roadmap 的每一行状态与本 spec §Current Status Inventory 一致；若 handbook 后续追加新任务包，同步回本 spec。
