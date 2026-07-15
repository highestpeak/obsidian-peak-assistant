# Composer Intelligence Sidecar UI Contract

Date: 2026-07-15

## Goal

Composer 右栏不是第二套编辑器，也不是把所有 AI 能力堆成卡片墙。它是一条贴着正文工作的窄 sidecar：共享当前上下文，但用三种不同工作面完成协作改稿、主动关联和事务回放。

## Capability Sources

| Source | Stable product meaning | Sidecar ownership |
| --- | --- | --- |
| `docs/16-feature-document-copilot.html` | Copilot 对当前文档执行解释、改写和工具调用 | Copilot |
| `docs/superpowers/specs/2026-05-16-copilot-command-center-final-ux-flow.md` | 用户留在当前笔记；agent 选择工具；写入前必须可 review | Copilot |
| `docs/14-feature-ambient-push.html` | 唯一主动发现路径；必须可忽略，不能抢占编辑 | Ambient |
| `docs/superpowers/specs/2026-06-02-ambient-push-current-work-state-product-technical-review.html` | Current Work State、Recent Work Trace、Session Thought Trace | Ambient |
| `docs/superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md` | 固定块操作、上下文建议、增量生成与事务边界 | Copilot + History |

## Shared Shell

- 顶部只保留产品名、同步状态和 `Copilot / Ambient / History` 三个 tab。
- 当前上下文压缩成一行：当前对象、名称、类型。切换模式不重复展示上下文卡片。
- 临时状态只在执行动作后短暂展开，不常驻占用高度。
- 背景、边框、圆角、字体和正文使用同一套 restrained token；禁止蓝色整栏底色和多层卡片嵌套。
- 三个 tab 共享上下文与事务数据，但不共享信息架构。
- AI 感来自持续感知、轻量状态变化和结果回到正文，不来自装饰性渐变、整栏底色或功能卡片堆叠。
- 响应式只有两种形态：宽屏稳定右栏；窄屏从右侧滑入的 fixed drawer。侧栏不得进入文档流，也不得出现在正文末尾。

## Copilot / Collaborate

Purpose: conversation to reviewable patch.

- 对话线程占主体，输入框固定在底部。
- 默认自动携带当前块、邻近内容和高置信 Ambient 关联；用户不需要先选择“当前块 / 本节 / 全文”。
- 空状态只给 2-3 个与当前对象有关的 next move，不展示完整功能目录。
- 生成结果必须回到正文原位：文本 diff、真实表格、公式、图像或原生对象草稿。
- 对话里只保留定位与事务摘要；接受、还原和继续编辑发生在正文。

## Ambient

Purpose: infer current work, then surface one timely push.

- 第一层只显示 Current Work State 和一条最高置信 push。
- push 支持预览、加入正文、忽略；低置信候选默认折叠。
- “为什么现在推送”按需展开 Recent Work Trace；不把 trace 永久摊在侧栏。
- Session Thought Trace 保存未安放的判断和想法，不充当 todo list。
- Ambient 不拥有块工具、聊天历史或已接受 patch 的回滚。

## History

Purpose: accepted transaction playback.

- 只记录已接受写入；hover、生成中和已丢弃候选不进入历史。
- 时间线行显示动作、目标和时间；点击后在下方打开纵向 before/after diff。
- 每条事务支持定位正文和回滚。
- Markdown、Base、Canvas、Excalidraw 与附件变更使用同一事务模型。
- 默认保存在 Vault 会话记录；Git 可用时可选择长期保存，不改变 Markdown/native file 的 source-of-truth 地位。

## Visual Grammar

- Radius: 5-8px；只有输入框、主 push 和 diff 面板需要可见容器。
- Section: 用分隔线和留白组织，不用 section card 包 section card。
- Accent: 导航用 quiet violet，成功/关联用 muted teal，风险继续沿用正文的 amber/red。
- Type: 9-13px UI 字号；标题只比正文 UI 高一级，不使用营销式大标题。
- Motion: tab 进入 140ms；执行状态展开 140ms；生成任务使用真实 loading/streaming 时长。

## External Interaction References

- Feishu AI sidebar mode selection: <https://www.feishu.cn/hc/zh-CN/articles/870939081203-v7.69-%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC-ai-%E4%BE%A7%E8%BE%B9%E6%A0%8F%E5%86%8D%E4%BC%98%E5%8C%96-%E4%BA%A4%E4%BA%92%E4%BD%93%E9%AA%8C%E5%8D%87%E7%BA%A7-%E5%8A%9E%E5%85%AC%E4%BA%8B%E5%8D%8A%E5%8A%9F%E5%80%8D>
- Notion Agent current-page context and sidebar/floating chat: <https://www.notion.com/help/notion-agent>
- Notion block actions and cross-block selection: <https://www.notion.com/help/writing-and-editing-basics>

## Mock Coverage

- [x] Shared compact shell and transient status.
- [x] Copilot bottom composer with automatic context and contextual starters.
- [x] Ambient current work state, one primary push, folded related items and folded trace.
- [x] History transaction list, vertical diff, locate and rollback.
- [x] Consistent flat visual grammar across all three modes.
- [x] Desktop right column plus narrow-screen fixed drawer, including close, Escape and overflow checks.

## Production Roadmap

- [ ] Replace static current-work inference with the app-owned Current Work State runtime.
- [ ] Feed Copilot context chips from real Markdown source ranges and Ambient relation IDs.
- [ ] Persist accepted transactions through a shared Composer transaction port.
- [ ] Add document-history and Git adapters behind History without adding more top-level UI.
- [ ] Add keyboard focus order, panel resize, drawer close and screen-reader announcements.
- [ ] Measure interruption cost: push open rate, dismiss rate, patch accept rate and rollback rate.

## Rejected Patterns

- Equal-weight card wall for state, trace, related notes and deep organize.
- Permanent blue-tinted side panel disconnected from the document canvas.
- Scope selector before every Copilot message.
- Ambient suggestions that silently write into Markdown.
- History that records generated text but cannot locate, diff or roll back the real source.
