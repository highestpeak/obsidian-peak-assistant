# Worktree Brief: Chat Retained Refactor

> **怎么用**：把整篇文件复制粘贴到一个新 Claude Code session（或 Conductor worktree session）里作为 first message。所有上下文都在里面，不需要读其他文件。

---

## 任务定位

把 Peak Assistant（Obsidian 插件）的 **Chat 视图主界面**整个重做一遍，对齐 2026-05-29 retained 设计。这是 Design System Unification 4 条流之一，跟另外 3 条（onboarding-settings / dashboard / copilot skin）并行。

**优先级**：最高（merge order 第一个），因为 chat 是日常使用最多的 surface，立刻影响用户体感。

**前置条件已就绪**：PR-0 (Design System Landing) 已 landed on master（commits `a7f0578` → `d3f7d16`，2026-05-30）。本 worktree 必须基于 PR-0 之后的 master。

---

## 源真理（按优先级）

| 文件 | 角色 |
|---|---|
| `docs/gstack/chat-focused-redesign-2026-05-29/retained-designs.md` | 设计 report（语言/原则） |
| `docs/gstack/chat-focused-redesign-2026-05-29/retained-designs.html` | 设计 report 可视化版 |
| `docs/gstack/chat-focused-redesign-2026-05-29/retained/*.png` | 11 张 retained 设计参考截图 |
| `docs/gstack/chat-focused-redesign-2026-05-29/chat-retained-mock.html` + `chat-retained-mock.css` | **可交互 mock（视觉真源）** |
| `docs/gstack/chat-focused-redesign-2026-05-29/chat-retained-mock-preview.png` | mock 全图 |

**已被 supersede（只看背景，不照抄）**：同目录下 `chat-component-v2.css` / `chat-input-message-v3.css` / `chat-interaction-v4.css` / `chat-message-v5.css` 是设计迭代历史草稿，已经被 retained 版本固化下来。它们的 CSS 还残留 mock-only token 名（`--pk-divider/text-strong/text-muted`），是历史快照，**忽略**。

---

## 已锁定的设计决策（不要重谈）

1. **Header**：只含 conversation title + Open source document + Refresh。没有别的 affordance。
2. **Input**：一个 capsule `Chat · Auto model · 0 ctx` 承担 mode/model/role/context 切换。role 只在 popover 内可改，不在主 chrome。
3. **Message 形态**：文档化正文 + meta/action row + 最多 1–2 suggested next + More popover。**不默认展开内联输入框**——只在用户主动激活 follow-up 后才出现。
4. **Conversation Index**：右侧 4 个 tab（All / Topics / Artifacts / Messages）。Topics 是 accordion + position bar + sources/attachments。Artifact 是一等对象（独立 tab + 卡片）。
5. **视觉语言**：light + dark 双模（继承 PR-0 peak-tokens.css），accent 是 production purple `#7c3aed`。

---

## PR-0 已交付的地基（你可以直接用，**不要重复造**）

### 设计 tokens
- `src/styles/peak-tokens.css`：完整的 `--pk-*` 体系（light + dark 双套）
- 新加的：`--pk-radius-pill`, `--pk-shadow-sm/md`, `--pk-prov-{openai/anthropic/google/openrouter/perplexity/ollama}` + `-soft`

### 共享 CSS 原语（`src/styles/peak-components.css`）
10 个原语，全部 `:where(.pktw-root, .peak-design-root)` 作用域：
- `.pk-row` + `__icon/body/title/desc/meta/right/value` + `--compact/--disclosure`
- `.pk-chip` + 7 色调（success/warning/danger/neutral/accent/info/provider）
- `.pk-pill` + `[data-selected]`
- `.pk-icon-btn`
- `.pk-segmented` + `__opt`
- `.pk-modal-overlay/-shell/-shell__head/title/sub/body/footer` + `--narrow/--wide`
- `.pk-popover` + `.pk-pop-item`
- `.pk-form-grid/-row/-label/-control/-input/-select/-textarea/-slider/-number`
- `.pk-disclosure-body`
- `.pk-brand-av` + `--sm` + `[data-provider]` 6 个 provider 自动配色

### React 原语（`src/ui/components/primitives/`）
9 个薄壳，**走这层，不要写新的 shadcn 样式**：
- `<Chip variant provider>` / `<IconButton label>` / `<Pill selected>` / `<Segmented value onValueChange options>`
- `<Popover>` (+ Trigger/Portal/Content/Item)
- `<Modal>` 复合（Modal.Trigger / .Content (width: narrow|default|wide) / .Header / .Title / .Subtitle / .Close / .Body / .Footer）
- `<Row>` 复合（Row.Icon / .Body / .Title / .Desc / .Meta / .Right / .Value）
- `<FormRow>` 复合（.Label / .LabelHint / .Control / .ControlHint / .Input / .Select / .Textarea / .Slider / .Number）+ `<FormGrid>`
- `<BrandAvatar provider letter size>`
- Shared types: `ProviderId` 是 `'openai' | 'anthropic' | 'google' | 'openrouter' | 'perplexity' | 'ollama'`

**导入路径**：`import { Modal, Pill, BrandAvatar, ... } from '@/ui/components/primitives'`

### Capability 适配器层（`src/service/capabilities/`）
你这条 worktree 的**第一等公民交付物之一**：实现 chat 的 `SurfaceCapabilityAdapter` 并在 `main.ts` 注册：
```ts
import { CapabilityRegistry } from '@/service/capabilities';
CapabilityRegistry.getInstance().register({
  surfaceId: 'chat',
  surfaceLabel: 'Chat',
  getCapabilityStatus: async () => [
    {
      capability: 'Conversation',   // 用户面词汇，闭合枚举
      status: hasConversationModel ? 'ready' : 'not-ready',
      reason: hasConversationModel ? undefined : 'No Conversation model selected',
      repair: hasConversationModel ? undefined : {
        label: 'Choose Conversation model',
        action: () => openSettingsToConversationModel(),
      },
    },
  ],
});
```
Settings 页面（onboarding-settings worktree 在做）会消费这个 adapter 渲染 readiness chip。

### Telemetry hooks（`src/service/usage/UsageOutcomeService`）
当用户在 chat message 上点 "Save to vault" 时调：
```ts
UsageOutcomeService.getInstance().recordVaultSave(message_id, session_id, vault_path);
```
其他相关事件：`recordContinuation(prev_id, session_id, next_id)` 当用户 60s 内发下一条 message 时。这给 dashboard 的 MPG 指标供数据。

### Templates 字符串外置
`templates/config/chat.json` 已经是空壳。所有 chat 用户面字符串（按钮 label / placeholder / 错误提示）写进这个 JSON，通过 `TemplateManager.loadJson(ConfigTemplateId.Chat)` 读取。**不要散落在 logic 文件里**。

---

## 当前 chat 实现的位置（要重做的对象）

| 层 | 路径 |
|---|---|
| View 容器 | `src/ui/view/chat-view/` |
| 主组件 | 找 `ChatView.tsx` 或类似 entry |
| 子组件 | `src/ui/view/chat-view/components/`（messages / composer / index / 等） |
| Hooks | `src/ui/view/chat-view/hooks/`（streaming / messages / 等） |
| Service 层 | `src/service/chat/`（ChatOrchestrator / providers / context builders）—— **不动**，这次只重做 UI |
| Stores | `src/ui/store/` 找 chat 相关 zustand store |

**重要原则**：service/chat/ 业务逻辑（ReAct loop / provider 路由 / context building / streaming）**不动**。这次 PR 只重做 UI 层。如果发现 UI 需要 service 改造（比如要暴露新数据），先列出来 review，不要顺手改。

---

## 建议的 PR chain（分批 land，每 PR 独立 review）

| PR | 范围 |
|---|---|
| `PR-Chat-1` | **Shell + header + composer** — 新 chat-view 的最外层框架 + header（title + Open source + Refresh）+ input capsule（run-chip popover）。用 PR-0 的 `<Modal>` / `<Popover>` / `<IconButton>` 等。 |
| `PR-Chat-2` | **Message + suggested next** — message 文档化正文 + meta/action row + suggested next chips + More popover。inline follow-up 输入框激活后才渲染。 |
| `PR-Chat-3` | **Conversation Index 4 tab** — 右侧 panel：All / Topics（accordion + position bar）/ Artifacts（卡片）/ Messages。 |
| `PR-Chat-4` | **Capability adapter + telemetry wiring + chat.json 字符串外置** — register Conversation capability + UsageOutcomeService.recordVaultSave / recordContinuation hooks + 把所有用户面字符串迁到 templates/config/chat.json。 |

---

## 不要做的事

- 不要重写 `src/service/chat/` 的业务逻辑（orchestrator / providers / context building / streaming）
- 不要碰 `src/ui/component/shared-ui/`（旧 shadcn 层，留给其他 surface 渐进迁移）
- 不要新建 `peak-components.css` 之外的 CSS 文件（用 Tailwind utilities + `.pk-*` 类）
- 不要把字符串硬编码在 .tsx —— 走 `templates/config/chat.json`
- 不要在主 chrome 露出内部词汇（`harness` / `quick` / `deep` / `premium` / `agent fast` / `embedding` 等 —— 见 Design System §5 词汇契约）
- 不要碰 onboarding / settings / dashboard / copilot 的代码

---

## 验证

- `npm run build` green
- `npm test` green（注意：项目无 React 组件测试基础设施。如果你想加 jsdom + @testing-library/react，先单独 PR）
- 视觉：在 Obsidian 里打开 plugin，跟 `chat-retained-mock.html` 并排对比 —— 形态、间距、配色、交互都要匹配
- light + dark 主题都要测（Obsidian theme settings 切换）
- Capability adapter 注册后，去 Settings 页面（哪怕是临时的 dev fixture）能看到 "Chat → Conversation → ready/not-ready" 行

---

## 已知开放问题（带到新 session 里再决定）

1. **Conversation Index 的位置**：是右侧固定 panel 还是可折叠抽屉？mock 看上去是固定，但移动端友好性差。
2. **Artifact 一等对象的存储**：怎么把 chat 里产生的 artifact（代码 block / file diff / mermaid 图）持久化？跟 `service/copilot/CopilotRunArtifacts.ts` 共用？
3. **Suggested next chips 的来源**：现在是 LLM 后处理生成？还是 hardcode 模板？mock 里有 1-2 个示例但没说生成机制。
4. **Run chip 的 ctx 数字**：`Chat · Auto model · 0 ctx` 里 `0 ctx` 是什么单位？token count？message count？

---

## 上下游联动

- **依赖**：PR-0 已 landed（master @ `d3f7d16`）
- **被依赖**：onboarding-settings worktree 的 PR-E（per-surface 适配器集成）需要 Chat 的 capability adapter 已注册。Chat 的 PR-Chat-4 必须先 merge。
- **冲突边界**：只动 `src/ui/view/chat-view/` + `src/ui/store/`（chat 相关 store）+ `templates/config/chat.json` + 在 `main.ts` 注册 capability adapter（一行）。不动其他 worktree 的文件。

---

## 开 worktree 命令

如果用 git worktree（不是 Conductor）：

```bash
cd /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant
git worktree add ../../../../../peak-chat -b chat-retained master
cd ../../../../../peak-chat
npm install
npm run dev
```

如果用 Conductor：在 Conductor 里 "New worktree from master"，命名 `chat-retained`。

---

## 完工标准

- 4 个 PR 全部 merge 进 master
- 在 Obsidian 里 chat 视觉跟 retained mock 匹配（light + dark）
- Settings 页面 readiness 表能看到 Chat → Conversation 行
- usage_outcome 表里能看到 vault_save / continuation 事件
- templates/config/chat.json 有完整字符串
- `npm run build` + `npm test` green

完工后在 `docs/progress.md` 追加一段日志（项目惯例）。
