# AI Control Center 与 My Content 生产实施计划

> 状态：实施中（2026-08-04）
> Owner 决策：AI Control Center 只让用户配置真正会影响 AI 行为的项目；My Content 只管理用户明确创建、保存、导出或 materialize 的 Peak 产物。
> 设计参考：`docs/gstack/ai-control-center-2026-07-30/` 与 `docs/gstack/data-storage-2026-08-04/` 是交互方向，不是生产完成证据。

## 1. Requirement gate

### 用户要解决的问题

用户需要一个地方管理 AI 行为，但不需要看到内部运行细节、JSON/JSONL 记录、SQLite projection、embedding、cache、telemetry 或旧数据迁移。用户还需要一个单独页面找到自己明确保存或导出的 Peak 结果，而不是一个暴露系统存储实现的 Output Registry。

### 成功标准

1. 每个可编辑的 AI 控制项都有真实的下一次运行消费路径和 focused test；没有消费者的控件不显示为可保存设置。
2. 一个内置 AI action 在同一 inspector 中显示其 prompt、模型、工具/审批/预算和输出控制；不再有全局 `All prompts`、`Behavior / Configuration` 双 tab、普通用户可见的 run history 或 effective routing 页面。
3. Custom Prompt 与 Chat Assistant 是两个独立的、可在 Control Center 创建与编辑的产品对象；Vault Skill 不在此页管理。
4. 所有 Custom Prompt 变量由统一的 Handlebars renderer 渲染；禁止 action 内手工 `replace('{{...}}')` 或拼接用户可编辑的模板。
5. My Content 只列用户明确产生的 Peak 内容，可按产物类型、来源和时间（快捷项与自定义日期范围）筛选；普通 Vault 笔记和内部机器状态仍由其 owner 管理。

### 禁止范围

- 不新建第二套 AI runtime、Prompt store、run receipt store 或数据持久化体系。
- 不把确定性的 Query Parser 当作 AI action；它继续解析 `tag:`、`folder:`、引号和排除语法。
- 不删除当前确定性的 `Reranker`；仓库没有可退役的 LLM rerank 调用，只有需要清理的旧文案。
- 不把 embedding、cache、projection、telemetry、debug、run trace 或 chain-of-thought 放进普通用户导航。
- 不把 Mock 的静态按钮或“Save”提示当成 production wiring。

### Stop / commit rule

每个可独立验证的基础闭环单独提交。任何无法证明“保存值影响下一次运行”的配置，保持隐藏或只读；不为了界面完整而写假设置。真实 Obsidian 交互无法验证时必须标记 `INTERACTION NOT VERIFIED`。

## 2. 已确认的源码事实

| 事实 | 证据 | 实施含义 |
| --- | --- | --- |
| 正常 `queryText` / `queryStream` / `queryStructured` 路径经 active profile resolver，而不是 `promptModelMap` | `src/service/chat/service-manager.ts` | 旧 per-prompt model map 不能直接做成可保存 UI；先引入 action-policy resolver 并让调用链消费。 |
| Custom Prompt 通过共享 PromptService Handlebars renderer 渲染声明变量，agent 收到已渲染 system/user prompt | `src/service/copilot/CustomPromptRegistry.ts` | 已完成统一渲染；后续 UI 可复用同一变量 schema，不得恢复 action 内手工替换。 |
| `PromptService` 已是内置 Prompt 的 override + Handlebars owner | `src/service/prompt/PromptService.ts` | 动态 prompt renderer 由它提供；app composition 通过窄 port 注入 Copilot runtime。 |
| `query-parser.ts` 是确定性语法解析，`reranker.ts` 是确定性分数调整 | `src/service/search/query/` | 两者均不进入 AI Control Center。 |
| Chat Assistant 已有自己的 durable definition 与 runtime | `src/service/chat/service-assistant.ts` | Control Center 可做该 owner 的创建/编辑入口，不复制其 store。 |
| Chat、Project、Hub、AI Graph 等 canonical storage 已有生成物治理 | `docs/conventions/generated-artifact-registry.md` | My Content 是用户产物的浏览与筛选层，不能重写 canonical storage。 |

## 3. 产品信息架构

### AI Control Center

- 左侧是扁平的产品动作目录：Search, Analysis & Knowledge；Composer & Copilot；Chat & Generation；Vault Intelligence。相同状态标签相邻显示。
- 选中 action 后，一页依序显示：是否可用、模型 policy、工具/审批/预算、输出控制、最多一对 system/user prompt。无 prompt 的 action 不显示空的 Prompt 区。
- 内置 prompt 只出现在拥有它的 action 中；没有 `All prompts`。
- 每个 prompt 的编辑 modal 直接列出该 action 的 Handlebars variables：一行一个 field、详细说明、整个表可折叠，默认可读且不打断编辑器。
- Custom Prompt 与 Chat Assistant 是同级入口，均能新增与编辑；前者创建 Copilot action，后者创建 Chat Studio assistant。两者不再笼统称为 `User-defined`。
- 不展示：embedding/background maintenance、deterministic parser/reranker、Vault Skill、run history、effective routing、locked runtime contract 详情。

### My Content

- 独立页面名为 **My Content**，不是 Data & Storage / Output Registry。
- 仅列：User Profile、保存的 AI Search 报告或导出、AI Graph 导出、materialized Hub、保存的 Chat 内容或 artifact、生成媒体、明确保存的项目文件/媒体，以及未来被 registry 标记为 user-visible 的显式输出。
- 不列：Prompt override、Vault Skill、普通 Vault 文件、原笔记上的就地修改、SQLite/FTS/embedding/cache/telemetry、JSON/JSONL journal、migration source。
- 搜索框后使用紧凑的 Filter 按钮/Popover：类型、产出来源、Today / Last 7 days / Earlier 与 From–To 日期选择器。

## 4. 实施 DAG

```text
0. Truth audit + plan
   ├─ 1. Prompt rendering foundation
   │    ├─ unified dynamic Handlebars port
   │    ├─ Custom Prompt migration + variables schema
   │    └─ focused consumption tests
   ├─ 2. Action policy resolver
   │    ├─ action identity / model / output / agent policy
   │    ├─ migrate valid consumers off promptModelMap
   │    └─ requested/effective receipt fields
   ├─ 3. AI Control Center production surface
   │    ├─ action inventory projection
   │    ├─ built-in action editing
   │    └─ Custom Prompt + Chat Assistant CRUD entry points
   └─ 4. My Content production surface
        ├─ user-visible output projection
        ├─ source/type/time filters
        └─ opening/locating the original owner surface
```

### Phase 0 — truth and documentation (current)

- Replace the obsolete plan and planned-requirement wording that still names `All prompts`、`User-defined`、Vault Skill and user-facing embedding/rerank configuration.
- Keep the 2026-08-02 audit as evidence, but do not promote its static catalog counts to product truth.
- Delete only stale claims of an LLM rerank; do not delete deterministic ranking code.

### Phase 1 — unified dynamic prompt foundation

1. Add a narrow `PromptTemplateRendererPort` with one operation: render a template against declared variables.
2. Let `PromptService` own its implementation, including Handlebars helpers and a bounded compiled-template cache; expose it through `AIServiceManager` only as a facade and inject it from app composition.
3. Replace Custom Prompt regex replacement and user-prompt assembly with declared `systemTemplate` / `userTemplate` variables rendered by that port.
4. Preserve existing Custom Prompt semantics: Markdown prompt values must remain literal text rather than become HTML-escaped by Handlebars.
5. Add test cases for all legacy variables, conditionals, missing optional selection and literal angle-bracket content. A test must prove the injected renderer receives the declared variable set and the agent receives its output.

内置 Prompt override 的缓存也必须以 Vault 文件版本为准：同一个 `PromptId` 的下一次 render 会在文件被修改或删除后读取新内容或回退 bundled default，不能把“即时生效”只写在 UI 文案里。

### Phase 2 — action policy resolver

1. Inventory every action that actually calls a provider, agent loop or media provider; give each one action identity and execution shape.
2. Define one action policy source for model selection, output controls, tools/approval/budget where applicable. This policy is consulted by the active query/agent route, not merely read by UI.
3. Migrate valid `promptModelMap` consumers; delete it only after all active readers are migrated and characterization tests pass.
4. Register system/user pairings and variable schemas. Migrate stable inline prompts only after their caller, owner and tests are identified; do not blanket-convert internal strings.

已开始的可验证子项：Custom Prompt 的 `model:` frontmatter 会透传到 Copilot agent 的实际 `streamHarnessModel` 调用；它只覆盖当前 active provider profile 中的 model，不承诺跨 provider routing。其余 action 的统一 policy 仍须先完成调用方 inventory，不能用这个单项冒充全局 resolver。

### Phase 3 — Control Center production UI

1. Build the action list from the real action-policy registry, not from the HTML Mock fixture.
2. Implement inline action configuration and prompt-edit modal. Persist only owner-backed values, then prove the next run receives effective values.
3. Add real Custom Prompt create/edit and Chat Assistant create/edit flows; refresh the runtime catalog after successful Custom Prompt save.
4. Keep unsupported or locked sections hidden. Do not implement history/effective routing here.

### Phase 4 — My Content production UI

1. Add a user-visible output projection based on `GeneratedOutputRegistry` ownership metadata and explicit output records; do not scan or move arbitrary Vault files.
2. Provide source/type/time filters and direct open/materialize actions only where the source owner supports them.
3. Characterize profile, reports, graph export, Hub materialization, saved chat artifacts, generated media and project files against the registry before exposing them.

## 5. Verification matrix

| Area | Required proof |
| --- | --- |
| Dynamic template foundation | unit/port test proves Custom Prompt uses injected renderer; legacy variables and literal text retain behavior |
| Prompt override | focused test edits/loads an override and next render uses it |
| Model/output/tool policy | resolver-consumption test asserts requested policy changes the actual query/agent options |
| Catalog | no user-visible action is merely a deterministic parser, reranker or internal background maintenance job |
| Custom Prompt / Assistant | CRUD persists through its existing owner and the refreshed runtime/projected action reflects it |
| My Content | only registered user-visible artifact kinds appear; type/source/time filters produce the correct projection |
| Build and runtime | focused tests + `npm run build`; real Obsidian modify-save-run/open flow when CDP is available, otherwise `INTERACTION NOT VERIFIED` |

## 6. Deferred decisions

- The full action-policy schema and receipt shape are not chosen until Phase 2 completes its caller inventory.
- Composer preset migration, Hyper Search context compact and all historic template deletion remain candidates, not authorized bulk deletions.
- My Content pagination, cross-vault synchronization and bulk deletion must be designed against actual product records; this plan does not authorize an independent content store.

## 7. 2026-08-04 生产入口闭环（已实现，仍非全局 action-policy 完成）

- 新增两个真正的 Obsidian `ItemView`：**AI Control Center** 与 **My Content**；均通过 Command Gateway 的稳定 Command Palette 入口打开，也会出现在 Peak Command Center 的可添加页面目录。
- AI Control Center 当前只投影会实际渲染 Prompt 的 Copilot actions；确定性 action 不出现。内置 Prompt 编辑通过 `PromptService.savePromptOverride()` 写入现有 Vault override，下一次 render 按文件版本读取；Custom Prompt 在页内创建/编辑/删除，Chat Assistant 复用现有 owner 的 builder 与持久化。
- My Content 当前只列举 registry 可验证且路径确定的 materialized/user-owned 文件（例如 Profile、Hub、Chat artifact、媒体、Project Brief）；任意用户选择位置的 AI Search/AI Graph/Native export 尚没有 owner 写入的 user-surface receipt，因此故意不猜测或扫描普通 Vault Markdown。
- 已验证：`test/ai-control-center-runtime.test.ts`、`test/my-content-runtime.test.ts`、Prompt override、Custom Prompt watcher、Command Gateway focused tests，以及 `npm run build`。
- 仍缺：全产品 action-policy resolver（per-action model/output/tool/approval/budget），以及 user-selected export 的显式 record projection。没有把它们显示成可编辑或可列举的假功能。真实 Obsidian 打开/编辑/保存交互：`INTERACTION NOT VERIFIED`（本次无可用 CDP listener）。
