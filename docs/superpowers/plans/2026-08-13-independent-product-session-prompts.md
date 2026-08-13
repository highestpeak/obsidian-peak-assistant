# Independent Product Session Prompts

**Date:** 2026-08-13

**Purpose:** Copy one prompt into one isolated Codex session/worktree. Each prompt owns the full path from current-source audit through product and architecture design, implementation, verification, and an owned commit.

## Dispatch Order

The following can start independently:

1. Peak Local Workflows
2. External Sources Inbox
3. Message Persistence Queue
4. Real-time LLM Context Inspector
5. Template Marketplace
6. Peak Share vertical slice
7. Source Fragment + Voice Thought Capture

Start these after their dependency is available or explicitly keep integration deferred:

- Sellable Vertical AI Workbench Packs: consume the Template Marketplace package contract; do not build a second installer.
- Peak MCP / n8n Interoperability: consume the Local Workflows and Capability Gateway contracts; do not build a second workflow runtime.

Each task must use a separate worktree and commit only its owned files. The owner checkout and `docs/roadmap.html` are protected integration surfaces.

---

## Prompt 1 - Peak Local Workflows

```text
你在 Peak Assistant 仓库中完成“Peak Local Workflows”从设计到生产实现的完整任务。

仓库：/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

先创建独立 worktree，并记录起始 branch、HEAD、git status 和其他活跃 worktree 的重叠文件。阅读 AGENTS.md、docs/progress.md、docs/roadmap.html、docs/research/2026-07-03-ifttt-workflow-agent/README.md，以及 Command Gateway、Capability Registry、RunEnvelope、权限和生成产物治理文档。旧研究只是输入，当前源码才是真值。

目标：交付一个本地优先的 Trigger -> Filter -> Actions[] 工作流系统，让用户可以在 Obsidian 内创建、启停、试跑、观察和审阅自动化。它不是 n8n 复刻，也不是第二套 Agent runtime。

先完成现状审计和正式设计，写入 docs/superpowers/specs/ 下的新 spec，并给出当前调用图、数据模型、状态机、权限模型、失败恢复、持久化策略和 UI flow。设计完成后不要停，继续实施。

必须实现：
- versioned PeakWorkflow schema，至少支持 manual、vault file-created/file-modified、schedule 三类 trigger；
- deterministic filters，以及通过现有 AI Capability Gateway 执行的可选 LLM judge；
- actions 只能绑定现有 Capability/Command Gateway 能力、通知、受治理的 Vault write 和 delay；禁止 arbitrary JS/shell；
- app-owned scheduler/dispatcher，幂等、重入保护、取消、重试上限和明确的失败状态；
- workflow 列表、form-based editor、启停、duplicate、dry run、最近运行记录和逐步 receipt；不做拖拽画布；
- 至少三个可用 starter workflow；
- definitions、run records 和 receipts 按 generated artifact governance 登记，不能用 SQLite 作为 canonical truth；
- 敏感或写操作继续经过现有 permission gate，AI 不得自行授权。

强制架构规则：新逻辑直接是 canonical；不加 legacy fallback、双写、旧 schema 兼容层或 service singleton；runtime 由 app 层组合；service/core 不得通过 AppContext.getInstance() 偷依赖；配置和文案进入模板/config 体系；不要复制 AgentLoop、Command Gateway、Context Pipeline 或 persistence runtime。

执行 DAG：source audit -> Impact Contract -> spec -> contract/focused tests -> core schema/ports -> service engine -> app composition -> UI -> receipts/storage -> failure/restart tests -> build/boundary audit -> real Obsidian QA。

验收至少覆盖：同一事件不重复执行、插件重载恢复、禁用 workflow 不运行、dry run 不产生副作用、action 中途失败停止后续写操作、权限拒绝、定时器漂移、循环触发防护、未知 capability fail-loud。没有 CDP 时把真实交互逐项标记 INTERACTION NOT VERIFIED，不能用 source test 冒充。

完成后运行 focused tests、npm run build、npm run audit:boundary 和 git diff --check。只提交本任务文件，commit message 用英文，报告 commit SHA、测试结果、未验证交互和集成冲突。不要修改或提交 docs/roadmap.html。
```

## Prompt 2 - External Sources Inbox

```text
你在 Peak Assistant 仓库中完成“External Sources Inbox”从设计到生产实现的完整任务。

仓库：/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

使用独立 worktree。先阅读 AGENTS.md、docs/progress.md、docs/roadmap.html、docs/research/2026-07-03-external-notes-sync/README.md、folder layout 和 generated artifact governance。先用官方资料重新核验 flomo、Apple Notes 和 Calendar 当前可用接口、授权方式和限制；旧文档中的 API 结论可能过期，不能直接照抄。

目标：建立统一的单向外部来源导入能力，并完成 flomo、Apple Notes、Calendar 三个 production adapter。外部内容进入一个可管理的 External Sources Inbox，再由用户整理进知识库；不做双向同步。

先写正式 spec，明确 source item identity、cursor/checkpoint、去重、更新、删除、冲突、附件、时区、recurrence、授权、mobile/macOS 能力差异、失败恢复和用户目录 mental model。随后直接实施。

必须实现：
- 中立 ExternalSourceAdapter/Registry/SyncRuntime 契约；
- app-owned scheduler 和 manual sync，支持 per-source interval、暂停、取消、backoff 和 last successful checkpoint；
- stable external ID + content hash，重复拉取不得重复创建；
- flomo adapter、macOS-only Apple Notes bridge、Calendar OAuth adapter；不可用平台必须诚实显示原因；
- 默认目录收敛在同一个 Peak/ChatFolder 根目录下，例如 Imports/<source>；只有 Advanced setting 才允许改路径；
- Inbox UI 展示来源、同步状态、最近错误、待整理数量、打开原来源、重新同步和关闭来源；
- imported Markdown 保留 provenance、原始链接、外部时间和 sync identity；不能悄悄覆盖用户已经编辑的正文；
- credential 使用现有安全存储/设置机制，日志和 trace 必须 redact；
- adapters 使用 fixture 和 fake transport 可完整测试，真实凭据 QA 与自动测试分开报告。

新实现直接成为 canonical：不加 legacy folder 迁移、旧默认目录兼容、双向 merge 或第二套 index。不要直接写 SQLite；用户拥有的导入笔记可以是 Markdown，sync cursor/receipt 应是受治理的 JSON/JSONL。不要把 platform API 放进 core/service，AppleScript/OAuth 适配器留在 app/platform 边界。

执行 DAG：official API verification -> source audit -> spec -> adapter contracts -> fake adapters/tests -> registry/runtime -> each production adapter -> Inbox/settings UI -> persistence/receipts -> restart/error tests -> build/boundary -> credential-gated live QA。

验收覆盖新增、更新、重复、远端删除、用户本地编辑、断网、401/refresh、partial batch、timezone/DST、recurring event、Apple Notes 权限拒绝、mobile unsupported。无真实账号时标记对应 E2E 为 CREDENTIAL-BLOCKED，不能伪造成功。

运行 focused tests、npm run build、npm run audit:boundary、git diff --check。只提交本任务文件，英文 commit，报告 SHA 和各 adapter 的真实验证等级。不要修改 docs/roadmap.html。
```

## Prompt 3 - Message Persistence Queue

```text
你在 Peak Assistant 仓库中完成“Message Persistence Queue”从设计到生产实现的完整任务。

仓库：/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

使用独立 worktree。先审计当前 Chat JSONL、TurnExecutionReceipt、artifact association、My Content、GeneratedOutputRegistry、PromptService、model routing 和消息 UI。阅读 docs/research/2026-07-03-message-persistence-queue/README.md，但注意其中 chat.sqlite、旧 writer 和路径描述可能已经过时，必须以当前源码与存储治理为准。

目标：在 assistant turn 完成后识别具有长期价值的内容，进入可审阅的保存队列，并在用户许可下形成用户拥有、可回溯来源的 Vault 笔记。

先写 spec，定义 worthy/no/maybe 判定、策略状态机、queue item、去重键、来源引用、标题/目录/tags 建议、编辑与接受、失败恢复、隐私和成本边界。然后实现完整闭环。

必须实现：
- deterministic prefilter + 通过现有 AI capability/model resolver 运行的 structured classifier；禁止业务层直接绑 provider/model；
- `never / ask / automatic` 三种用户策略，默认 `ask`；任何自动写入都必须是用户明确选择 automatic 后的可审计行为；
- durable queue 与 decision receipt，支持 pending、accepted、dismissed、failed、retry；
- assistant message 上的轻量入口，以及一个集中队列视图用于预览、编辑标题/目录/tags、批量接受或忽略；
- 接受后写用户拥有的 Markdown，包含 conversation/message/run 来源和生成时间；机器判定与运行日志留 JSONL，不塞进用户文档；
- 同一 message variant/branch 不得重复保存；重新生成后必须区分 active variant；
- 写入使用当前 generated output registry/materialization contract，并出现在 My Content 的正确投影中；
- 分类失败不能影响主 Chat turn，队列写入失败必须可重试且不能假装成功。

新逻辑是唯一 canonical 流程；删除或替换任务范围内已有零散 save-to-vault 分叉，不保留双入口/双 writer/legacy fallback。不要复制 Chat runtime、PromptService、AI resolver 或 persistence runtime。

执行 DAG：audit existing save paths -> Impact Contract -> spec -> classifier contract tests -> durable queue -> materializer -> message action -> queue UI -> My Content projection -> restart/dedupe/failure tests -> build/boundary -> Obsidian QA。

验收包含短答、纯工具结果、结构化长答、代码答复、variant、branch、dismiss/retry、automatic policy、permission denial、重启恢复和并发完成。Classifier 需要一个可复现 fixture set，并报告 precision/false-positive 基线，而不是只测 schema。

运行 focused tests、npm run build、npm run audit:boundary、git diff --check。只提交任务文件，英文 commit，报告 SHA、分类样本结果和 INTERACTION NOT VERIFIED 项。不要改 docs/roadmap.html。
```

## Prompt 4 - Real-time LLM Context Inspector

```text
你在 Peak Assistant 仓库中完成“Real-time LLM Context Inspector”从设计到生产实现的完整任务。

仓库：/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

使用独立 worktree。先阅读当前 RunEnvelope、TraceBus、ContextPipeline、context slots、compact summary、model/tool invocation、Debug Trace Infrastructure、AI Control Center 和 docs/research/2026-07-03-realtime-llm-context-inspector/README.md。证明哪些数据已经真实记录，哪些仍缺失；不能基于旧研究假设。

目标：让用户和维护者看见每次实际模型调用最终收到的上下文，而不是配置层推测。Inspector 必须实时跟随 run，并解释消息、system prompt、slots、附件、tools、预算、压缩、裁剪、provider/model、token 和时序。

先完成 visual-first UX、隐私模型和正式 spec，再实施。入口优先放在真实 Run/Trace/AI Control Center 上，不为调试功能污染 Command Palette。

必须实现：
- app-owned Run Inspector projection，直接订阅现有 RunEnvelope/Trace；不得创建第二套 trace bus；
- active/recent run selector、step timeline、final request viewer、response/tool viewer、context budget/compaction view 和 source provenance；
- 清楚区分 configured、assembled、compacted、actually sent 四个阶段，并支持对比；
- 默认只保留内存中的 redacted snapshot；可选 durable redacted snapshot 必须登记 artifact；full-local/raw 必须显式开启并带永久警示；
- secret、credential、authorization header、private tool payload 和超大二进制内容自动 scrub/collapse；
- copy/export 输出带 schema/version/redaction mode，不能泄露默认隐藏内容；
- streaming 更新稳定，不因高频 trace 造成 React 重渲染风暴或改变主 run 行为；
- Chat、AI Search/Harness 至少两个真实 adopter，其他 surface 通过同一 port 接入。

新实现直接成为 canonical Inspector，不保留旧 debug trace 的第二套 UI；如已有 Copy Trace，应复用统一 projection/exporter。不要复制 context assembly、重新计算 token 作为“实际值”，也不要为了展示而改变发给模型的 payload。

执行 DAG：trace coverage audit -> privacy threat model -> UX/spec -> projection tests -> snapshot/redaction -> app runtime -> UI -> two adopters -> performance tests -> build/boundary -> live streaming QA。

验收覆盖无工具、多个 tool step、context compact、provider error、abort、streaming、secret redaction、超大 payload、run switching、detached window、重启和导出。没有 CDP 时保持 INTERACTION NOT VERIFIED；截图不证明实时流或 focus behavior。

运行 focused tests、npm run build、npm run audit:boundary、git diff --check。只提交任务文件，英文 commit，报告 SHA、采集覆盖矩阵、性能结果和隐私残余风险。不要修改 docs/roadmap.html。
```

## Prompt 5 - Template Marketplace

```text
你在 Peak Assistant 仓库中完成“Template Marketplace”从协议设计到生产实现的完整任务。

仓库：/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

使用独立 worktree。审计 TemplateRegistry、TemplateManager、PromptService、skills、config templates、folder settings 和 docs/research/2026-07-03-template-marketplace/README.md。用官方资料核验当前 GitHub release/raw API、签名和速率限制方案。当前源码和安全边界优先于旧文档。

目标：实现 GitHub-based、无 SaaS 的模板分发系统，支持官方索引和用户添加的可信 source。模板只允许声明式 Markdown/JSON 资源，绝不执行下载包中的 JavaScript。

先写 versioned package protocol 和正式 spec，然后实现 plugin marketplace、安装器、更新器、卸载和示例 catalog。

必须实现：
- manifest schema：id、version、Peak compatibility、author、license、files、checksums、capabilities、changelog、trust metadata；
- central index + custom source URL，两者经过同一校验器；
- package fetch、checksum/signature verification、staging、preview diff、atomic install、update、rollback、uninstall；
- installed lockfile 和 source provenance，重启后可恢复；
- Signed/Curated、Community、Local source 三档信任，UI 不得把未验证内容装成“安全”；
- Marketplace ItemView：搜索、筛选、详情、权限/文件清单、安装状态、更新提示、来源管理；
- 默认目录遵守单一 Peak 根目录 mental model，Advanced setting 才能改变；
- 安装后通过现有 TemplateRegistry/PromptService/Skill loader 消费，不创建第二套模板 runtime；
- 一个本地 fixture catalog、至少三个真实示例 package、schema/CI validation script；不要求本任务发布外部 GitHub 仓库。

新协议直接是 canonical；不支持旧无 manifest 文件夹、静默迁移、任意代码包、远程动态执行或覆盖用户本地修改。升级发现用户修改时必须停下并要求选择，不得强覆盖。

执行 DAG：current template audit -> threat model -> protocol/spec -> schema validator -> fixture catalog -> transactional installer -> source/index client -> ItemView -> registry integration -> update/rollback tests -> build/boundary -> network/live QA。

验收覆盖 checksum mismatch、signature failure、malformed manifest、path traversal、zip bomb/oversize、rate limit、offline cache、partial download、version downgrade、Peak incompatibility、local modifications 和 rollback。

运行 focused tests、npm run build、npm run audit:boundary、git diff --check。只提交任务文件，英文 commit，报告 SHA、协议版本、安全测试和未完成的外部 catalog 发布。不要修改 docs/roadmap.html。
```

## Prompt 6 - Sellable Vertical AI Workbench Packs

```text
你在 Peak Assistant 仓库中完成“可售卖垂直 AI 工作台包”从市场/产品设计到一个生产级 reference pack 的实现。该任务应在 Template Marketplace package contract 可用后执行；如果依赖尚未合并，只能实现中立 pack 内容和 adapter contract，不得另造 installer。

仓库：/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

使用独立 worktree。阅读 AGENTS.md、roadmap 中垂直工作台条目、Peak File Workspace/HTML Workspace、安全沙箱、Template Marketplace 和 generated artifact governance。浏览当前市场和官方平台资料，比较小说创作、健康/日记、旅行、研究等候选，不得凭印象宣布市场空白。

目标：验证并实现“方法包而非皮肤包”。一个 pack 应包含领域工作流、instructions/prompts、结构化数据模板、示例、可复用 workspace、权限声明和帮助内容，同时所有用户数据继续归 Vault。

先交付：候选评分、目标用户、付费问题、竞品、免费核心/付费 pack 边界、许可/升级模式、安全威胁模型、package contract 扩展和 visual-first UX spec。随后选择一个最强场景，完成一个真正可用的 reference pack；不要同时浅做多个场景。

必须实现：
- versioned VerticalPack manifest，建立在 Marketplace package 上，不复制安装/更新逻辑；
- 一个 reference pack 的完整 starter project、prompts、skills/workflows、dataset/config、示例与用户说明；
- pack onboarding、创建实例、打开工作台、使用 AI capability、保存用户产物、升级和卸载流程；
- pack 只能声明能力和内容，不能拥有第二套 AI runtime、任意 JS、隐藏网络请求或越权写 Vault；
- HTML workspace 若存在交互，必须 sandbox + CSP + allowlisted bridge + explicit permissions + receipts；
- pack 更新不能覆盖用户数据；content version 与 user instance version 分开；
- 明确 license/entitlement port，但不在本任务硬编码某个支付平台；提供 local entitlement fixture 供测试；
- 可通过 Template Marketplace fixture 安装、创建和升级 reference pack。

新 pack 模型直接是 canonical，不实现 legacy `*.pick.html` 兼容解析器，不把单个 HTML 文件当完整产品，也不把远程页面当 Vault 数据真值。

执行 DAG：market research -> product decision -> pack protocol delta -> UX/spec -> reference pack content -> safe workspace adapter -> lifecycle/entitlement -> marketplace fixture integration -> end-to-end tests -> build/security review -> real Obsidian QA。

验收必须证明：首次创建、关闭重开、用户修改后升级、无 entitlement、pack removal 保留用户内容、AI 不可用降级、离线使用、权限拒绝和恶意 pack 资源被拦截。市场结论、生产实现和支付系统未验证项分开报告。

运行 focused tests、npm run build、npm run audit:boundary、git diff --check。只提交任务文件，英文 commit，报告 SHA、reference pack、研究证据和 INTERACTION NOT VERIFIED 项。不要修改 docs/roadmap.html。
```

## Prompt 7 - Peak MCP / n8n and Multi-agent Interoperability

```text
你在 Peak Assistant 仓库中完成“Peak MCP / n8n / Multi-agent Interoperability”从重新调研到受控生产实现的完整任务。该任务依赖 Peak Local Workflows 和现有 Capability Gateway；不允许创建第二套 workflow/agent runtime。

仓库：/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

使用独立 worktree。阅读 docs/research/2026-07-03-n8n-multi-agent-marketplace/README.md、IFTTT research、MCP client、Command/Capability Gateway、Agent Harness、permissions 和 RunEnvelope。重新核验当前 MCP、n8n community node/custom tool、Claude/Codex connector 能力。旧结论“不要复刻 n8n、不要 SaaS marketplace、不要 always-on agent”仍是硬边界。

目标：让外部 workflow/agent 工具在用户明确授权下调用 Peak 的 vault-aware 能力，并取得结构化结果和 receipt。Peak 作为受控 MCP capability server/worker，不成为通用 orchestration 产品。

先写互操作 spec：transport、discovery、authentication、capability allowlist、input/output schema、permission challenge、run lifecycle、timeout/cancel、receipt、Obsidian 未运行时行为和 threat model。然后实现最小但完整的生产链路。

必须实现：
- 本地 MCP server/bridge，暴露只读 discovery 和 owner-approved capability execute；
- 对外 schema 从现有 Capability Contract 派生，不能维护手写漂移副本；
- 每次执行进入现有 Agent Harness/Capability Gateway/RunEnvelope，外部调用者不能拥有 Peak agent loop；
- allowlist、per-client identity、token/handshake、rate limit、timeout、cancel 和 explicit write permission；
- Obsidian 关闭时诚实返回 unavailable，不启动隐藏 daemon 或复制 Vault；
- structured result + artifact refs + receipt，禁止外部客户端直接写 Peak SQLite/JSONL；
- 一个可运行的 n8n example workflow、一个 generic MCP client fixture 和互操作文档；
- workflow template 分发复用 Template Marketplace，不建设 SaaS marketplace；
- multi-agent 仅允许外部 orchestrator 调多个现有 Peak capabilities，Peak 内部仍只有 Harness/SubAgent contract。

新桥接直接是 canonical 外部入口；不兼容旧临时 endpoint、SDK-shaped wrapper、raw command passthrough 或任意 shell。不要把长期凭据写入 Vault 文档或 trace。

执行 DAG：ecosystem verification -> current MCP audit -> threat model/spec -> derived schemas -> local server -> auth/permissions -> Gateway adapter -> fixtures/examples -> adversarial tests -> build/boundary -> real external client QA。

验收覆盖 unknown client、revoked token、write denial、schema mismatch、large payload、timeout/cancel、Obsidian shutdown、concurrent runs、replay、direct storage attack 和 receipt correlation。没有真实 n8n/客户端环境时明确 CLIENT E2E NOT VERIFIED。

运行 focused tests、npm run build、npm run audit:boundary、git diff --check。只提交任务文件，英文 commit，报告 SHA、安全结论、example 路径和未验证外部环境。不要修改 docs/roadmap.html。
```

## Prompt 8 - Peak Share Product Line Vertical Slice

```text
你在 Peak Assistant 仓库中完成“Peak Share 产品线”从产品/安全设计到第一个端到端付费价值切片的实现。不要试图一次浅做 Share、Review、Forms、Portal 四个壳；设计完整共享领域模型，实施一个可验证的 Share + Review/approval vertical slice。

仓库：/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

使用独立 worktree。阅读 docs/research/2026-07-22-obsidian-one-click-sharing/README.md、Composer source-range/review、generated artifact governance 和安全约束。浏览当前市场、Obsidian Publish/Sync 官方资料及候选基础设施。研究、架构决策和实现证据必须分开。

目标：作者在 Vault 中显式选择一篇文档并发布不可变 revision；受邀客户通过私密链接查看、针对稳定锚点评论、请求修改或批准；作者在 Peak 中审阅反馈并显式写回。为未来 Forms/Portal 预留共享 identity/version/event 模型，但本任务不实现空壳导航。

先产出产品切口、用户 journey、领域模型、隐私/身份/权限/threat model、后端选择记录、同步协议、计费边界和 visual-first spec。随后实现完整 vertical slice。

必须实现：
- explicit publish selection、immutable publication revision、stable block/range anchors 和 source revision hash；
- private publication、invite/access control、expiry/revoke、viewer identity；
- version-aware comment thread、change request、approve/reject 和 audit events；
- Peak 内 review inbox，外部评论必须由用户显式选择后才能进入 Copilot/Composer context；
- 本地私人评论绝不能随发布自动上传；
- document update 产生新 revision，不悄悄改写客户正在审阅的版本；
- provider-neutral publish backend port + 一个可运行的开发/测试 backend；若选择云服务，凭据和部署必须隔离，不能进入 plugin bundle；
- CSP、content sanitization、attachment allowlist、rate limit、CSRF/session、revocation 和 data export/delete；
- Share/Review 共享事件模型能自然扩展到 Forms/Portal，但不提前建立无功能页面。

新产品协议直接是 canonical，不加旧 share payload 兼容、匿名公开默认、自动发布、双写评论或未经允许的 AI ingestion。不要让远程数据库成为本地 Vault 文档的 source of truth。

执行 DAG：market/product research -> wedge decision -> threat model -> architecture/spec -> backend contract -> test backend -> plugin publish/review -> web viewer/review -> version/sync -> security tests -> builds -> end-to-end QA。

验收覆盖发布、邀请、评论、修改请求、批准、新 revision、撤销、过期、离线重试、stale anchor、恶意 Markdown/HTML、附件权限、删除/导出和未授权 AI context。若没有生产域名/凭据，开发环境 E2E 可以验证，但必须标记 PRODUCTION DEPLOYMENT NOT VERIFIED。

运行插件和 companion/backend 的 focused tests/build/security checks，以及 git diff --check。只提交任务文件，英文 commit，报告 SHA、运行方式、威胁模型残余项和部署验证等级。不要修改 docs/roadmap.html。
```

## Prompt 9 - Source Fragment + Voice Thought Capture

```text
你在 Peak Assistant 仓库中完成“来源片段收藏 + 语音思考”从产品验证到 YouTube-first 生产原型的完整任务。

仓库：/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

使用独立 worktree。阅读 docs/research/2026-07-22-source-fragment-voice-capture/README.md、VoiceInput、Vault search/context、generated artifact governance 和外部 bridge 安全规则。浏览并实机核验当前 Readwise Reader、Glasp、YouTube/Obsidian capture 工具以及 Chrome Extension/YouTube API 约束；不要宣称没有竞品。

目标：交付一个 YouTube-first 浏览器扩展 + Peak companion vertical slice。用户选择视频起止区间，按住说出自己的思考，先本地可靠保存，再可选请求私人知识库回应，最后形成可回到原处的用户拥有记录。

先完成目标用户、差异化、失败场景、extension/Peak bridge、数据模型、权限/privacy/threat model 和 visual-first spec，随后实现原型到可实际安装和运行。

必须实现：
- 浏览器扩展：mark start/end、显示区间、push-to-talk、转录预览、编辑、save、sync 状态和 retry；
- extension-local durable outbox，Obsidian 未开启、转录失败或 AI 不可用时不能丢 capture；
- secure local bridge/handshake，把 structured capture 交给 Peak；不能开放任意 Vault path/write endpoint；
- Peak companion：接收、去重、预览并写用户拥有 Markdown，记录 URL、video ID、start/end、capturedAt、用户原话和 provenance；
- 可选“问我的知识库”通过现有 Search/Context/Harness 返回带来源的相关笔记和回应；不复制 AI runtime；
- speech provider 通过现有 media/AI capability adapter，支持取消、错误和无 key 降级；
- 默认不下载视频、不镜像完整 transcript、不抓取用户未选中的内容；
- capture Markdown 是用户真值，bridge/sync/transcription receipts 是 JSONL；
- 浏览器权限最小化，只允许 YouTube 和本地 bridge；所有外部请求可见且可关闭。

新协议直接是 canonical，不实现旧 bookmark importer、通用网页抓取兼容或多个视频网站的半成品。首版只把 YouTube 主路径做完整。

执行 DAG：competitive verification -> product/spec -> extension data/outbox -> segment UI -> voice capture/transcription -> secure bridge -> Peak receiver/materializer -> knowledge response -> restart/offline/security tests -> extension/plugin builds -> real browser + Obsidian QA。

验收覆盖区间错误、刷新页面、浏览器崩溃、Obsidian 关闭、重复发送、麦克风拒绝、转录失败、无 AI key、bridge token 失效、恶意 payload、离线恢复、打开原时间段和删除 capture。没有可安装 Chrome/Obsidian 环境时必须标记 INTERACTION NOT VERIFIED。

运行 extension 和 plugin focused tests/build、npm run audit:boundary、git diff --check。只提交任务文件，英文 commit，报告 SHA、安装步骤、真实端到端证据和未验证项。不要修改 docs/roadmap.html。
```

## Integration Notes

- These prompts deliberately protect `docs/roadmap.html`; update roadmap status only after the owner integrates and verifies the corresponding commit.
- Several tasks eventually require narrow changes to `main.ts`, `AppContext`, `AppRuntimeRegistry`, settings, or `ViewManager`. Keep those composition patches small and isolated so the integration owner can rebase them after active worktrees land.
- A task is not complete merely because its spec, mock, tests, or build exists. Report design, implementation, automated verification, credential-gated verification, and real Obsidian/browser verification separately.
