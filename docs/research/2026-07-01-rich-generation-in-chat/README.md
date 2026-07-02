# 富生成能力调研：Chat 内嵌 Excalidraw / drawio / Mermaid / Bases / Dataview

- **日期**：2026-07-01
- **状态**：调研完成，未实施
- **类型**：产品方向调研（学术 + 产业 + 竞品 + 第一性原理）
- **候选功能索引**：见 `docs/index.html` → "潜在功能与调研索引"

## TL;DR

这个方向必要，但边界要划清——不是"chat 什么都能画能渲"，而是**分层押注**：

- **Mermaid、Obsidian Bases** = 必做且低成本，是 2026 及格线和唯一差异化。
- **Excalidraw** = 复用官方 text-to-diagram 管线 + zsviczian 插件桥接，不要自造。
- **Dataview** = 生成而非渲染（LLM 写 DQL，Dataview 插件自己渲染）。
- **drawio** = 高投入低回报，MVP 阶段放弃。

真正的护城河不在"我能画"，而在**"我懂你的 vault，画出来的东西能被你继续在 Obsidian 里编辑"**——用已有的 `SearchClient` + `IndexService` + 语义边做 vault-aware 生成，是竞品短期抄不动的差异化。

---

## 一、第一性原理：为什么"chat 里的富生成"值得做

三个不可动摇的事实：

**1. 图是外部认知的加速器，不是装饰。**
Larkin & Simon 1987 那句老话（"Why a Diagram is (Sometimes) Worth Ten Thousand Words"）在 LLM 时代被重新证实。2025 年 arXiv 的 *Figure It Out: Improve the Frontier of Reasoning with Executable Visual States* 指出：人类推理天然会通过外化到视觉形式来降低认知负载，**图式表征能让模式浮现出来**，而这些模式从文本中很难被发现。这不是审美问题，是认知效率问题。

**2. 生成式 UI 是 2026 年 chat 的默认能力，不是加分项。**
Anthropic 已经把 Generative UI 作为 Claude 的一等公民——不是把可视化放到 Canvas/Artifacts 侧栏，而是**在对话里 inline 生成 HTML/SVG，由 widgetRenderer hook 在沙箱 iframe 里渲染**。核心的技术决策不是"能不能画"，而是模型在推理时的路由："我要回文字、调工具、还是生成一个视觉组件？"。这个能力如果我们的 chat 没有，用户会立刻感到"落后一代"。

**3. Obsidian 用户的心流不是"复制到别处渲染"，而是"渲染即最终产物"。**
Obsidian 的整套哲学是本地文件、可移植、可编辑。用户开 chat 的动机不是要个一次性的对话，而是**把对话产物沉淀进 vault**。这决定了产品形态：生成必须落到 `.md` / `.excalidraw` / `.base` 这些 Obsidian 原生可继续编辑的格式，而不是一张贴在 chat 里的 PNG。

三点合起来的一句话：**"生成的东西要能画，能在 chat 里看，又能一键落到 vault 里被 Obsidian 原生编辑器接管。"** 这就是产品形态的第一性约束。

---

## 二、学术界：可以借用的三条线

| 方向 | 关键论点 | 对我们的启示 |
|---|---|---|
| **Diagrammatic Reasoning**（Larkin/Simon 血脉，2025 *Figure It Out* 复活） | 图不只是表达，是推理媒介 | 让 AI 主动"该画就画"，而不是等用户说"画个图" |
| **External Cognition**（Scaife & Rogers → 2026 *Externalization in LLM Agents* 综述） | Memory / Skills / Protocols 都是外化 | 图是外化的一种，应该被 harness 层统一编排，而非某个 UI 组件的一次性能力 |
| **Multimodal Reasoning**（2025 *Thinking with Visual Abstract*） | 视觉抽象能提升推理准确度 | 生成图不只是给人看，回填给模型再推理是二次红利（未来伏笔） |

三条心法：**该画就画、图属于 harness 一等公民、图会被下一轮推理复用**。

---

## 三、产业界：大厂已经把标准打到什么位置

- **Claude Artifacts / Generative UI**：Mermaid、React、SVG、HTML 均 inline 预览；点 Edit 可改底层代码即时重渲染；支持导出 SVG/PNG 给 Figma/draw.io 二次编辑。这基本定义了 2026 的"及格线"。
- **Excalidraw 官方 text-to-diagram**：2023 年就上线，**自动免 API key**，内部原理是 "LLM → Mermaid → MermaidToExcalidraw 引擎 → Excalidraw JSON"。开源、可自建 `/v1/ai/text-to-diagram/generate` 端点。**我们不需要自己训练文生 Excalidraw 的能力，复用官方管线即可**。
- **Cursor / ShadCN MCP**：通过独立 MCP server，自然语言 → 真实组件，streamed live。说明 **MCP 是外接生成能力的标准通路**，不用把所有生成塞进主 chat。
- **Coding Agent Skills**（coleam00/excalidraw-diagram-skill 等）：Playwright 渲染回环——**agent 看自己的输出、发现布局问题、闭环修正**。这是"生成质量"的下一个战场。

---

## 四、Obsidian 竞品盘点（决定差异化在哪）

| 插件 | 做了什么 | 缺口 |
|---|---|---|
| **Copilot（logancyang）** | Chat 支持渲染 Mermaid 代码块；项目模式；v4 接 Claude Code/opencode/Codex 做 agent | 无 Excalidraw 生成；无 Bases 感知；无 Dataview 生成 |
| **Smart Composer（glowingjade）** | Vault-aware chat、语义搜索、一键 apply edits | 无原生 diagram 生成管线 |
| **Infio Copilot** | Cursor 风格 autocomplete + 选段 chat | 偏 inline 编辑，弱可视化 |
| **Mermaid Flow / Draw a Mermaid** | 可视化拖拽建 Mermaid，AI 起草 | 单一格式；非 chat 主入口 |
| **Excalidraw plugin（zsviczian）+ ExcaliAI script** | vault 内 Excalidraw + 官方 text-to-diagram | 独立于 chat，不感知对话上下文 |
| **axtonliu/axton-obsidian-visual-skills** | Canvas/Excalidraw/Mermaid 从文本生成，用 Claude Code | 是 skill pack 不是插件内 chat 能力 |

**明确的市场缺口：** 没有一个 Obsidian AI chat 插件把 **"多格式富生成 + vault-aware + Bases/Dataview 感知 + agent 闭环"** 全部做齐。我们已有 provider 抽象、agent loop、template/prompt 体系、SearchClient/IndexService，**上层再套富生成完全站得住**。

---

## 五、Obsidian 原生格式的机会分层（核心决策）

分层不是按"能不能做"，而是按 **ROI × 心流贯通度**：

### 第一档 — 必做，低成本高回报

**Mermaid**
- 纯文本，Obsidian 原生渲染，零依赖
- Claude/GPT/Gemini 生成质量已经足够好
- 心流：chat 里直接渲染 + "插入到笔记" 按钮即可
- **投入：小（1–2 周）** | **回报：大**

**Obsidian Bases**（1.9+ 核心功能）
- Bases 是 YAML，LLM 生成天然擅长
- 竞品几乎无人做（2026 才成核心特性）
- 用户体感极强："帮我从这批 note 生成一个看板" → 直接得到 `.base` 文件
- **投入：中（需要 Bases schema 稳定性研究）** | **回报：极大，唯一差异化**

### 第二档 — 复用生态，不自造

**Excalidraw**
- **不要自己训文生 Excalidraw**。走 "LLM → Mermaid → Excalidraw 官方 MermaidToExcalidraw 引擎" 的既定管线，或者直接生成 `.excalidraw` JSON 交给 zsviczian 的插件接管
- chat 里预览 SVG，"打开" 跳转到 Excalidraw plugin 编辑
- **投入：小（桥接） | 回报：中，但差异化不强（ExcaliAI 已有）**

**Dataview**
- **是"生成"而非"渲染"**：LLM 写 DQL 查询，插入到笔记，由 Dataview 插件自己渲染
- 我们只需要提供 schema hint（vault 里有哪些字段）+ chat 上下文
- **投入：小 | 回报：中（实用工具属性）**

### 第三档 — 高投入低回报，建议放弃或最后做

**drawio**
- Schema 极复杂，LLM 生成质量差、需要大量 fewshot
- Obsidian 用户群里 drawio 使用率远低于 Excalidraw
- 已有 diagrams.net 插件，我们的边际价值有限
- **建议：MVP 阶段不做**

---

## 六、产品形态的四种选择（推荐 C）

| 形态 | 描述 | 心流 | 缺点 |
|---|---|---|---|
| **A. 纯代码块** | LLM 输出 markdown，mermaid 代码块由 Obsidian 渲染 | 弱，用户要复制/切窗 | 现状，不够 |
| **B. Chat 内直接渲染** | mermaid/svg 直接在 chat 消息里渲染 | 中，视觉即时反馈 | 无编辑回环，像"死图" |
| **C. Chat 渲染 + 一键落地 + handoff 原生编辑器** ⭐ | chat 内 preview，右上角"编辑"打开 Excalidraw/Bases 原生视图，"插入笔记"落地 `.md` | **强**，预览即决策、落地即产物、编辑用最强工具 | 需要跨插件桥接 |
| **D. Artifact 侧栏（仿 Claude）** | 独立 side panel 类似 Artifacts | 强但抢占 Obsidian workspace | 与 Obsidian 多面板哲学冲突，占屏幕 |

**推荐 C。** 理由：Obsidian 用户的 mental model 就是"最终产物是笔记/canvas 文件"，chat 只是路径。**我们不需要重造 Excalidraw 编辑器，我们要做的是让 chat 变成 vault 各种原生格式的"生成入口"**。

---

## 七、用户心流分析（容易翻车的三个点）

1. **等待期心流断裂**：mermaid 生成 15 秒，期间白屏——**必须流式**（streaming partial diagram）。Vercel AI SDK 已支持，我们的技术栈天然能做。
2. **生成失败的降级**：mermaid 语法错误率不低。**要有 self-repair 闭环**——把渲染错误回喂给 LLM 重试一次（参照 coleam00 的 Playwright 闭环思路，我们可以用轻量版 mermaid parser 报错）。这一步做不做，决定用户第二天还打不打开 chat。
3. **"图属于哪里"的模糊**：图在 chat 里 = 一次性；图落地成文件 = 资产。**必须明确、显眼、一键**，不要藏在下拉菜单里。

---

## 八、必要性判断 & 建议路线

**必要性：高。** 不做的话，3–6 个月内我们的 chat 相对 Copilot v4 会显得"只会说话不会画"，而 Bases/Dataview 生成的空窗期一旦被别人补齐，我们就失去了唯一能在 Obsidian AI 插件里叫得响的差异化叙事。

### 建议路线（决策排序，非实施承诺）

1. **Wave 1（1–2 周）**：Chat 内 Mermaid 流式渲染 + 语法错误 self-repair + "插入笔记"。这是及格线。
2. **Wave 2（2–3 周）**：Bases 生成——vault schema 感知 + `.base` YAML 生成 + 一键落地。**这是差异化叙事**。
3. **Wave 3（1–2 周）**：Dataview DQL 生成（纯文本插入，零渲染成本）。
4. **Wave 4（2–3 周）**：Excalidraw 桥接——走 Mermaid → 官方转换管线，handoff 给 zsviczian 插件。
5. **不做**：drawio 富生成（等有明确用户需求再评估）。
6. **未来伏笔**：图的"回喂"——渲染出的 SVG 让下一轮 agent 看图再推理（参照 *Thinking with Visual Abstract*）。

### 独有的护城河

已有的 `SearchClient` + `IndexService` + 语义边 → 让"生成 Base / Excalidraw / Mermaid"是**基于 vault 语义结构**的，而不是凭空文生图。竞品最多能"文生图"，我们能做"vault 生图"。这是唯一值得押注的差异化。

---

## Sources

- [Excalidraw text-to-diagram release announcement](https://x.com/excalidraw/status/1729163853546868802)
- [Excalidraw Open Sources Its Text-to-Diagram Feature (Medium)](https://medium.com/@venn5708/excalidraw-open-sources-its-text-to-diagram-feature-3810169df601)
- [coleam00/excalidraw-diagram-skill (Playwright render-loop skill)](https://github.com/coleam00/excalidraw-diagram-skill)
- [axtonliu/axton-obsidian-visual-skills (Canvas/Excalidraw/Mermaid pack)](https://github.com/axtonliu/axton-obsidian-visual-skills)
- [Excalidraw plugin ExcaliAI script](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/ea-scripts/ExcaliAI.md)
- [Mermaid Flow – Obsidian Plugin](https://community.obsidian.md/plugins/mermaid-flow)
- [Draw a Mermaid – Obsidian Plugin](https://community.obsidian.md/plugins/draw-a-mermaid)
- [Smart Composer plugin](https://github.com/glowingjade/obsidian-smart-composer)
- [Copilot plugin (community listing)](https://community.obsidian.md/plugins/copilot)
- [Infio Copilot](https://www.obsidianstats.com/plugins/infio-copilot)
- [Awesome Obsidian AI Tools](https://github.com/danielrosehill/awesome-obsidian-ai-tools)
- [Best Obsidian AI Plugins in 2026 (Systemsculpt)](https://systemsculpt.com/blog/best-obsidian-ai-plugins-2026)
- [How I Turned 20,000 Notes Into Live Dashboards With Obsidian Bases](https://www.dsebastien.net/how-i-turned-20-000-notes-into-live-dashboards-with-obsidian-bases/)
- [How to Migrate to Obsidian Bases from Dataview](https://practicalpkm.com/moving-to-obsidian-bases-from-dataview/)
- [What Is Claude's Generative UI Feature (MindStudio)](https://www.mindstudio.ai/blog/what-is-claude-generative-ui-vs-canvas-artifacts)
- [Claude Custom visuals in chat (help center)](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork)
- [Claude Artifacts Review 2026](https://www.buildfastwithai.com/ai-tools/claude-artifacts)
- [Figure It Out: Improve the Frontier of Reasoning with Executable Visual States (arXiv)](https://arxiv.org/pdf/2512.24297)
- [Externalization in LLM Agents: A Unified Review (arXiv)](https://arxiv.org/html/2604.08224v1)
- [Thinking with Visual Abstract (arXiv)](https://arxiv.org/pdf/2505.20164)
