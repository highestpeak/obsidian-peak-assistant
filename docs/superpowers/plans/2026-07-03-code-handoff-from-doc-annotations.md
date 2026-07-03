# Code Handoff From Root Doc Annotations

Copy the prompt below to Claude Code.

```text
你在 /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant 工作。

目标：只处理这批 browser annotation 里“需要代码/产品实现”的部分。Codex 已经负责 root docs 的文字清理；不要再大规模改 docs/*.html，除非你的代码改动必须同步一两处事实说明。当前 worktree 很可能是 dirty 的，里面有 Codex 的文档改动和另一条 Hub Generation 相关并行改动。不要 revert、不要格式化无关文件、不要碰不属于本任务的 parallel hub files。

先做 read-only audit，再实现低风险代码项。实现前请列出候选矩阵：文件、改动目的、风险、测试。高风险产品决策只给设计/待确认，不要强行实现。

## 硬约束

- 默认目录心智模型：插件拥有的默认目录都应该落在 `settings.ai.rootFolder` 下面，默认 root 是 `ChatFolder`。
- 默认派生目录：
  - `ChatFolder/Prompts/Custom`
  - `ChatFolder/Skills`
  - `ChatFolder/Inbox`
  - `ChatFolder/AI-Analysis`
  - `ChatFolder/DataStore`
- Advanced settings 可以覆盖单个目录；这是新逻辑的一部分，不是 legacy 兼容。
- 不考虑 legacy：不要支持 `_prompts/`, `_skills/`, `_inbox/`, `A-control/PeakAssistant/DataStore/`；不要写迁移助手；不要保留旧目录 fallback。
- 如果已有 persisted settings 指向旧默认目录，loader 应强制规范化到新默认目录；只有用户在 Advanced settings 里明确设置的非旧默认路径才算自定义 override。
- DataStore 不能被索引吃到自己：当前 `settings.dataStorageFolder/` 必须进入 search ignore；不要再把 `A-control/` 当作默认兼容 ignore。
- 不要把 UI 状态词、root docs cleanup、historical notes 当成本任务。

## Track A · 删除旧目录逻辑（优先）

背景：Codex 已把默认值改到 `ChatFolder/...`。Owner 明确要求：不要考虑 legacy，强制逻辑全部是新的。

做：
1. Audit 当前设置加载、SkillRegistry、CustomPromptRegistry、Inbox、AI Analysis、DataStore、Search ignore 是否全部使用 settings/folderPaths helper，不再硬编码旧目录。
2. 删除旧目录 fallback：
   - 不扫描 `_prompts/`, `_skills/`, `_inbox/`。
   - 不把 `A-control/PeakAssistant/DataStore` 当成 DataStore 候选。
   - 不在 ignorePatterns 里默认保留 `A-control/`。
   - 不写 Notice/banner/迁移助手提示用户搬旧目录。
3. Settings loader 只产出新逻辑：
   - unset 或旧默认值 → 新默认值；
   - explicit Advanced override → 保留，但不能是旧默认目录；
   - ignorePatterns 只自动加入当前 `settings.dataStorageFolder/`。

测试：
- 新用户默认路径全部在 `ChatFolder/...`。
- persisted 旧默认路径会被规范化到新默认值。
- `_prompts/`, `_skills/`, `_inbox/`, `A-control/PeakAssistant/DataStore/` 不再被任何服务读取。
- `search.ignorePatterns` 自动包含当前 `dataStorageFolder/`，不再自动包含 `A-control/`。
- 用户设置合法 Advanced override 时，对应 helper 和 UI 都使用 override。

## Track B · Onboarding / Setup Wizard 应用设置

背景：用户指出 budget 和目录 mental model 不只属于 Advanced settings，也应该在 onboarding/setup wizard 应用。

做：
1. Audit Setup Wizard / AI Setup / Curator recommended settings 的 write path。
2. 让 onboarding 的 Apply recommended 能写入：
   - folder defaults（root + derived folders；旧默认值直接规范化为新默认值；合法 Advanced override 才保留）；
   - budget defaults：`monthlyUsd`, reset day, alert rules；
   - provider/profile/role recommended binding。
3. UI copy 用用户心智语言：Provider、Model/Profile、Budget、Vault folders。不要暴露 `_skills`, `_prompts`, `_inbox`。

测试：
- Apply recommended 后 settings 持久化。
- 合法 Advanced override 不被推荐值覆盖；旧默认路径不被当成 override。
- Budget defaults 进入 Usage Dashboard 能读的 settings shape。

## Track C · Ambient Push 产品面修正

背景：用户明确不喜欢 recurring Morning Briefing 和状态栏一直闪。长期形态应是稳定的 Related Notes / Ambient panel；gutter 只做稀疏提示。

做：
1. Audit Ambient surfaces：status bar、MorningBriefing、Serendipity gutter、Related Notes view。
2. 调整默认行为：
   - 不默认弹 recurring Morning Briefing。
   - 不把状态栏闪烁作为主 surface。
   - 优先打开/维护一个稳定 panel（右侧 view 或 dockable view），能显示 related notes + current thinking summary。
   - gutter 只在高置信度、低频时出现。
3. 保留已有数据层：AmbientPushRuntime、WorkingThemeInferrer、AmbientPushStore、SQLite logs。不要重造算法。

测试：
- 新用户不会被 Morning Briefing 打断。
- Ambient disabled 时 runtime 不注册/不工作。
- Panel 能显示 items 和 workingTheme summary。
- 状态栏如果保留，只做静态轻提示，不闪烁、不抢焦点。

## Track D · Recoverable Context Compact

背景：上下文太大时不能简单丢；需要“压缩了什么、原文怎么找回”的线索。

做：
1. Audit Chat BudgetGovernor 和 Agent ContextManager 当前 compact/drop 行为。
2. 设计 `CompactSummary` / retrieval anchors：
   - summary text；
   - compressed source refs（message id / file path / resource id / chunk ids）；
   - lost detail note；
   - suggested refetch tools。
3. Agent 需要能通过 Search/resource loader/context tools 找回被压缩内容。
4. 先实现最小闭环：记录 anchors + UI/trace 可见 + agent tool 可取回；不要一口气重写所有 slot。

测试：
- 过预算时生成 compact summary 而不是无痕丢弃。
- anchors 能重新加载原文或资源摘要。
- required slots 不被 drop。
- 小模型窗口下不会无限循环 compact。

## Track E · AI Query Parser for Hyper Search

背景：Search 有高级 query 语法，但用户记不住。需要自然语言 -> Hyper Search syntax/filters/weights 的轻量 parser。它不是 AI Analysis/report。

做：
1. Audit SearchClient/query parser/retriever/ranking 输入合同。
2. 增加一个可选的 AI Query Parser：
   - 输入自然语言；
   - 输出现有 query terms/phrases/excludes/filters/weights；
   - local model 或 fast role 优先；
   - 失败时回退原始 full-text query。
3. UI 要清楚区分：
   - Hyper Search：快速检索/ranking/highlight；
   - AI Analysis：agent-driven 分析/报告。

测试：
- parser 输出 schema validation。
- bad output fallback。
- 复杂自然语言例子能编译到 filters/phrases/excludes。
- Search ranking pipeline 不因 parser 失败而中断。

## Track F · Provider / Cloud Agent SDK / Mode Choice 审计

背景：用户提到可能退役 Cloud Agent SDK，并且想弱化 Chat/Agent/Plan 的显式模式选择。这两个是产品决策，不要未经确认直接删除。

做 read-only audit：
1. 列出 `claude-agent-sdk` / Cloud Agent SDK 的所有代码入口、settings 字段、docs references、tests。
2. 列出 Chat / Agent / Plan mode 的 UI 入口、settings、runtime routing、prompt/template。
3. 给两个方案：
   - keep-as-supported：只有当 owner 仍把它当成正式 supported backend 时才保留，并放到清晰的新设置入口；
   - remove：移除 SDK backend / visible mode switch，改成 intent router。
   不要做第三种“legacy bridge / 兼容旧 backend”方案。
4. 不要直接删除 backend 或 mode，除非 owner 明确选方案。

输出：
- 一个短设计 note + candidate files + risks + tests。

## Track G · Formula/Scoring Tests Where Code Exists

背景：Search、Vault Intelligence、Ambient 的公式文档需要例子；代码层也要有可测试的公式边界。

做：
1. Audit RRF/PPR/ranking boost/highlight/rerank scoring helpers。
2. Audit Vault Intelligence health score / signal weights / severity / affectedRatio。
3. Audit Ambient trigger/candidate scoring/pattern boost/recency boost。
4. 给现有 helper 加 focused unit tests，覆盖一个 worked example 和 2-3 个 bad cases。

验收：
- 不追求大重构，只把公式边界锁住。
- 如果某些公式散在 UI 或 service 里，先抽纯函数再测。

## Verification

至少跑：

```bash
npm run test -- <changed tests>
npm run build
git diff --check
```

如果 `npx tsc --noEmit` 失败，记录是新增还是 pre-existing；不要把 pre-existing 伪装成你的改动导致。

## Final report

用中文汇报：

- 已实现的 track；
- 没实现但已审计的 track；
- 高风险/需 owner 决策；
- 测试命令和结果；
- 没碰的无关 dirty files。
```
