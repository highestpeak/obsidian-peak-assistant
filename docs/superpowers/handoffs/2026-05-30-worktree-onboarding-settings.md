# Worktree Brief: Onboarding + Settings Refactor

> **怎么用**：把整篇文件复制粘贴到一个新 Claude Code session（或 Conductor worktree session）里作为 first message。所有上下文都在里面，不需要读其他文件。

---

## 任务定位

把 Peak Assistant（Obsidian 插件）的 **Onboarding 向导（7 步）+ Settings 主面板**重做。这是 Design System Unification 4 条流之一，跟 chat / dashboard / copilot skin 并行。

**优先级**：第三批合并（前面两个：chat → dashboard）。原因：onboarding/settings 的最后一个 PR（PR-E per-surface readiness 适配集成）需要等其他 surface 都暴露了 `SurfaceCapabilityAdapter`。

**前置条件已就绪**：PR-0 (Design System Landing) 已 landed on master（commits `a7f0578` → `d3f7d16`，2026-05-30）。基于 PR-0 之后的 master。

---

## 源真理（按优先级）

| 文件 | 角色 |
|---|---|
| `docs/superpowers/specs/2026-05-29-onboarding-design-brief.md` | Onboarding 设计 spec（7 步 wizard + 词汇契约 + readiness 模型 + 11 个开放问题已在 §11 拍板） |
| `docs/superpowers/specs/2026-05-29-settings-interface-design.md` | Settings IA + 5 tab 设计 spec |
| `docs/superpowers/plans/2026-05-29-onboarding-settings-unification.md` | 旧 5-PR 计划（PR-A 状态机 / B 字符串外置 / C 视觉 / D Settings IA / E per-surface），**仍然有效**——本 worktree 就是落地它 |
| `docs/gstack/onboarding-redesign-2026-05-29/index.html` + `mock.css` + `mock.js` | Onboarding mock（7 步 + 各种 modal） |
| `docs/gstack/settings-redesign-2026-05-29/index.html` + `mock.css` + `mock.js` | Settings mock（5 tab + 18 modal + 全交互） |

**已被 supersede（只看背景思想）**：`docs/superpowers/specs/2026-05-26-settings-mental-model-redesign.md`——旧 settings spec，词汇/IA 已被 2026-05-29 版本覆盖。

---

## 已锁定的设计决策（不要重谈）

### 1. Settings IA：5 tab
Overview / AI Setup / Knowledge Index / Tools / Advanced（最后一个仅暴露 `Agent runtime / harness` 这类底层概念）。

### 2. Onboarding：7 步 wizard
（spec §3）：Welcome → Provider chooser → AI behavior → Index readiness → Capabilities → Progress → Ready launchpad。每步对应 mock 里的一个 HTML 片段。

### 3. Readiness 三态 + Optional
`ready`（绿）/ `needs-attention`（黄）/ `not-ready`（红）/ `optional`（中性）。每个红黄必有 repair CTA。这个模型在 Overview / AI Setup / Knowledge Index / Tools 都用。

### 4. 用户面词汇契约（不可破）
| 内部 | 用户看到 |
|---|---|
| Profile | Provider |
| Chat slot | Conversation |
| Agent Fast / quick tier | Fast Lookup |
| Agent / deep tier | Research |
| Premium / online tier | Use stronger model when needed |
| Embedding | Knowledge Index |
| Web Search slot | Web Access |
| MCP Servers | External tools |
| Agent Harness | Agent runtime（**仅** Advanced 页可出现 "Harness" 字眼） |
| Permission mode | Safety |

`Harness` / `Quick` / `Deep` / `Premium` / `Agent Fast` / `MCP Servers` / `Embedding` / `local-fast` / `local-deep` / `online tier` 在主 chrome（onboarding + Overview/AI Setup/Knowledge Index/Tools tab）**零出现**。

### 5. Row 解剖（共用 settings + onboarding）
`[icon] [title + 一句话 desc + 可选 Used by 芯片] [readiness chip] [当前值] [主操作]`
单列布局，最大宽 860px。卡片只用于：preset 选择 / Provider 行 / action launchpad。**不嵌套卡片**。

### 6. 选中态
solid `--pk-accent-soft` + 3px 左 accent border + Check icon。**禁止** `bg-[--x]/10` 这种 opacity utility。

---

## PR-0 已交付的地基（你可以直接用，**不要重复造**）

### 设计 tokens
- `src/styles/peak-tokens.css`：完整 `--pk-*` 体系 light + dark。
- 包括：`--pk-radius-pill`, `--pk-shadow-sm/md`, `--pk-prov-{6 providers}` + `-soft`。

### 共享 CSS 原语（`src/styles/peak-components.css`）
10 个原语，`:where(.pktw-root, .peak-design-root)` 作用域。**onboarding + settings 是这层原语的最大客户**——基本上每个 row 都是 `.pk-row`，每个 chip 都是 `.pk-chip`，每个 modal 都是 `.pk-modal-*`，每个 form 都是 `.pk-form-row`：
- `.pk-row` + `__icon/body/title/desc/meta/right/value` + `--compact/--disclosure`
- `.pk-chip` + 7 色调
- `.pk-pill` + `[data-selected]`
- `.pk-icon-btn`
- `.pk-segmented` + `__opt`
- `.pk-modal-overlay/-shell/-head/title/sub/body/footer` + `--narrow/--wide`
- `.pk-popover` + `.pk-pop-item`
- `.pk-form-grid/-row/-label/-control/-input/-select/-textarea/-slider/-number`
- `.pk-disclosure-body`
- `.pk-brand-av` + `--sm` + `[data-provider]`

### React 原语（`src/ui/components/primitives/`）
9 个薄壳。导入：`import { Row, FormRow, Chip, Modal, Segmented, BrandAvatar, ... } from '@/ui/components/primitives'`

复合组件用法示例：
```tsx
<Row disclosure>
  <Row.Icon><KeyIcon /></Row.Icon>
  <Row.Body>
    <Row.Title>OpenAI</Row.Title>
    <Row.Desc>API key configured</Row.Desc>
  </Row.Body>
  <Row.Right>
    <Chip variant="success">Ready</Chip>
  </Row.Right>
</Row>
```

```tsx
<Modal open={open} onOpenChange={setOpen}>
  <Modal.Content width="wide">
    <Modal.Header>
      <div>
        <Modal.Title>Add Provider</Modal.Title>
        <Modal.Subtitle>Pick a vendor to connect</Modal.Subtitle>
      </div>
      <Modal.Close />
    </Modal.Header>
    <Modal.Body>
      <FormGrid>
        <FormRow>
          <FormRow.Label>API key</FormRow.Label>
          <FormRow.Control>
            <FormRow.Input type="password" />
          </FormRow.Control>
        </FormRow>
      </FormGrid>
    </Modal.Body>
    <Modal.Footer>
      <Pill>Cancel</Pill>
      <Pill selected>Save</Pill>
    </Modal.Footer>
  </Modal.Content>
</Modal>
```

### Capability 适配器层（`src/service/capabilities/`）
**这是 Settings PR-E 的核心消费层**：
- Settings 的 readiness 表通过 `CapabilityRegistry.getInstance().getAll()` 拿到所有注册的 surface adapter
- 每个 adapter 报自己的 `CapabilityStatus[]`
- Settings 渲染成 row（用 `.pk-row` + `.pk-chip`）

Settings 不知道 chat / search / copilot 的细节，只依赖 `SurfaceCapability` interface。

### Telemetry hooks（`src/service/usage/UsageOutcomeService`）
onboarding 完成时可以记录一次 `recordEvent({ event_type: 'continuation' })` 表示成功完成 —— 但**不是必需**，主要事件来自 chat / copilot 等 surface。

### Templates 字符串外置
- `templates/config/onboarding.json`（空壳，你填）
- `templates/config/settings.json`（空壳，你填）

所有 onboarding 用户面字符串（步骤标题、按钮 label、placeholder、错误提示、capability label、repair CTA 文案）写进这两个 JSON。

### Curator backend（已存在，**不动**）
之前已经实现了：
- `src/service/agents/curator/CuratorAgent.ts` —— provider 推荐
- `templates/config/curator-catalog.json` —— 22 model 元数据
- `src/ui/view/modals/HarnessOnboardingModal.tsx` —— 现有 wizard UI（要被你重做替换）

Curator 后端逻辑保留；你只重做 wizard 的 UI 层 + IA + 词汇。

---

## 现有 settings/onboarding 代码位置

| 层 | 路径 |
|---|---|
| Settings tab（Obsidian 原生设置面板） | `src/app/settings/SettingsTab.ts` + `src/ui/view/settings/` |
| Onboarding wizard 现有实现 | `src/ui/view/modals/HarnessOnboardingModal.tsx`（要被你重做） |
| Curator backend | `src/service/agents/curator/` —— **不动** |
| HarnessSettings 数据 | `src/service/harness/HarnessSettings.ts` —— wizard 写入这里 |

---

## 5-PR Chain（旧 plan 仍有效）

| PR | 范围 |
|---|---|
| `PR-A` | **Wizard 状态机合并** —— 把现有 HarnessOnboardingModal 的 state machine 抽出来跟新 7 步契约对齐。Curator 调用不变。 |
| `PR-B` | **字符串外置** —— 所有 onboarding 用户面字符串迁到 `templates/config/onboarding.json`；settings 字符串迁到 `templates/config/settings.json`。词汇按上面契约 rename。 |
| `PR-C` | **视觉重写** —— 重做 onboarding wizard 的 UI 层（用 PR-0 原语 `<Modal>` / `<Row>` / `<FormRow>` / `<BrandAvatar>` / `<Chip>` 等）。视觉对齐 mock。 |
| `PR-D` | **Settings IA 重排** —— 重做 Settings tab 成 5 tab（Overview / AI Setup / Knowledge Index / Tools / Advanced），按 spec IA 组织。用 PR-0 原语。 |
| `PR-E` | **per-surface readiness 集成** —— Settings Overview tab 消费 `CapabilityRegistry.getAll()` 渲染 readiness 表。**依赖**：chat / dashboard / copilot 的 capability adapter 已注册（即其他 worktree 的 PR-Chat-4 / PR-Dash-? / copilot skin 已 merge）。 |

---

## 不要做的事

- 不要碰 `src/service/agents/curator/`（Curator 后端不动）
- 不要重写 `HarnessSettings` 数据结构（onboarding 写入它就好）
- 不要新建 `peak-components.css` 之外的 CSS 文件
- 不要在 onboarding/settings 主 chrome 露出内部词汇（见 §4 词汇契约）
- 不要碰 chat / dashboard / copilot 的代码
- 不要在 PR-E 之前 implement chat / search / copilot 的 capability adapter（那些归各自 worktree）

---

## 验证

- `npm run build` green
- `npm test` green
- 视觉对比：在 Obsidian 里打开 onboarding + settings，跟 mock HTML 并排对比
- light + dark 都要测
- 词汇 grep：`Harness|Quick|Deep|Premium|Agent Fast|MCP|Embedding|local-fast|local-deep|online tier` 在 templates/config/onboarding.json + settings.json **零出现**（Advanced tab 例外）
- PR-E 完工后：Settings Overview tab 能看到所有已注册 surface 的 readiness 行（如果其他 worktree 都 land 了）

---

## 已知开放问题（带到新 session 里再决定）

旧 plan §4 列了 11 个开放问题，其中 Q2/Q3/Q4/Q5（Curator 推送频率 / 行内 receipt 默认 / context ring 视觉 / BYOK onboarding default）等 chat-surface mock 之后再拍。在本 worktree 实施时，先用 spec 默认提案；遇到模糊点 review 一次再定。

---

## 上下游联动

- **依赖**：PR-0 已 landed
- **被依赖**：无直接被依赖（PR-E 反过来依赖其他 worktree）
- **冲突边界**：动 `src/ui/view/settings/` + `src/ui/view/modals/HarnessOnboardingModal.tsx`（替换）+ `src/app/settings/SettingsTab.ts` + `templates/config/{onboarding,settings}.json` + 在 main.ts 注册 capability adapter（看是否需要 Settings 本身也是个 surface—— 可能 Settings 不需要，因为它是 readiness 表的消费者，不是 capability 提供者）

---

## 开 worktree 命令

如果用 git worktree：

```bash
cd /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant
git worktree add ../../../../../peak-onboarding -b onboarding-settings master
cd ../../../../../peak-onboarding
npm install
npm run dev
```

如果用 Conductor：新建 worktree 命名 `onboarding-settings`。

---

## 完工标准

- 5 个 PR 全部 merge 进 master（PR-E 最后，等其他 worktree）
- 在 Obsidian 里 onboarding 7 步 wizard 跟 mock 匹配
- Settings 5 tab IA 跟 mock 匹配
- 词汇契约 grep 通过
- Settings Overview tab 实时反映所有 surface 的 readiness
- `npm run build` + `npm test` green

完工后在 `docs/progress.md` 追加日志。
