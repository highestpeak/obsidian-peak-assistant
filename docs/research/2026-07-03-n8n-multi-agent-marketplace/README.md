# n8n / Multi-agent / Marketplace — 2026-07-03

## 一句话结论

**Peak 不做 n8n 复刻，不做 SaaS marketplace，不做通用 multi-agent 编排器。原因：这些是通用 workflow tool 的地盘（n8n / Zapier / LangGraph / CrewAI），Peak 的差异化是<em>vault-aware</em>，不是<em>通用编排</em>。推荐：把 R10 IFTTT/Workflow Agent 做扎实，marketplace 只做 workflow template 分发（复用 R8 分发协议），multi-agent 只做"Peak 内部多 harness 协同"，不对外通用。**

## 逐项判断

### n8n 集成

- **形态**：Peak 作为 n8n node 出现，允许 n8n workflow 调 Peak capability。
- **判断**：低价值。n8n 用户已经有自己的 workflow tool；他们不会为了用 Peak 而重写。Peak 用户里几乎不重合 n8n 用户。
- **决策**：**放弃**。可以将来做一个"Peak MCP server"让 n8n / Claude Desktop 通过 MCP 调 Peak，就够了。

### Multi-agent 通用编排

- **形态**：类似 CrewAI，用户定义多个 agent 角色（researcher / writer / reviewer），编排它们协作。
- **判断**：通用 multi-agent 是 LangGraph / CrewAI / Autogen 的方向；Peak 的场景是 "vault + agent"，multi-agent 只需要"多 harness sub-agent"就够，不用暴露 orchestration DSL。
- **决策**：**放弃通用**。保留：`SubAgentDispatcher` (已 landed) 支持 harness 里递归子任务，用户看不到。

### Marketplace (SaaS)

- **形态**：peak-marketplace.com 类似网站，用户发布 template / workflow / agent。
- **判断**：需要商业化才能 self-sustain。当前用户量不足。
- **决策**：**只做 GitHub-based 分发**（见 R8 / R10）。不建 SaaS。

### AI agents (通用)

- **形态**：Peak 里可以定义 "长期驻留" agent（后台 24/7 跑，处理 email / 排期）。
- **判断**：需要 always-on infrastructure，Peak 是 Obsidian plugin，Obsidian 关闭时 plugin 也关。这个场景不适合 plugin form-factor。
- **决策**：**放弃**。等 Peak 有 desktop app / server 版再考虑。

## Peak 的差异化重申

- **Vault-aware**：所有能力都依赖用户 vault 里的实际笔记
- **Local-first**：数据留在本地
- **Obsidian-native**：作为 plugin 存在，尊重 Obsidian 生态

**不做**：通用 SaaS / 通用 workflow / 通用 multi-agent。

## 决策

- **必要性**：**低**。
- **优先级**：不排。R10 (IFTTT/Workflow) 落地后重新评估。
- **依赖**：R10.

## Next steps

1. 无。等 R10 用户反馈判断是否需要更强 orchestration。
2. 若确实需要 → 走 MCP server 出口，让别的 workflow tool 调 Peak。
