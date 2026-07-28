# AI 编辑器 / AI 知识工具：学术界 + 产业界 + 生态深度调研与第一性原理综合

> 2026-07-27。四路并行调研（学术 HCI 文献 / 产业案例 / Obsidian 生态 / ambient AI UX 实证）+ 综合分析。原稿：[01-academia.md](./01-academia.md)、[02-industry.md](./02-industry.md)、[03-obsidian-ecosystem.md](./03-obsidian-ecosystem.md)、[04-ambient-ux.md](./04-ambient-ux.md)。姊妹篇：[2026-07-27-capability-walkthrough-ecosystem-strategy](../2026-07-27-capability-walkthrough-ecosystem-strategy/README.md)（策略评估，先于本调研完成）。

## 〇、一句话结论

**Peak 的四个核心决策（自建编辑器视图 / 复用而非重写 chat UI / 共享内核 / 不做 DQL 兼容）全部被证据确认；唯一需要大修的是 ambient push 的设计前提——学术与产业证据一致指向"时机比内容重要、脚手架比成品重要、更少但更准"。此外证据强烈建议一项新架构约束：六能力必须做成"6 个可独立关闭的窄插件共享内核"，而不是一个大块——这是 Make.md 与 Excalidraw 命运分野的根本原因。**

## 一、第一性原理（从证据反推的七条公理）

1. **知识工具的价值 = 用户留存的理解，不是产出的文字量。** PACM HCI 2025 "AI Assistance Dilemma"：全自动 AI 笔记让用户最省力也最喜欢，但学习/理解得分**最低**；中度辅助（AI 给原材料、用户自己组织）得分最高。产品目标应定为"帮用户思考"，不是"替用户写"。
2. **注意力是唯一稀缺资源，但零打断不是答案。** 被打断后用户往往 10-15 分钟回不到原任务（Iqbal & Horvitz 2007）；但一味压制通知会诱发代价更高的自我中断（CHB 2016）。设计杠杆是**时机与质量**，不是推/拉二元选择。
3. **Ownership 是留存的前提。** AI Ghostwriter Effect（TOCHI 2024）：用户私下不认 AI 文本是自己的，公开又不声明——恢复 ownership 的唯一杠杆是**用户对文本的可见塑造**，个性化 AI 输出没用。CoAuthor：72.3% 采纳率下最终文本仍 72.6% 是用户自己写的——**AI 的真实贡献是播种思路，不是产出成品**。
4. **信任是复利资产。** 66,329 条工业日志（PACM SE 2025）：采纳率由该用户的历史采纳率中介，不纯是建议质量的函数。冷启动必须先推小而准的建议养信任比率。
5. **编辑器所有权决定 AI 体验上限。** Cursor 团队原话："VSCode extensions have very limited control over the UI. Our Command-K and Copilot++ features aren't possible as extensions."Codeium 以扩展形态做到 70 万用户后仍然选择 fork。结果：Cursor $29.3B 估值、ARR ~$4B。
6. **搜索与浏览互补，不是替代层级。** Barreau & Nardi 经典发现：位置携带搜索没有的"提醒（reminding）"功能；Pirolli & Card：只返回答案的搜索只服务觅食环，对 sensemaking 环（把信息炼成结构）毫无贡献。
7. **平台会吞噬宽功能，只有"窄而深 + 数据一等公民"能长存。** Obsidian Bases 正在吞 Dataview/Kanban 的领地（Kanban view for Bases 进行中、Calendar 已计划）；生态揭示偏好一致奖励 Excalidraw 模式（单域深耕 + markdown 一等公民）、惩罚 Make.md 模式（跨域接管 + 90% CPU + 用户公开要求拆包）。

## 二、对 Peak 既有决策的裁决表

| 决策 | 裁决 | 关键证据 |
|---|---|---|
| 自建编辑器视图（Composer） | ✅ **强确认** | Cursor/Windsurf fork 理由原话；Wordcraft（文档内交互同时提升产出与轻松感）；Kanban/Excalidraw 的 ItemView-over-markdown 先例成熟 |
| ——附加硬约束 | ⚠️ | ① **byte-level round-trip**：Kanban for Professionals 把"round-trip 后报告字节级 diff 的 validator"当硬要求，Peak 应照抄这个标准；② 插件禁用后文件必须在纯文本工具里仍可用（Excalidraw 纪律）；③ 若混用 Obsidian 的 CM6：必须复用其同一份类实例，import 另一份 CM6 会**静默破坏注册**（官方 dev docs + 论坛证实） |
| Chat UI 复用而非重写 | ✅ 确认现路线 | 调研未找到任何 assistant-ui / AI Elements 在严格 CSP + 单 bundle 环境的成功案例（信息空白＝风险）；这些库假设 Tailwind+shadcn+Radix 全家桶。结论："只借状态管理/流式渲染思路，UI 组件层自研"——**正是 Peak 现状** |
| 不做 DQL 兼容、走 Peak Sheet | ✅ 强确认 | Dataview 4.64M 下载 vs 同作者继任 Datacore 303K（beta 拖数年）——存量撼不动；Bases 正面吞并中且已有 **Bases API**——Peak 应考虑**消费 Bases API** 而不是与之竞争视图 |
| 皮肤社区市场不做 | ✅ 确认 | 双边市场流动性规律 + 纯审美类目变现天花板低（VS Code/Obsidian 主题全免费传统；能变现的是 Notion"模板/工作流"类目）+ Obsidian 官方主题零货币化的克制先例 |
| Terminal 集成（claude code/codex） | ✅ 窗口仍开 | 品类正在碎片化（Claudian / Claude Code IDE / deivid11 等多个竞争者），无整合赢家；**Obsidian 官方 Skills 押 Claude**（CEO 亲自发布，明确官方 AI 伙伴）——顺风。注意 mobile 3.1/5 评分与 30% 插件无移动实现——desktop-only 定位无需愧疚 |
| 语音输入形态 | ✅ 直接定案 | 产业收敛于 **push-to-talk**（按住热键→说→松开→LLM 清理后注入光标）；常驻监听导致标点幻觉与边界猜测。VoiceInput kernel 照此形态设计 |
| Ambient push | ❗ **大修设计前提** | 见第三节设计宪法 |

## 三、Ambient Push 设计宪法（八条，全部有证据锚点）

Composer 的 ambient push 是学术分类学（CHI 2024 design space）明确标记的高风险分支（system-initiated → initiative transfer → 侵蚀 authorship）。但证据不支持"砍掉"，支持"按以下约束做"：

1. **只在任务边界推。** 段落完成、保存、idle 后回归——不在句中、不在打字流中。（Iqbal & Horvitz：breakpoint 打断的恢复延迟/挫败/错误显著更低）
2. **推脚手架，不推成品。** 推"提示/片段/问题/连接"（用户仍需补完或编辑），不推可整段接受的成品文字。（AI Assistance Dilemma：全自动产出伤害理解；CoAuthor：AI 价值在播种；Ghostwriter：显式编辑恢复 ownership）
3. **更少但更准。** Copilot NES 的 A/B 铁证：展示率 -24.5% 同时采纳率 +26.5%。宁可沉默——Grammarly 连 blank state 都是被设计的状态。
4. **每次推送带"为什么是现在"。** Codellaborator（CHI 2025）：presence 指示器 + 交互上下文让打断感显著下降、信任上升。裸建议就是 Clippy。
5. **区分加速/探索双模态。** Grounded Copilot：用户知道要做什么时只接受小而快验证的建议；不确定方向时才欢迎大建议。单一推送粒度对两种模式都错。
6. **冷启动先养信任。** 前 N 次只推高可读、一眼可验证的建议（采纳率由历史信任中介，冷启动用户系统性偏低）。
7. **逐条粒度 + 可撤销 + 持久关闭。** 用户关掉 AI 的五大触发点：误触、专注时打断、无法局部接受（Apple Proofread 只能全盘）、低质失信、关不掉/复活（Windows Copilot）。五个都必须防。触发手势不得与常规输入冲突（Notion 空格键教训）。
8. **交互形态选低打扰两档：gutter 徽标 + 主动导航（NES/Cursor Jumps 模式）或下划线 + hover 三级渐进披露（Grammarly 模式）。** 这与既有"块级 hover 三条硬偏好"（浮层不遮正文/徽标同侧/双态菜单）完全同构——偏好被产业实证反向验证。弹窗只用于用户明确请求后的确认。

度量上：**不要用采纳率当北极星**（CoAuthor：接受后大改是成功不是失败）——跟踪"编辑后留存率"与关闭率。

## 四、新增架构建议：六能力 = "6 个窄插件共享内核"

Make.md 与 Excalidraw 的命运分野证明：**"大"不是罪，"跨域且不可拆"才是**。Peak 的六能力天然跨域（搜索/分析/写作/导航/对话/设置），防御方式：

- **每个能力独立可开关**，关掉后零资源占用（Make.md 的 90% CPU 抱怨源于缓存进程不可关）；
- 共享内核（VoiceInput / ResultList / Transcript + 索引/存储）作为底座，能力像窄插件一样挂在上面——用户视角"我装了一个搜索插件顺便能开写作模式"，而不是"我装了一个接管一切的巨物"；
- 对外叙事也照此：逐能力介绍，不打"all-in-one"旗号（生态揭示偏好惩罚这个词）；
- 呼应 Obsidian 官方哲学：Skills "short, focused, and composable——each one does a single thing well"。

另一条结构性机会（第三方分析指出的生态空白）：**没有任何 Obsidian AI 插件有"带 review queue 的 agent/automation 层"**——Peak 的 RunEnvelope/trace 基建离这个空白最近。

## 五、"Smooth" 的量化方案（两层）

1. **持续遥测层**：在交互日志上标注摩擦微信号——waiting / retrying / error / 重复搜索 / 放弃——每次真实 session 自动累积，汇成逐能力摩擦分。
2. **周期评测层**：走查时用 Raw NASA-TLX（认知负荷）+ SUS 对比逐旅程；设计期用 KLM 数按键+心智步骤对比候选交互（如 "gutter 徽标→Tab 查看→Tab 接受" vs "侧栏卡片→点击→粘贴"）；ambient push 上线后用 ESM 微问卷（心流破坏的记忆衰减快，事后问不准）。

## 六、后续深挖清单

- 精读 "Assistance or Disruption?"（CHI 2025, arXiv:2502.18658）正文量化数据——与 ambient push 场景最贴合的一篇。
- Smart Compose（KDD 2019）全文的置信度阈值机制——"宁可不显示"的工程实现。
- Bases API 能力边界——Peak Sheet 是否可以直接消费 Bases API 做视图层。
- 打扰等级分类法业界无共识——Peak 可基于 04 号原稿的光谱表自定义一份并写进 conventions。
