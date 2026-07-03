# Execution Decisions Log — 2026-07-03 Full Backlog Sweep

Companion to `2026-07-03-full-backlog-execution-plan.md`. Records every judgment call made while executing without user intervention.

## Ground rules (from user)

- 不停下来问，需要判断就按 recommend 做
- 决策记这里，不打断
- Wave 0 → Wave 1 → ... 按 DAG 走

## Working sequence

Given single-session execution and finite context, take Wave 0 in this order (fastest to slowest, least risky first):

1. **A0** — pure doc, no code risk. Land first as warmup.
2. **E1** — pure doc. Same.
3. **B7** — pure code move (IndexService → IndexGraphPort). Mechanical.
4. **B6** — new file, no wiring. Additive.
5. **B4** — targeted change to harness dispatch. Bounded.
6. **B1** — most invasive (main.ts commands). Do after B7/B6 land.
7. **B3** — needs real backend registration; may end up as scaffolding + fixture strategies since exercising real API keys inside this session isn't feasible.

If any of B1/B3 turn out to have huge blast radius, land the scaffolding + a documented follow-up here rather than half-finished code.

## Decisions

### A0 (2026-07-03)
- Roadmap.html "Feature 文档 14/15/13" 行删掉：`index.html` 里 14 / 15 / 13 都是可点击 link，不是 planned。row 是明显过时状态。
- AN/AO/AP row 改成 "landed 未验证"：progress.md Pending 段说明这些改动都完成但未 commit + 未真机 QA；等真机 QA 后再迁 §done。
- Doc-index sync 一并做完（原文案 "灰色标 planned 的还没写" 与 15 份文档地图不符）。

### E1 (2026-07-03)
- Case 3 的 "Vault Intelligence 使用步骤" 落在 "触发 Vault Health Scan / Knowledge Gaps 后再让 AI 总结" 这条路径 —— 与 13-feature-vault-intelligence.html §Signals 对齐。
- Case 4 补 hover / community / bridge / open-in-leaf 四个交互点 —— 覆盖用户"图能干嘛"的全部意图。
- Case 9 明确 Chat 走自动 context 装配，多步 agent 走 RunEnvelope 传参；补 debug 入口 "Show context stack"。

### B7 (2026-07-03)
- 计划让"把 graph 操作抽到 IndexGraphPort"，但代码实际上 graph 操作大都是 `private *Internal`，没有公开 API。判断：与其硬把私有做公有并保持既有 index-transaction 语义（涉及签名重写、事务边界改动），不如新增薄 public wrapper 层（`refreshMobiusAggregates` / `recomputeVaultPageRank` 等）委托到既有 `*Internal`。既满足"5-7 method 的 IndexGraphPort"的 shape 要求，又不动 hot-path。
- IndexGraphPort 与 IndexMaintenancePort 在 `runMobiusGlobalMaintenance` 上有重叠 —— 主动接受这条重叠：同一操作既属于"graph"，也属于"maintenance"，两个 facet 各自暴露是合理的。

### B6 (2026-07-03)
- 层次选择：VaultArtifactStore 放 `service/run-envelope/` 与 InMemoryArtifactStore 并列；依赖 `VaultWriterPort` 保持 service/core boundary，不 import `obsidian`。
- Layout: 每 runId 一个子目录 + 汇总 `artifact-index.json`（不做 per-run index.json，读起来单点）。
- 并发处理：内部 writeQueue 串行化 put —— Obsidian 单进程 + Vault 读写异步就够，不引 lock/mutex 复杂度。
- 二进制 body 场景（ArrayBuffer）暂不支持 —— plan 没提，等 Wave 4 D4 media generation 真正落到 vault 时再补。

### B1 (2026-07-03)
- 7 个 palette 命令按 `main.ts` 现状（Quick Search / Copilot / Review History / Chat Studio / Usage Dashboard / Setup Wizard / Settings）全部纳入 CommandGateway。不再区分"哪些走 gateway 哪些不走"。
- 每条命令的 CapabilityManifest 用 `ui.open.*` 命名空间，与后续会新增的真正 capability（`doc.review.current` / `vault.search` 等）区分开 —— surface-open ≠ token-consuming capability，但走同一个 observability 通道是有价值的。
- backendPolicy.preferred 一律填 `provider-direct` + fallback `[hermes-harness, claude-sdk]`。`surfaceOpenStrategy` 是本地闭包直接执行 UI open callback，走 runCapability 只是为了记录 RunSession start/finish。B3 落 backend registry 后，`surfaceOpenStrategy` 可以逐条替换成真 backend dispatch，不用改 manifest。
- 保留 `buildCoreCommands` import 并 `void`，等 T11P 之后的 code retirement wave 一起删 —— 现在删会破坏一些 grep-audit 的 UI-command inventory 脚本（不确定但保守）。
- UI 层没有强制 CommandGateway.tryGet：settings tab 等地方以后想反查"有哪些命令"可以走 `gateway.all()`，不再依赖 buildCoreCommands 的 return value。

### B4 (2026-07-03)
- AgentLoop 加 `compiledSkill?: CompiledSkill` 字段而不是复用旧的 `skills?: HarnessSkill[]`（后者的 `../skill/types` 文件已不存在，字段是死的）。CompiledSkill 是 T6 的现产。
- Skill quarantine check 与 PermissionGuard.check 并列（不是替代）：两者语义正交，PermissionGuard 是用户配置的 deny lists，Quarantine 是 skill 自带的 capability boundary。谁 veto 都算 deny，先跑 PermissionGuard 再跑 Quarantine。
- UI toast "某 tool 被 skill quarantine 拒绝" 推迟到 Wave 3 UI store 迁 RunEnvelopeStore 时统一 —— 现在从 trace event `tool_result ok=false` 派生比在 AgentLoop 里直接调 obsidian Notice 更合层次。这条 debt 记在这里，Wave 3 时再兑现。

_Decisions appended below as they happen._

