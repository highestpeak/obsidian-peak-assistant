# 04 · Ambient AI UX 实证原稿：从 Clippy 到 Cursor Tab（2026-07-27）

> 调研 agent 原始产出，供 README.md 综合分析引用。

## 1. Clippy 为什么失败（Swartz, Stanford 2003 —— 最常被引用的实证复盘）

- "教科书级的反面案例"：在用户没请求时打断、经常任务完成后才跳出来；无法轻易关闭（excessive presence 本身构成骚扰）；违反"同事"社会规范（未经许可打断），让用户觉得失控；触发基于贝叶斯单词线索而非上下文（诗里打 "Dear…" 也被当写信）；无用户记忆、无法学习。
- 2001/4 微软宣布默认关闭；Office 2007 彻底移除。
- 来源：https://xenon.stanford.edu/~lswartz/paperclip/paperclip.pdf

## 2. Google Smart Compose / Smart Reply

- 每周节省 10-20 亿字符输入；**100ms 内必须响应**否则用户感知延迟——"宁可不显示也不能卡顿"是硬指标。
- 存在"选择性抑制建议"的质量门槛机制，但公开渠道拿不到精确阈值数字（缺口：需读 KDD 2019 论文全文）。
- 来源：https://arxiv.org/abs/1906.00080 ；https://research.google/blog/smart-compose-using-neural-networks-to-help-write-emails/

## 3. GitHub Copilot ghost text + Next Edit Suggestions（NES）

- 采纳率：官方（Accenture 研究）~30%；CACM 2024：27%（按建议数 33% vs 按代码行数 20%——长建议更难被整体接受）；新手采纳率 31.9% > 资深 26.2%；随使用时长上升（前 3 月 28.9% → 第 6 月 34%，信任学习曲线）。
- **NES 设计逻辑**：大部分编码是编辑已有代码而非写新行 → 预测"下一个编辑动作"而非"下一个 token"。呈现刻意低打扰：**gutter 箭头图标提示 + Tab 主动导航过去查看再 Tab 接受——建议在场但不入侵视野**。
- 模型教训：frontier 模型太慢、小模型质量不够 → 必须做低延迟任务专用定制模型。**"主动建议必须快"是硬约束**。
- **A/B 数据（最重要的量化证据）**：November 版本**展示率 -24.5%、采纳率 +26.5%、隐藏率 -25.6%**——"更少但更准"策略带来更好整体体验。
- 来源：https://github.blog/ai-and-ml/github-copilot/evolving-github-copilots-next-edit-suggestions-through-custom-model-training/ ；https://cacmb4.acm.org/magazines/2024/3/280076-measuring-github-copilots-impact-on-productivity/fulltext

## 4. Cursor Tab

- 目标："in-flow **Next Action Prediction**"——与"只在光标处插字"的传统 copilot 划清界限。
- 两段式：光标附近 ghost text + **Cursor Jumps**（接受后预测下一个编辑位置直接跳转，形成 tab-tab-tab 连续流）；跨文件联动用底部 "portal window" 提示而不打断当前文件。
- **延迟是一等 UX 指标**：Fusion 模型 p50 475ms→260ms，上下文 5.5K→13K tokens，难编辑预测准确率 +25%。
- 用户控制：Esc 或继续打字即拒绝；可按文件类型 snooze/禁用。
- 业界共识：Cursor Tab 好在**范式**（预测编辑动作）不在参数。
- 来源：https://cursor.com/blog/tab-update ；https://cursor.com/help/ai-features/tab

## 5. Grammarly——"最不打扰 ambient"的设计原则

- 产品哲学："We can't just be smart—we need to be graceful, welcoming, empathetic, and engaging as well."——打扰度与准确度同权重。
- **色彩编码分层**：红=语法、蓝=清晰度、紫=语气、绿=表达——不点开就能判断建议类别/严重度。
- **三级渐进披露**：下划线（最低打扰信号）→ 点击展开卡片 → 卡片内接受/驳回。
- "blank state" 也被设计——沉默是被设计的状态，不是失败态。
- 来源：https://www.grammarly.com/blog/engineering/what-makes-design-special-at-grammarly/

## 6. 失败/挨骂案例 + 用户关掉 AI 的五大触发点

- **Apple Intelligence Writing Tools**：Proofread **只能全盘接受或拒绝**（无逐条粒度）——纯交互设计失败；Rewrite 质量差（"I would be embarrassed to put those words under my byline"）；Compose 被批 "AI slop"；**重写不保留版本历史**（"one wrong click and your text is gone forever"）。
- **Notion AI**：空行按**空格键**唤起 AI——触发手势与常规输入冲突 → 高误触 → "pretty annoying"。
- **Windows Copilot**："Within weeks, our help desk was flooded with tickets about Copilot"（IT 经理）；调试时插入建议（工程师）；"couldn't figure out how to disable it permanently, and it kept popping up during presentations"。微软被迫反复调整强装策略。
- **五大关闭触发点（跨案例归纳）**：① 触发手势与常规操作冲突高频误触；② 专注/调试/演示等高负荷时刻被打断；③ 建议无法局部接受，只能全有全无；④ 质量长期低于预期失去信任；⑤ 找不到持久关闭开关、更新后复活。
- 来源：https://kirkville.com/apples-ai-writing-tools-are-bad-and-apple-doesnt-care/ ；https://windowsnews.ai/article/microsoft-copilots-aggressive-windows-11-integration-draws-user-backlash-prompting-subtle-changes.413371

## 7. 交互形态打扰度光谱（跨案例拼接，业界无现成权威分类——需自定义）

| 形态 | 代表 | 打扰度 | 适用 |
|---|---|---|---|
| Ghost text 灰字 | Copilot, Smart Compose | 最低（继续打字即覆盖） | 高频、短建议、用户在主输入流中 |
| Gutter 图标 + 主动导航 | Copilot NES, Cursor Jumps | 低（在场不入侵，需主动导航） | 大建议 / 非光标位置的编辑 |
| 下划线 + hover 卡片 | Grammarly | 低-中（三级渐进披露） | 需分类分级的建议 |
| 侧栏卡片 | Workspace 建议 | 中（占空间不阻塞） | 需更多上下文展示 |
| 弹窗/模态 | Notion AI 空格触发 | 高（打断输入流、易误触） | 仅限用户明确请求后的确认 |
| 系统通知/强推 | Windows Copilot | 最高（工单洪水级反弹） | 几乎无正当场景 |

注：NN/g 自己也表示尚无权威打扰等级分类法——**做这个分类需要自己定义，没有现成共识可抄**。

## 8. 语音/移动场景的 proactive

- 系统综述（21 篇研究）：**只有安全攸关/紧急场景能明确证明主动介入有益**，其余场景证据不足。
- "The Proactivity Dilemma"（CUI 2022）：**有用性/适当性/侵入性三维评分框架**可直接借用；多方社交场景中主动行为被认为剥夺 agency。
- 关键结论（Mensch und Computer 2024）：**决定接受度的主要是"情境是否合适"，不是"建议内容好不好"**——同一条建议对时机敏感。
- 语音场景"长度"本身是独立打扰变量（长篇讲解让用户 visibly annoyed）。
- 来源：https://www.sciencedirect.com/science/article/pii/S2451958824000447 ；https://dl.acm.org/doi/10.1145/3543829.3543834 ；https://dl.acm.org/doi/10.1145/3670653.3670672

## 调研缺口（后续深挖）

1. Smart Compose 论文全文的精确置信度阈值机制。
2. 打扰等级分类学无业界共识——需基于本报告实证案例原创。
3. ScienceDirect 系统综述原文被 403 拦截，结论来自摘要，需核实。
4. "Assistance or Disruption?"（CHI 2025, arXiv:2502.18658）与 Peak 场景最贴合，值得单独精读正文量化数据。
