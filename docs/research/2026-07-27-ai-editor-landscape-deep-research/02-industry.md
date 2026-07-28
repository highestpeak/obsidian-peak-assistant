# 02 · 产业界调研原稿：AI 编辑器 / AI 知识工具格局（2026-07-27）

> 调研 agent 原始产出，供 README.md 综合分析引用。

## 1. Cursor Fork VS Code vs 扩展路线 —— 编辑器视图 vs 悬浮层适配的最佳产业类比

**官方/社区给出的理由（直接引语）**

- Cursor 论坛帖 "Why is Cursor not an Extension to VS-Code?" 中 Cursor 团队成员 Jakob 的原话：
  > "VSCode extensions have very limited control over the UI of the editor. Our Command-K and Copilot++ features aren't possible as extensions."
  来源：https://forum.cursor.com/t/why-is-cursor-not-an-extension-to-vs-code/2523

- Eclipse Foundation 的批评性技术分析列出了 VS Code 扩展 API 的 7 项具体限制，导致 Cursor/Windsurf 只能选择 fork：无法定制 chat 面板布局/交互、无法在 File Explorer/Terminal/Debug 等内置视图上叠加 AI overlay、没有跨 workbench 的全量行为观测 API、terminal 输出读取不可靠、缺乏干净的多编辑器状态 API、调试编排要靠"fragile command execution"、多个 AI 扩展间无法保证优先级协调。文章原话："Don't start by forking your competitor's product."（作者是 Eclipse Theia 的支持者，属于竞品倒逼型批评，需带立场折扣）
  来源：https://blogs.eclipse.org/post/thomas-froment/why-cursor-windsurf-and-co-fork-vs-code-shouldnt

- 技术性总结（第三方）：Cursor 的差异化能力——"AI woven into every pane, proactive behavior driven by global context, and ownership over distribution and governance"——都活在扩展 API 允许范围之外。Shadow Workspace（后台隐藏编辑器实例验证代码变更）、内联彩色 diff overlay（而非侧边 diff）都是靠拿到 VS Code 内核直接改造才能做到。
  来源：https://www.lowcode.agency/blog/is-cursor-ai-vs-code-fork ；https://www.mmntm.net/articles/cursor-deep-dive

**Windsurf（原 Codeium）的平行案例**：Codeium 先以扩展形态服务 70 万+ 开发者（2024/8 $1.25B 估值），2024/11 才推出 Windsurf Editor（VS Code fork）——先做扩展验证市场，再主动 fork，理由与 Cursor 相同："the VS Code extension API constrains what AI tools can do with codebase context, multi-file editing, and terminal integration."
来源：https://myengineeringpath.dev/tools/windsurf-ai/

**结果数据**

| 公司 | 关键节点 |
|---|---|
| Cursor（Anysphere） | Seed 2023 $8M → Series D 2025/11 $2.3B/$29.3B 估值；2026/4 传出 $50B 估值新轮（TechCrunch）；2026/5 ARR ~$4B。"从 $1M 到 $500M ARR 史上最快 SaaS"。5万+客户，Fortune 1000 近 70% 覆盖 |
| Windsurf（Codeium） | 2025/7 Google $2.4B 许可费带走 CEO + 核心团队；剩余实体 Cognition ~$250M 收购（$82M ARR）；2025/9 Cognition 估值 $10.2B |
| Zed | 不 fork，Rust + 自研 GPU 渲染从零重写，冷启动 <500ms、按键延迟 <2ms；2026/4 发布 1.0（5 年开发周期）；100% 开源，商业化卖协作与 AI 算力 |

来源：https://techcrunch.com/2026/04/17/sources-cursor-in-talks-to-raise-2b-at-50b-valuation-as-enterprise-growth-surges/ ；https://www.cnbc.com/2025/07/14/cognition-to-buy-ai-startup-windsurf-days-after-google-poached-ceo.html ；https://github.com/zed-industries/zed/discussions/6681

**三条路线的分野**（2026-01 Visual Studio Magazine 对比 Antigravity/Cursor/Windsurf）：三者共同起点都是 fork VS Code + LLM，区别在自主性程度和 UI 归属——Cursor 把 agent 编排拉近编辑器主视图，Windsurf Cascade 让 AI "焊"在编码循环里，Google Antigravity 把 Agent Manager 独立于编辑器外做成"控制室"，编辑器降级为审查界面。
来源：https://visualstudiomagazine.com/articles/2026/01/26/what-a-difference-a-vs-code-fork-makes-antigravity-cursor-and-windsurf-compared.aspx

## 2. OpenAI Canvas / Claude Artifacts / Notion AI —— side-by-side 是否已收敛

**结论：side-by-side 文档+chat 尚未收敛为稳定范式。**

- **OpenAI Canvas**：独立功能存活约 18 个月后被折叠回标准 chat——"Canvas is no longer available in GPT-5.5 Instant or GPT-5.5 Thinking, with writing and coding functionality now supported directly in chat responses through writing blocks and code blocks."
  来源：https://theaicareerlab.com/blog/chatgpt-what-changed-june-2026
- **Claude Artifacts**：2024/6 上线，2025 年中已产生"数亿个 Artifacts"；消费端定位侧边预览面板，不做逐行 diff。2026/6/18 新增 Claude Code Artifacts（Team/Enterprise beta）。真正的 diff/accept 流程在 Claude Code VS Code 扩展里：原文/提案并排对比 + accept/reject + 用户在接受前直接编辑 diff 时 Claude 会被告知"用户已修改"。
  来源：https://support.claude.com/en/articles/9487310 ；https://code.claude.com/docs/en/vs-code
- **Notion AI**：走"tracked changes"路线而非独立 side-canvas——"suggestions are in tracked changes format, so you can accept or reject individually"，明确对标 Google Docs 协同编辑。
  来源：https://skycrumbs.com/blog/notion-ai-2026

**关键含义**：真正稳定收敛的是 **"diff 展示 + accept/reject/编辑后重新提交"这套交互语法**，而不是"side-panel 容器形态"本身。

## 3. NotebookLM 为什么成功 —— source-grounded 约束的产品意义

- 时间线：2022 年中 Google Labs 立项（4-5 人 6 周原型）→ 2023 "Project Tailwind" → 2024 中 GA → 2024/9 Audio Overviews（破圈功能）→ 2025/11 Deep Research。
- 2026 数据：2026/5 单月 252.9M 访问，同比 +289.78%，连续 10 个月增长（Similarweb）；北美 AI 笔记市场份额 28%；52% 回答带内联引用；仅 11% 用户回流传统笔记软件。
- 核心论点："NotebookLM's entire design philosophy is source fidelity—it only answers from what you upload... every response cites a specific passage." **先圈定材料再对话，本质上是把"检索边界"变成产品的信任边界**。"strict 'source-grounding' made it the preferred choice for lawyers and academics who could not risk fabrication."
  来源：https://blog.google/innovation-and-ai/products/developing-notebooklm/ ；https://www.kzsoftworks.com/blog/notebooklm-this-ai-is-grounded-in-your-documents-not-the-whole-internet ；https://worldmetrics.org/notebooklm-statistics/

## 4. 知识工具兴衰案例 —— 共同教训（宽 vs 深）

| 产品 | 现状/教训 |
|---|---|
| **Roam** | Every.to《The Fall of Roam》：双向链接解决的是"组织焦虑（情绪问题）"而非知识管理——用户发现自己很少回顾笔记后，"a garbage dump full of crufty links" 现实浮现；搜索差、迭代慢、移动端缺失变得不可容忍。2026：约 100 万月活的 "legacy powerhouse" |
| **Mem AI** | OpenAI Fund 投资 $23.5M；持续转型（笔记→Mem X→2025/10 "Mem 2.0 AI Thought Partner"），宽度扩张但始终没有沉淀深度护城河 |
| **Logseq DB 重写** | 2022 年底立项 → 2026/7/13 才宣布 beta，接近 4 年。原因：核心重写复杂 + 同时做实时协作 + Clojure 招人受限 + 沟通迟滞。文件版开发自 2024/4 停滞 |
| **Tana** | 仍快速迭代，Slack 社区 21,000+；supertags/live search/语音捕获受好评；学习曲线陡峭，Android 评分仅 3.1/5 |
| **Heptabase** | 216.8K 月活（+28%），种子仅 ~$1.7M 但第一年起现金流为正；卡片+白板可视化受好评；大白板卡顿、待办弱是主要批评。定位"视觉学习者的强推荐"而非全能工具 |

**共同教训**：宽（多功能覆盖）易博眼球难留存；窄而深（单一强隐喻+扎实执行）留存稳但天花板低。Logseq 的教训专门适用于"大重写"：四线作战 = 4 年交付周期。
来源：https://every.to/superorganizers/the-fall-of-roam ；https://www.solanky.dev/p/logseq-migration-journey-challenges-delays-and-hopes ；https://fueler.io/blog/heptabase-usage-revenue-valuation-growth-statistics

## 5. Chat UI 开源生态 —— 2026 年复用格局

| 项目 | 定位 | 数据 |
|---|---|---|
| **assistant-ui** | headless primitives（shadcn/ui + Tailwind 之上，仿 Radix 思路） | 7,900+ stars，npm 月下载 50,000+；LangChain 等采用 |
| **Vercel AI SDK / AI Elements** | AI SDK 是事实标准（月下载 2000 万+）；AI Elements 是 20+ 组件集，与 useChat 深耦合 | "most teams adopt roughly thirty percent of its surface area" |
| **LobeChat** | 最精致的 ChatGPT-like 全套 | 78,625 stars |
| **Open WebUI** | Python+SvelteKit，自托管 Ollama 场景默认答案 | 141,421 stars |

**受限环境结论**：未找到这些库在严格 CSP / 单 bundle（Obsidian CommonJS）环境的成功案例——信息空白，不要假设能直接套用。这些库默认假设 Tailwind + shadcn/ui + Radix 全家桶存在；现实路径是**只借状态管理/流式渲染思路（useChat/streaming reducer 模式），UI 组件层自研**——与 Peak 现状一致。
来源：https://www.assistant-ui.com/ ；https://vercel.com/changelog/introducing-ai-elements

## 6. 皮肤/模板市场什么时候成立

| 生态 | 规模（2026） |
|---|---|
| Obsidian | 6,068+ 社区插件 + 650 官方主题；无官方付费市场，全部免费/捐赠 |
| VS Code | 100,000+ 扩展，主题 8,700 个；榜首主题 1,880 万次安装 |
| Notion 模板市场 | 官方抽成 10%；头部创作者（Thomas Frank）销售额破 $100 万；多数活跃创作者月入 $500-3,000 |

**成立前提**：① 平台先有海量稳定的分发基础设施（市场长在存量用户之上，不是反过来）；② 供给端有可持续创作者经济学（低抽成 + 创作者自带流量）；③ 纯审美"皮肤"类目天然商业化天花板低，真正能变现的是"模板/工作流"类目。
**双边市场失败规律**：流动性问题——买家找不到卖家就流失；死因是过早扩张、先启动错误一侧、平台泄漏、抽成失误。**在自身体量不足以让创作者形成收入预期前铺市场基础设施 = 给没有流动性的两边市场建摩天大楼**。
来源：https://www.obsidianstats.com/ ；https://financialmodelslab.com/blogs/how-much-makes/notion-template ；https://www.raftlabs.com/blog/two-sided-marketplace-failure-rate

## 7. 语音输入 —— superwhisper / Wispr Flow / Voicenotes

| 产品 | 交互模式 | 关键机制 |
|---|---|---|
| **superwhisper** | 系统级快捷键触发，本地/离线优先 | 全离线处理；1-2 秒延迟；$249.99 终身买断；配置丰富但"can add friction" |
| **Wispr Flow** | "always-listening"营销话术，实际是热键触发悬浮层 | 云端 ~700ms；极简深色悬浮层+波形动画；转写后自动清理填充词注入光标；Electron 常驻 ~800MB；$15/月 |
| **Voicenotes** | 录制→转写→AI 自然语言二次编辑 | 修正靠给 AI 下指令而非手动改字；5 分钟以上自动摘要 |

**收敛结论**：**按住说（push-to-talk）在"输入优先"场景被验证最顺**，而非常驻监听。原因是转写质量：常驻模式下引擎必须猜测停顿含义，易"hallucinate 标点"；按住说把边界显式交给用户。测评 21 款听写应用的作者原话："Hold a hotkey, talk, release - your words appear at the cursor, cleaned up by an LLM. That's the fastest way I've found to prompt AI agents." 三款产品触发机制高度趋同（热键唤起一次性录音段），差异在云端 vs 本地、自动清理 vs 二次编辑指令。
来源：https://adamjones.me/blog/best-dictation-apps-2026/ ；https://dictaflow.io/blog/hold-to-talk-dictation.html ；https://willowvoice.com/blog/super-whisper-vs-wispr-flow-comparison-reviews-and-alternatives
