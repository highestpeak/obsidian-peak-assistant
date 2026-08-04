# AI Control Center 配置闭环计划

> 状态：已被 2026-08-04 的执行计划取代。此文保留 2026-08-02 审计上下文，不再代表当前产品范围。
> 当前依据：[AI Control Center 与 My Content 生产实施计划](2026-08-04-ai-control-center-and-my-content-production-plan.md)
> 依据：2026-08-02 对模型调用、AgentLoop、Prompt、embedding、rerank、media 与动态 instruction 的反向覆盖审计
> 产品入口：Settings → AI Setup → AI Control Center

## 1. 结论

AI Control Center 必须覆盖所有会改变 AI 行为的输入与策略，但“可配置”不等于所有运行合同都可任意改写：

- 用户内容、动作指令、模型、输出参数、工具权限、预算和 media route 可以配置；
- Custom Prompt、Vault Skill、Chat Assistant、Project 和 Conversation instruction 由各自 owner 编辑，Control Center 负责汇总和跳转；
- output schema、tool schema、安全边界、writeback 校验和 stop condition 必须可查看，但保持锁定；
- 没有生产调用者的 Prompt 不进入正式配置中心，并从 PromptId、TemplateRegistry 和模板文件中删除；
- 任何可保存配置都必须有运行时消费测试，不能发布“保存成功但执行链不读取”的设置。

本计划不授权本轮修改 production runtime。当前先固定删除、迁移、配置和验证范围，下一轮再实施。

## 2. Impact Contract

### Primary metrics

- 100% 生成式 AI、AgentLoop、embedding、rerank、media 与动态用户定义运行均有 capability / step owner；
- 0 个正式 Prompt 没有生产 caller、companion owner 或明确的动态 owner；
- 0 个稳定模型指令绕过统一 Prompt resolver；
- 0 个可保存的 model、Prompt、output、tool、budget 或 media 设置缺少运行时消费测试；
- 0 个新增稳定 inline Prompt 能绕过守卫测试。

### Required tracks

1. 删除无调用 Prompt；
2. 迁移 inline Prompt 与 action instruction；
3. 收敛 Prompt、model 和 output-control resolver；
4. 建立 capability-step 配置真值；
5. 汇总 User-defined Prompt、Skill、Assistant 与 context controls；
6. 用 receipt 和测试证明 effective configuration。

### Forbidden scope

- 不创建第二套 AI runtime、Prompt store、tool loop 或 receipt store；
- 不把 `Effective routing`、Run history 或 chain-of-thought 恢复成普通用户顶层 Tab；
- 不把 locked runtime contract 伪装成可自由编辑 Prompt；
- 不因追求目录数量保留无 caller 的模板；
- 不用静态 mock、保存成功提示或绿色 build 冒充运行时消费证据。

### Skip budget and stop rule

Skip budget 为 0。若任何保存项尚未接统一 resolver，配置控件必须保持禁用并标记 `Runtime migration required`。只有 source audit、focused tests、build 和真实 Obsidian 配置消费验证均完成后，才允许提交 implementation closure。

## 3. 审计基线

### 3.1 当前目录

- 141 个内置 AI action：Search 17、Composer 68、Chat 29、Vault Intelligence 17、System 10；
- 157 个注册 Prompt；
- 25 个 action 没有 Prompt reference，其中只有两项是确定缺失的文本 Prompt，其余属于 deterministic、embedding、media、用户即时输入或父 Agent 工具子动作；
- User-defined action 数量是动态的，不应计入固定 141 基线。

### 3.2 必须删除的无调用 Prompt

实施前再次运行 caller scan；若结果不变，完整删除：

- `ai-analysis-title`；
- `message-resources`；
- `chat-suggest-actions`；
- `gap-explanation`。

删除范围包括 PromptId、变量类型、TemplateRegistry metadata、模板文件、catalog data 和相关测试。正式配置中心不展示 `Catalog only` 条目。

### 3.3 必须迁移进 Prompt Registry

以下稳定 system/user instruction 目前真实参与模型调用，但没有 Prompt identity：

- Hyper Search 自然语言编译：`AI_QUERY_SYSTEM_PROMPT` 与 `buildUserPrompt`；
- Agent context compact：`SUMMARY_SYSTEM_PROMPT` 与 `renderSummarizerPrompt`。

两套调用都需要 system/user pairing、变量 schema、版本 hash 和 capability-step owner。

### 3.4 必须补全映射

`ai-analysis-followup` 有生产 caller，但当前 action 只登记了 companion system Prompt。`analysis.followup` 必须同时关联 user 与 system Prompt。

### 3.5 Action-level instruction

Composer 当前有 21 条 `templates/config/composer.json` preset instruction，以及 Link Tidy 的源码默认 instruction。它们会改变模型输出，必须进入所属 action 的 Configuration：

- 用户可以覆盖 action instruction；
- shared system/user Prompt 继续单独显示；
- UI 明确 action override 的作用范围；
- writeback schema 和 source-safety contract 保持锁定。

### 3.6 动态用户定义配置

Control Center 增加按实时 registry 生成的 `User-defined` 分组：

- Custom Prompt：正文、变量、适用 surface、model policy；
- Vault Skill：system Prompt、phases、model preference、tool whitelist、quarantine；
- Chat Assistant：instructions、knowledge refs、tool allow/deny/approval、preferred model；
- Project / Conversation：project instructions、custom system Prompt、focus folder 与 output override；
- MCP：server availability 与 action-level tool permission，不把外部工具描述复制成 Peak Prompt。

## 4. 配置模型

每个 AI action 的 Configuration 根据 execution kind 展示适用控制，而不是统一画一个假的 model picker。

| Execution kind | 用户可配置 | 锁定但可查看 |
| --- | --- | --- |
| Text / structured call | Prompt override、action instruction、model、output controls | JSON schema、validation、retry contract |
| AgentLoop | Prompt、model/tier、tools、approval、budget、可安全调整的 stop policy | tool schema、安全边界、writeback contract |
| Embedding / rerank | enable、Profile/model、scope、batch/index policy | vector compatibility、index invariants |
| Media job | user prompt、route、model/preset、quantity、duration、cost confirmation | provider constraints、licensing/version guard |
| Deterministic helper | enable、scope、threshold 或 owning settings link | 明确标注没有文本模型和 Prompt |
| Delegated child / tool | enable、parent tool allow/deny/approval | 继承 parent run 的 model route、tool schema 与 persistence contract |
| User-defined | owner 内容、model、tools、approval | Peak safety envelope 与 persistence contract |

每项配置必须保存为 capability-step policy。共享 Prompt 只拥有文本版本，不拥有 model route。

## 5. 实施 DAG

### Track A · Characterize and delete

1. 生成所有模型、embedding、rerank、media 与 AgentLoop call-site inventory；
2. 为每个调用写入 capability / step identity；
3. 删除四个无 caller Prompt；
4. 修正 `analysis.followup` Prompt 映射；
5. 扩大 no-inline guard，覆盖 system/user builders、nudge 和长 instruction。

### Track B · Prompt resolver closure

1. 将 Hyper Search parser 与 context compact 迁入 PromptId / TemplateRegistry；
2. 将所有直接 `TemplateManager.render(PromptId.*)` 的模型路径迁到统一 Prompt resolver；
3. companion system/user template 使用同一 Vault override resolver；
4. runtime receipt 记录 built-in revision、override hash、system/user pairing 和 variable schema revision。

### Track C · Capability-step configuration

1. 扩展 AI execution contract registry；
2. 将旧 `promptModelMap` 一对一迁到 capability step；
3. 多 caller Prompt 要求显式选择作用范围；
4. 把 output controls、tool policy、budget、media 和 embedding/rerank controls 接入同一 resolver；
5. 没有 resolver consumer 的字段不得渲染为 enabled control。

### Track D · Dynamic owners

1. 将 Custom Prompt、Skill 和 Assistant registry 投影进 `User-defined`；
2. Project / Conversation controls 显示真实 owner 和编辑入口；
3. MCP tool policy 只保存 allow/deny/approval 与 server availability；
4. 删除静态 fixture 中伪造的用户实例，真实 UI 只读运行时 registry。

### Track E · Shared UI

1. AI Actions 与 Prompt Library 继续共用三栏目录；
2. action inspector 保留 Behavior / Configuration；
3. Configuration 按 execution kind 展示适用控制；
4. Configuration 中的 Prompt、instruction、model、output、agent、media、scope 与 tool-policy 编辑统一使用原地 modal；
5. modal 关闭后恢复同一 action、Configuration tab、滚动位置和触发按钮焦点，不自动切换到 Prompt Library；
6. Prompt Library 只显示 retained、migrating 和 user-defined Prompt；
7. locked contract 使用只读区，不提供 Save override；
8. Run、Usage、History 和 Debug 继续链接到原 owner surface。

### Track F · Proof and cleanup

1. 每个保存项增加 resolver-consumption test；
2. 每次 run receipt 记录 requested/effective policy；
3. 增加 catalog-to-callsite、callsite-to-capability 和 no-unwired-prompt guards；
4. build 后在真实 Obsidian 修改至少一种 Prompt、model、tool policy、output control、media route 和 User-defined definition，证明下一次 run 使用新值；
5. 删除旧 Prompt settings UI、旧 promptModelMap read path 与无 caller compatibility code。

## 6. 验证矩阵

| 验证 | 通过条件 |
| --- | --- |
| Prompt caller audit | 所有 retained Prompt 有 caller、companion 或动态 owner |
| Inline instruction audit | 稳定模型 instruction 只来自 registered Prompt/action instruction/locked contract registry |
| Save-consumption tests | 每个可保存字段至少有一个执行路径断言 effective value |
| Resolver audit | 模型调用不直接选择未登记 Profile/model，不直接绕过 Prompt override |
| Receipt audit | capability、step、Prompt version、requested/effective model、tool policy、output controls 可追溯 |
| UI audit | 无 model call 的 action 不显示假的 text-model picker；locked contract 不显示 Save；secondary editor 使用 modal 并恢复 action / tab / scroll / focus |
| Product verification | 真实 Obsidian 中修改配置后，下一次 run 与 receipt 同时反映新值 |

## 7. 回滚与清理

- Registry 和 resolver 迁移使用兼容读取、单一写入；旧值只在迁移窗口读取；
- 若某 action 无法证明消费新 policy，回退为只读 Configuration，不回退到旧的假设置；
- Prompt 删除前保留一次 source/caller audit artifact；误判时通过版本控制恢复模板和 metadata；
- closure 完成后删除旧映射、旧 UI 和迁移日志，不长期保留双重 truth source。
