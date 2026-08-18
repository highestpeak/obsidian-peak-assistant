# Peak Assistant Onboarding 真实 UI 可靠性修复合同

> - 状态：待实施
> - 面向读者：产品负责人、实现工程师、QA
> - 证据：2026-08-18 真实 Obsidian 录屏、当前生产源码、现有最终设计与实施记录
> - 配套计划：[Onboarding 可靠性修复计划](../plans/2026-08-18-onboarding-real-ui-reliability-repair-plan.md)
> - 产品基线：[Onboarding、Settings 与 Knowledge Index 最终设计](./2026-08-13-onboarding-settings-knowledge-index-final-design.md)

## 1. 结论

当前 Onboarding 不是单纯的视觉还原问题。真实录屏暴露出三个更高优先级的系统问题：

- **状态不真实**：连接、SQLite、索引和 System Check 可以在没有完成对应验证时显示或被当作 Ready。
- **运行没有唯一 owner**：关闭、返回、重复点击或再次打开 wizard 都可能启动新的全量索引，产生并行任务和重复 Notice。
- **配置有多个 owner**：Onboarding、Settings、`ProfileRegistry`、`modelRouting` 和 `harnessSettings` 可以互相覆盖，重新运行 Onboarding 还可能改掉用户已有设置。

视觉错位、按钮过小、picker 闪退和页面与 mock 不一致都需要修复，但必须排在状态真实性之后。若先改 CSS，界面只会更像设计稿，仍会继续误报成功、重复索引和覆盖配置。

## 2. 本轮 Impact Contract

### 2.1 主要结果

本轮完成后，Onboarding 的五步流程必须满足以下结果：

- fresh install、existing setup、repair 和重新打开都读取同一份真实状态；
- 任意时刻最多存在一个 Knowledge Index run；
- System Check 的每一项都有独立证据，不能用静态布尔值或文案代替；
- Onboarding 不覆盖未被用户改动的现有 Settings；
- 用户可以完成真实产品跳转，失败时仍留在可恢复的 Onboarding 状态；
- 真实 Obsidian 的布局、交互和设计稿达到可比对验收，不再以静态 mock 或 build 代替。

### 2.2 必做范围

1. Provider 验证与连接编辑。
2. 统一模型选择、Automatic 语义和 Hermes 模型所有权。
3. Better SQLite、索引运行与 readiness 投影。
4. Onboarding 草稿、恢复、完成和重新运行。
5. System Check 的真实 gate。
6. 五步页面的交互和视觉还原。
7. 真实 Obsidian CDP 与可见截图验收。

### 2.3 禁止扩大范围

- 不重新设计四个 Settings 一级分类。
- 不新增第二个 Agent runtime；Peak Hermes 仍是唯一 Agent runtime。
- 不借本轮实现 PDF summary、OCR、视觉理解或其他 enrichment backlog。
- 不重写整个 Index pipeline；只收口 run owner、结果合同、恢复和 readiness。
- 不用 Notice 作为长任务唯一状态载体。
- 不用静态 mock、source inspection 或绿色 build 宣布真实 UI 已通过。

### 2.4 最低可接受结果

所有 P0 问题必须关闭。任何一项 P0 被跳过，本轮只能称为 partial repair，不能称为 Onboarding 修复完成。

## 3. 录屏中已经确认的问题

证据文件：`iShot_2026-08-18_19.42.02.mp4`。

### 3.1 Connect AI

- 步骤圆点、连接线和两行文字没有共享基线，顶部步骤条明显错位。
- `Connect another service` 视觉权重和点击区域过小，不像当前步骤的主要次级动作。
- 已保存连接只能选中，不能原地编辑或重新验证。
- 进入 Add connection 后没有明确的返回或取消路径。
- 当前选中的 OpenAI 验证失败后，另有可用连接仍不能继续。
- Add connection 与 wizard 使用两套 Button / 样式系统，造成密度和控件外观不一致。

### 3.2 Core models

- 模型 picker 打开后立即消失，无法稳定选择。
- picker 的字体、宽度、筛选区和浮层位置与目标设计不一致。
- 辅助说明占用过多空间，颜色和信息层级不统一。
- `Automatic` 在 UI 中可选，但当前状态机不接受空模型；随后默认模型 effect 又会把它覆盖，语义自相矛盾。

### 3.3 Prepare vault 与 System Check

- Better SQLite 直接出现 Ready，用户看不到 Checking、安装、验证或失败恢复过程。
- System Check 没有逐项检查过程，进入页面后几乎立即全绿。
- Fast full-text search 即使没有 Ready，也被硬编码为通过。
- 已经存在可用索引时仍重新启动全量索引。
- 关闭 wizard 后再次打开会创建第二个索引任务和第二个 Notice。
- 返回 Prepare vault、快速双击 Continue 或打开多个 wizard 也存在重复启动风险。

### 3.4 Try Peak

- 页面结构和目标 mock 不一致，动作层级弱。
- 点击动作前就先写入 Onboarding 完成状态；如果真实 surface 打开失败，用户没有反馈，也无法原地恢复。
- `Open a recent note` 在 Vault 没有 Markdown 文件时静默无动作。
- `Finish setup` 可以在没有完成真实任务的情况下结束；这只能代表配置完成，不能被记录为 first success。

## 4. 源码进一步暴露的问题

### 4.1 Provider 验证合同错误

[Provider presets](../../../src/core/profiles/presets.ts) 已经把版本路径包含在 `baseUrl` 中，例如 OpenAI 的 `/v1` 和 OpenRouter 的 `/api/v1`。但 [testProviderConnection](../../../src/core/providers/testProviderConnection.ts) 再次追加 `/v1/models` 或 `/v1/messages`，会得到 `/v1/v1/models`、`/api/v1/v1/models` 一类错误地址。

此外：

- Ollama 将所有 `< 500` 状态视为成功，404 也可能显示 Ready。
- 一次 HTTP 成功被拆成 Authentication、Model catalog 和 First-use route 三个绿色状态，但三项没有独立证据。
- 验证没有证明目标模型可以做最小生成；Hermes 连接也没有证明工具调用和结构化输出。
- Add connection 可以在未通过 Test 的情况下保存。

### 4.2 连接完成 gate 使用了错误概念

[OnboardingStateMachine](../../../src/ui/view/onboarding/OnboardingStateMachine.ts) 只检查“当前选中的连接是否 Ready”。被查看的失败连接因此可以阻塞整个流程，即使其他连接已经验证通过。

正确合同是：

- 当前展开或查看的连接不等于首次默认连接；
- 只要存在一个经过验证且能承担首次任务的连接，Connect AI 就可以继续；
- 失败连接仍保留 Needs attention，但不能抹掉其他连接的可用性；
- Core models 只能从已验证连接中建立默认候选。

### 4.3 模型配置存在三个冲突来源

[HarnessOnboardingWizard](../../../src/ui/view/onboarding/HarnessOnboardingWizard.tsx) 同时写 `ProfileRegistry` 和 `modelRouting.assignments`；[AgentsTab](../../../src/ui/view/settings/tabs/AgentsTab.tsx) 写 `harnessSettings.executionModel`；[main.ts](../../../main.ts) 保存设置时又把 `harnessSettings.executionModel` 回写到 `ProfileRegistry`。

这会造成以下结果：

- Onboarding 里显示的新 Hermes 模型可能被旧的 Agents 设置覆盖；
- 重新运行 Onboarding 会把 Chat Studio、Copilot、Vault Search 和 Agent 直接改成 fixed model；
- 用户原本的 Automatic 或 action-level override 可能丢失；
- 多个异步写入中途失败时，没有原子 apply 或 rollback。

最终所有权必须收口为：

- `modelRouting.assignments` 拥有普通产品功能默认；
- `harnessSettings.executionModel` 拥有 Peak Hermes execution model；
- `ProfileRegistry` 只作为兼容镜像或运行时投影，不再反向成为第二个 source of truth；
- Onboarding 保存一个 draft，只有明确 Apply 的字段才进入长期设置。

### 4.4 Automatic 不是一个可用状态

[UnifiedModelPicker](../../../src/ui/view/settings/components/UnifiedModelPicker.tsx) 用 `null` 表达 Automatic，而 Onboarding 的 `canContinue` 要求三个角色都非空。[useDefaultModels](../../../src/ui/view/onboarding/HarnessOnboardingWizard.tsx) 又会立刻给所有空角色补上固定模型。

本轮必须改为显式 assignment：

```ts
// Proposed shape; exact name may follow the existing settings type.
type OnboardingModelAssignment =
  | { mode: 'automatic' }
  | { mode: 'fixed'; config: RoleConfig };
```

Automatic 只有在至少存在一个已验证、满足该角色能力要求的候选时才算 Ready。它不能继续用 `null` 同时表示“自动”“未选择”和“引用失效”。

### 4.5 Better SQLite Ready 不等于数据库可用

[repairBetterSqlite](../../../src/app/commands/composeSettingsActions.ts) 只执行 native binary 兼容检查，再读取 [NativeModuleManager](../../../src/core/storage/sqlite/NativeModuleManager.ts) 的 metadata readiness。它没有证明：

- SQLite store 已初始化；
- Vault database 可以打开并写入；
- FTS schema 可以创建和查询；
- 当前数据目录可写。

`ensureCompatible()` 还会吞掉下载错误，调用方可能继续把它当作成功路径。

本轮的 SQLite readiness 必须是一个真实最小探测：binary load、database open、transaction write/read、FTS query 和 store initialization 全部通过后才是 Ready。

### 4.6 Index run 没有唯一 owner

[composeSettingsActions](../../../src/app/commands/composeSettingsActions.ts) 每次调用都会创建新的 `IndexInitializer`；[KnowledgeIndexWorkspaceRuntime](../../../src/app/search/KnowledgeIndexWorkspaceRuntime.ts) 也会创建自己的 initializer；[IndexService](../../../src/service/search/index/indexService.ts) 的 pause / cancel 则是全局静态标志。

同时，[IndexInitializer](../../../src/service/search/index/indexInitializer.ts) 在 store 未初始化或 pipeline 失败时直接 `return`，外层 wrapper 又捕获并吞掉错误。Onboarding 的 Promise 仍可能进入 `.then()` 并标记 Ready。

本轮必须建立一个 app-owned run coordinator：

- `startOrAttach(plan)` 对相同 plan 返回同一个 active run；
- 每次 run 有稳定 `runId`、状态、阶段、结果和失败；
- Onboarding、Settings、Index Workspace 和 Notice 订阅同一份 snapshot；
- 关闭或重新打开 UI 只 detach / attach，不创建新 run；
- pause、resume 和 cancel 作用于明确 run，不使用跨 run 的全局静态状态；
- pipeline 失败返回 typed failure 或抛错，不能用 `void` 成功路径表示失败。

### 4.7 Index readiness 信息不足

[getIndexStatus](../../../src/service/search/index/indexService.ts) 只返回 builtAt、indexedDocs 和 `Boolean(builtAt)`。它不能回答：

- FTS、Embedding 或 generated knowledge 哪一层 Ready；
- 当前索引是否覆盖保存的 scope；
- schema 是否仍兼容；
- Vault 改动后是否 stale；
- 是否有 active run 或失败文档。

Onboarding 至少需要以下投影：

```ts
// Proposed contract.
interface OnboardingReadinessProjection {
  sqlite: 'checking' | 'ready' | 'needs-attention';
  fullText: 'missing' | 'building' | 'ready' | 'stale' | 'failed';
  activeRunId: string | null;
  indexedDocuments: number;
  totalDocuments: number;
  scopeFingerprint: string | null;
  failures: number;
}
```

已有 FTS 且 scope / schema 可复用时，Prepare vault 必须直接显示 Reused，不启动新 run。已有 active run 时，必须 attach。

### 4.8 恢复和完成状态会被破坏

[HarnessOnboardingWizard](../../../src/ui/view/onboarding/HarnessOnboardingWizard.tsx) 在每次 step / model / profile 变化时都写 `completedAt: null`。因此已经完成的用户重新打开 wizard 后，即使只查看页面，也会被重新标记为未完成。

[main.ts](../../../main.ts) 只用 `profiles.length === 0` 决定是否首次打开。用户添加一个无效 profile 后关闭，下一次启动不会再看到 Onboarding。[openHarnessSetupWizard](../../../src/app/commands/PeakCommandActions.ts) 又用旧 Harness binding 判断 `isReRun`，没有使用真正的 Onboarding completion。

正确合同是：

- `completedAt` 只有在用户开始一次明确的重新配置并 Apply 后才改变；
- 打开或浏览完成后的 wizard 不清空完成状态；
- 自动打开依据“首次成功所需 hard gate 是否完成”，不是 profile 数量；
- Finish later 保存草稿，但不能把未完成的 Better SQLite 或必需连接标记为完成；
- 同一时刻只允许一个 Onboarding modal；重复命令聚焦现有实例。

### 4.9 System Check 会误报成功

当前 System Check 有三层错误：

- Fast full-text search 的 ready 参数被硬编码为 `true`；
- `canContinue` 对 System Check 无条件返回 true；
- CSS 把首个状态图标统一渲染成 success color，`CircleAlert` 也会变绿。

System Check 必须从同一 readiness projection 逐项展示：

1. 至少一个已验证连接；
2. 三个模型 assignment 可以解析到已验证且兼容的候选；
3. Better SQLite 和实际 database / FTS probe 通过；
4. full-text search 为 Ready、Reused、Building、Stale 或 Failed 中的真实状态；
5. 当前 safety mode 与 permissions 的实际值。

硬阻断项失败时不能继续。非阻断的后台 enrichment 可以显示 Building，但不能画绿色完成图标。

### 4.10 安全文案没有读取真实设置

当前页面固定声称 Agent 会在写入、命令、网络和高成本动作前询问，但 Onboarding 没有读取或应用当前 `defaultPermissionMode` 和 permissions。已经配置为 bypass 的用户仍会看到 “Safe default”。

fresh install 应应用 `Ask every time`。重新运行时应保留已有明确选择，并在 System Check 中显示真实值；若风险高，显示 Needs attention 和前往 Agents 的修复入口。

## 5. 交互修复合同

### 5.1 Provider 区域

- Existing profile 行可展开编辑、Test、Save 和 Cancel。
- Add connection 提供明确 Back / Cancel，保存前必须通过当前凭据的 Test。
- Provider 选项使用可聚焦 Button 或 radio，不使用只有鼠标点击的 `div`。
- `Connect another service` 使用至少 44px 的稳定点击高度，并加入 Obsidian button reset geometry 测试。
- 连接状态至少区分 Checking、Ready、Needs attention 和 Not tested；不能所有圆点都为绿色。

### 5.2 Model picker

- 触发器再次点击可以关闭；outside click 和 Escape 可以关闭。
- 关闭后焦点返回原触发器。
- 搜索输入使用组件 ref 聚焦，不能用全局 `document.querySelector` 抢到另一个 picker。
- query 和 filter 在一次会话内可保留，关闭后按明确产品规则重置。
- Portal 必须挂在当前 Obsidian modal 的 portal host，不遮挡步骤条或 footer。
- 角色候选只来自经过验证的连接；Hermes 还要通过 tools capability evidence。
- 长模型名、多个 Provider、键盘导航和窄窗口都必须可用。

### 5.3 Prepare vault 与 System Check

- Loader 使用真实旋转动画，且状态文案来自 runtime snapshot。
- Prepare 进入时先读取 index / SQLite 状态，再决定 Reuse、Attach、Repair 或 Start。
- Continue 在异步动作期间进入 busy 状态，防止双击。
- System Check 逐项运行并显示 Checking 到终态的变化。
- 错误可以原地 Retry；需要 Settings 时提供确定入口。

### 5.4 Try Peak

- 动作卡直接打开真实 Chat Studio、Vault Search、File Atlas、最近文档或 Composer。
- 没有 Markdown 文件时，Recent note 卡显示 unavailable 或使用明确 fallback，不得静默无动作。
- 只有目标 surface 成功打开后才记录该次 first success。
- launch 失败时保留 wizard，显示错误和 Retry。
- 单独的 `Finish setup` 只记录 configuration complete，不冒充 first success。

## 6. 视觉修复合同

- 步骤圆点和连接线使用同一条几何基线；文字在独立区域换行，不以省略号掩盖布局不足。
- 五步在目标宽度完整可读；窄宽度采用明确 compact 状态，不把半截文字留在屏幕上。
- 页面内容宽度、字号、按钮高度、边界和留白以最终 mock 为 reference，但必须在真实 Obsidian 中读取 computed geometry 验证。
- Onboarding 统一使用项目当前 primitives 和 Lucide icons，不混用旧 shared button。
- 状态颜色来自 `data-state`，success、warning、error 和 neutral 不共享无条件 selector。
- Connect、Core models、Prepare、System Check 和 Try Peak 都需要 reference / current / overlay 证据；只修第一屏不算完成。

## 7. 完成定义

只有同时满足以下条件，Onboarding 修复才可以关闭：

- 所有 P0 单元与集成测试通过；
- production build 和 bundle check 通过；
- fresh、existing、repair、resume 和 re-run 五条真实 Obsidian 路径通过；
- 连接编辑、Add connection Cancel、model picker、Escape、focus restore 和 narrow width 通过 CDP 断言；
- 已有索引不会重建，active run 会复用，关闭重开不产生第二个 run 或 Notice；
- System Check 不再出现 false green；
- launch 成功和失败路径都有可见反馈；
- 参考图、真实 current、normalized current、overlay / diff 和 manifest 齐全。

在真实宿主证据完成之前，状态必须保留为 `INTERACTION NOT VERIFIED`。
