# Design System Unification — 4 条 redesign 流统一规划

**日期**：2026-05-30
**作者**：planning session
**状态**：
- ✅ §5 决议已拍板
- ✅ PR-0 已 landed on master（2026-05-30，commits a7f0578 → e28001d，7 tasks 全部 done）
- ✅ Copilot skin housekeeping landed on master（commit a459578）
- 🔄 3 worktree 并行执行中（2026-05-30 路 B：单 session 并行 dispatch 多 subagent）
  - chat-retained: 3/4 PR done（7f608e1, 1ff9a22, 77994b6）— PR-Chat-4 pending（session limit）
  - dashboard-redesign: 3/4 PR done（bc345d7, 6bbc480, eb16d27）— PR-Dash-4 等 PR-Chat-4 暴露 receipt/context hook
  - onboarding-settings: 3/5 PR done（a93daa6, a068427, 8840ec1）— PR-D/PR-E pending（session limit）
**前置 spec**：
- `docs/superpowers/specs/2026-05-29-onboarding-design-brief.md`
- `docs/superpowers/specs/2026-05-29-settings-interface-design.md`
- `docs/superpowers/specs/2026-05-29-usage-dashboard-insights.md`
- `docs/superpowers/plans/2026-05-29-onboarding-settings-unification.md`（旧 5-PR 计划，仍有效，并入本规划 worktree A）
- Chat retained redesign report：`docs/gstack/chat-focused-redesign-2026-05-29/retained-designs.md`

---

## 背景

四条 in-flight redesign 流各自完成 mock，但视觉语言开始裂：
- Onboarding + Settings — light, blue accent (#2f6df2)
- Usage Dashboard — dark only, blue accent (#6b9ef5), warmer `#0a0d17` 基色
- Chat Retained — light, purple accent (#7c3aed)
- Production `peak-tokens.css` — light + dark, purple accent (#7c3aed)

不先统一，每个 worktree 各落各的会立刻分叉。这份规划：
1. 列出 4 条流的实际视觉/原语差异（§1 §2）
2. 给统一方案（§3），尽量少改 mock、保留 production 真源
3. 给 rollout DAG（§4），定义谁先 merge、谁能并行
4. 列出 7 个需要拍板的开放问题（§5）

**核心原则**：大方向不变，只做命名统一 + 缺失原语补齐 + 单一颜色决策。

---

## §1 视觉语言对照表

| 维度 | Production | Onboarding+Settings | Dashboard | Chat | 冲突 |
|---|---|---|---|---|---|
| 色调 | Light + Dark | Light only | **Dark only** (warmer #0a0d17) | Light only | 🔴 高 |
| Accent | **Purple #7c3aed** | Blue #2f6df2 | Blue #6b9ef5 | **Purple #7c3aed** | 🔴 高 |
| Token 前缀 | `--pk-*` | `--pk-*` ✓ | `--pk-*` ✓ | `--ink/--muted/--purple` | 🟡 中 |
| Spacing 命名 | `--pk-space-1..12` | `--pk-space-1..6` ✓ | `--pk-s-1..8` | 裸 px | 🟡 中 |
| Radius 命名 | `--pk-radius-sm..xl/full` | `--pk-r-sm..lg` | `--pk-r-xs..lg/pill` | 裸 px | 🟡 中 |
| Shadow 命名 | `--pk-shadow-card/popover/modal` | `--pk-shadow-card/modal` ✓ | `--pk-shadow-sm/md` | `--shadow-pop/card` | 🟡 中 |
| 字号 scale | xs/sm/base/md/lg/xl/2xl/3xl (10–28) | 裸 px (h1=22, h2=18) | 裸 px (9.5–22) | 裸 px (9.5–26) | 🟡 中 |
| Mono font | "SF Mono" 优先 | 同 | 同 | 同 | ✅ |

**结论**：真冲突只有 accent color 和 light/dark 覆盖。其他都是命名分歧，可机械统一。

---

## §2 组件原语对照

### 三流通用的核心 7 原语（必须进共享层）

| 原语 | Onboarding/Settings | Dashboard | Chat |
|---|---|---|---|
| **Chip / Badge** | `.chip` + `.pill` | `.badge`(ok/warn/bad/info) | `.role-pill` / `.model-chip` / `.tag-saved` |
| **IconButton** | (隐式) | (隐式) | `.icon-btn` |
| **Pill / Segmented** | `.segmented` | `.seg` / `.subtabs` | `.seg` |
| **Popover** | (无) | (无) | `.popover` / `.run-pop` / `.more-pop` |
| **Modal** | `.modal` + `.modal-overlay/shell` | (无) | (无) |
| **Row** ([icon][label+desc][chip][control]) | `.row` (主力) | `.hbar` (4 列变体) | `.idx-row` / `.left-item` |
| **Pill** (rounded button) | `.btn` | `.btn--pill` / `.btn--pill-primary` | (隐式) |

### 双流共用（也进共享层）

| 原语 | 出现处 |
|---|---|
| FormRow + form-input/select/...| Onboarding+Settings |
| Disclosure body | Onboarding+Settings (`.row--disclosure`); Dashboard (`.explainer`) |
| BrandAvatar | Onboarding+Settings (`.provider-chip`); Dashboard (`.brand-av`) |
| InlineProgressBar | Onboarding+Settings (`.progress`); Dashboard (`.pace`/`.tbl-bar`/`.hbar`); Chat (`.pos-bar`) |

### Dashboard 独占（留在 `components/charts/`，不进核心层）

`savings-dial` / `ring` / `spark` / `stack-bar` — 数据可视化原语，与核心交互层无关。

---

## §3 统一设计系统提案

### §3.1 决策矩阵

| 议题 | 推荐 | 理由 |
|---|---|---|
| Accent color | **Purple #7c3aed** | production + chat 已用，是品牌色；onboarding/settings/dashboard 的 blue 是 mock 默认 |
| Spacing 命名 | 保留 production `--pk-space-1..12` | dashboard `--pk-s-*` 是 alias，机械替换即可 |
| Radius 命名 | 保留 production `--pk-radius-sm/md/lg/xl/full`，**新增 `--pk-radius-pill: 9999px`** | dashboard 需要 pill |
| Shadow 命名 | 保留 production `--pk-shadow-card/popover/modal`，**新增 `--pk-shadow-sm/md`** | dashboard 需要小阴影 |
| Light/Dark 覆盖 | 所有原语必须有 light + dark 两套 | production 双模是 Obsidian 用户主题双轨约束 |
| Dashboard "warmer #0a0d17" | **放弃强制深色，跟 production 双模走（Obsidian 主题驱动）** | 用户拍板：dashboard 要和别的 surface 一致，不能成深色孤岛 |
| Chat `--ink/--muted/--purple` | 机械 rename 到 `--pk-*` | 同色板换名字，零视觉损失 |
| 字号 scale | 用 production `--pk-text-xs..3xl`；mock 裸 px 映射到现有档位 | 尺度差异微小 |

### §3.2 PR-0「Design System Landing」交付物

**这是 keystone PR，所有 worktree 的地基。不动业务代码。**

1. **扩充 `src/styles/peak-tokens.css`**
   - 补 `--pk-radius-pill: 9999px`
   - 补 `--pk-shadow-sm` / `--pk-shadow-md`（dashboard 已有定义可参照）
   - 补 provider brand 色板：OpenAI / Anthropic / Google / OpenRouter / Perplexity / Ollama 各 base + soft，light + dark 双套
2. **新增 `src/styles/peak-components.css`**（共享 CSS 层）
   - `.pk-row` / `.pk-row--disclosure` / `.pk-row--compact`
   - `.pk-chip` + 7 色调（neutral / accent / success / warning / danger / info / provider）
   - `.pk-pill` / `.pk-pill-primary`
   - `.pk-icon-btn`
   - `.pk-segmented` + `.pk-segmented__btn`
   - `.pk-modal-overlay` + `.pk-modal-shell` + `.pk-modal-head/body/foot`
   - `.pk-popover` + `.pk-pop-item`
   - `.pk-form-row` + `.pk-form-input/select/textarea/slider/number`
   - `.pk-disclosure-body`
   - `.pk-brand-av` / `.pk-brand-av--sm`
   - 所有都带 `:where(.peak-design-root) &` scope（Obsidian CSS defense）
3. **新增 `src/ui/components/primitives/`**（React 薄壳）
   - `<Chip>` / `<IconButton>` / `<Pill>` / `<Segmented>` / `<Popover>` / `<Modal>` / `<Row>` / `<FormRow>` / `<BrandAvatar>`
   - 只做 className composer + Radix 底座，不引入新交互
4. **`templates/config/` scaffolding**
   - `onboarding.json` / `settings.json` / `chat.json` / `dashboard.json` 空壳
   - `TemplateId` 注册 + loader 工具（按现有 TemplateManager 模式）
5. **docs/conventions/ 补**
   - `design-tokens.md` 加 provider 色板段落 + radius-pill + shadow-sm/md
   - 新增 `component-primitives.md` 列 9 个共享原语 + React wrapper vs 裸 className 使用准则
6. **机械迁移 mock**（保护后续 design review 不被 token 命名干扰）
   - Dashboard mock：`sed` 替换 `--pk-s-` → `--pk-space-`，`--pk-r-` → `--pk-radius-`，accent 改 purple，**补 light 主题变体（用 production 双模色板），删除强制深色**
   - Chat mock：`--ink` → `--pk-text-strong`，`--muted` → `--pk-text-muted`，`--purple` → `--pk-accent` 等
   - Onboarding/Settings mock：`--pk-r-sm/md/lg` → `--pk-radius-sm/md/lg`，accent 改 purple
   - mock 改完后用 Playwright 截图三屏并排目视确认无视觉退化

### §3.3 PR-0 的非目标

- ❌ 不动任何业务逻辑（agent / search / chat orchestration）
- ❌ 不动 streamdown shadow DOM token（Phase 4 单独处理）
- ❌ 不重写 obsidian-reset.css（已经覆盖）
- ❌ 不在 PR-0 里同时落 mobile / copilot 这些独立架构线

---

## §4 Rollout DAG

```
master
  │
  ├── PR-0  Design System Landing  ★ MUST MERGE FIRST ★
  │   └─ tokens + primitives + templates scaffold + mock 机械迁移
  │
  ├──┬─ [worktree A]  onboarding-settings/
  │  │   ├─ PR-A  wizard 状态机合并
  │  │   ├─ PR-B  settings 字符串外置 (templates/config/settings.json)
  │  │   ├─ PR-C  settings 视觉重写（用 PR-0 原语）
  │  │   ├─ PR-D  settings IA 重排
  │  │   └─ PR-E  per-surface readiness 适配器（依赖 chat/search/copilot capability adapter 落地）
  │  │
  │  ├─ [worktree B]  chat-retained/
  │  │   ├─ PR-Chat-1  shell + header + composer（用 PR-0 原语）
  │  │   ├─ PR-Chat-2  message + suggested next
  │  │   ├─ PR-Chat-3  conversation index (4 tab)
  │  │   └─ PR-Chat-4  capability adapter（暴露 "Conversation" capability 给 Settings）
  │  │
  │  ├─ [worktree C]  dashboard/
  │  │   ├─ PR-Dash-1  载体拆分（7 类 carrier，§6.1）
  │  │   ├─ PR-Dash-2  usage_outcome DDL + Curator 触发（§11.4）
  │  │   ├─ PR-Dash-3  KPI/funnel/charts 视觉（PR-0 原语 + 自有 chart 原语）
  │  │   └─ PR-Dash-4  "What was this about" 详情面板（复用 Modal 原语）
  │  │
  │  └─ [housekeeping] copilot skin/  (不开 worktree，PR-0 后一个小 PR)
  │      └─ 现有 src/ui/view/copilot/ 的 Modal/ReviewShell/Picker 等
  │         替换底层样式为 PR-0 新原语；不改交互、不改服务层
  │
  └── [worktree E]  openrouter-test-bug/  (PR-F, 独立)
```

### §4.1 并行 vs 合并约束

- **PR-0 是唯一阻塞点**。merge 后 A/B/C/D 完全独立可以并行。
- **冲突边界**：A/B/C/D 各自只动自己 surface 的 `src/ui/view/<surface>/`，禁止跨改原语。要补原语就提 PR-0.x 小改后让所有 worktree rebase。
- **合并顺序建议**：PR-0 → 优先合 B (Chat) → C (Dashboard) → A 的 PR-A..D → 最后 PR-E (per-surface 适配)，因为 PR-E 需要每个 surface 的 capability adapter 都已落地。

### §4.2 Worktree 设置（PR-0 merge 后执行）

```bash
git worktree add /Users/zhangjike/code/peak-chat       chat-retained
git worktree add /Users/zhangjike/code/peak-onboarding onboarding-settings
git worktree add /Users/zhangjike/code/peak-dashboard  dashboard-redesign
git worktree add /Users/zhangjike/code/peak-openrouter openrouter-test-fix
```

每个 worktree 独立 `npm install` + `npm run dev`。

---

## §5 决议（2026-05-30 用户拍板）

| # | 议题 | 决议 | 备注 |
|---|---|---|---|
| 1 | Accent color | ✅ **Purple #7c3aed** | production + chat 已用，作为品牌色保留 |
| 2 | Dashboard 主题 | ✅ **跟 production light + dark 双模，Obsidian 主题驱动** | 不再强制深色，要和别的 surface 主题一致 |
| 3 | Provider 品牌色板 | ✅ **一等公民**（进 peak-tokens.css） | dashboard 已有定义可直接拿；4 流均需 provider 标识 |
| 4 | 共享原语层形态 | ✅ **CSS class + React 薄壳**（与 shadcn pattern 一致） | `src/styles/peak-components.css` + `src/ui/components/primitives/` |
| 5 | `usage_outcome` 表归属 | ✅ **通用 telemetry layer**（`src/service/telemetry/`） | agent trace / copilot review history / search analytics 都可复用 |
| 6 | per-surface 适配器契约位置 | ✅ **共享层 `src/service/capabilities/`**（默认采纳推荐） | 定义 `SurfaceCapability` interface，Chat / Search / Copilot 各自 implement，Settings 只依赖 interface |
| 7 | Copilot 是否进 worktree | ✅ **不进**。Copilot 已完整实现（`src/service/copilot/` + `src/ui/view/copilot/`），PR-0 后一个小 PR 做 skin housekeeping | 把现有 Modal/ReviewShell/Picker 的样式底层换成 PR-0 原语，不改交互、不改服务层 |

---

## §6 不在本规划范围

- Mobile 支持（独立架构线，memory `project_mobile_support.md`）
- Provider/MCP/Skill 5-phase 大重设（spec 在 `docs/superpowers/specs/`）
- Agent trace observability（spec 已 ready 但 gated on provider v2）
- Graph / Inspector UI 重构
- Search V2 后续（`docs/superpowers/plans/2026-04-13-v2-report-quality-and-ui-fixes.md` 沿用）

---

## §7 PR-0 实施记录（2026-05-30 已完成）

### Commit chain

| Task | Commit | 描述 |
|---|---|---|
| 1 | `a7f0578` | 扩 peak-tokens.css：+`--pk-radius-pill` / `--pk-shadow-sm,md` / `--pk-prov-*` 6 个 provider 色板 light+dark；docs/conventions/design-tokens.md 同步 |
| 2 | `7f3a775` | 新建 peak-components.css 10 个共享原语 + docs/conventions/component-primitives.md；接入 tailwind.css |
| 3 | `4599571` + `87b4eb4` | 新建 src/ui/components/primitives/ 9 个 React 薄壳 + types.ts + index.ts；review fix 把 Modal 改成 compound `Modal.X` 模式 + Pill `aria-pressed` + FormNumber className 修正 |
| 4 | `c944acc` | 新建 telemetry layer：usage_outcome 表 + UsageOutcomeRepo（5 query methods）+ UsageOutcomeService（recordEvent + 5 convenience methods + 闭合 enum 校验）；9/9 tests pass |
| 5 | `f554d6f` + `f5aee0a` | 新建 src/service/capabilities/：`SurfaceCapability` interface（6 capability names + 4 readiness + 5 surface ids）+ `CapabilityRegistry` 单例（稳定排序）；6/6 tests pass |
| 6 | `5a2396e` | templates/config 脚手架：ConfigTemplateId 加 4 个 surface entry + 4 个空 JSON shell |
| 7 | `e28001d` | mock 机械迁移：4 个 mock 包 token 全部 rename 到生产名 + dashboard 补 light theme + accent 全部统一 purple #7c3aed；planning artifacts（plan + 4 specs + 2 review html）一并 land |

### 已知遗留（不阻断）

- React component smoke tests skipped（项目无 React 测试基础设施）—— PR-0 后单独建 jsdom + @testing-library/react，回补 6 个原语的 render 测试
- Segmented 缺 roving-focus a11y —— TODO 已写在 JSDoc
- chat 历史迭代草稿（`chat-message-v5.css` / `chat-interaction-v4.css` / `13-input-composer-v2.html` 等 v2/v3/v4/v5 文件）残留 `--pk-divider/-text-strong/-text-muted` —— 这些是设计过程的历史快照，不是 retained 真源（`chat-retained-mock.css` 已干净）
- peak-components.css 内一些 magic number（10px compact padding / 18px modal body padding 等）缺 inline rationale —— polish 项

### 下一步

PR-0 已 landed on master。下一波并行开 3 个 worktree + copilot skin 小 PR：

```bash
git worktree add /Users/zhangjike/code/peak-chat       chat-retained
git worktree add /Users/zhangjike/code/peak-onboarding onboarding-settings
git worktree add /Users/zhangjike/code/peak-dashboard  dashboard-redesign
```

合并顺序见 §4。每个 worktree 自己的 PR chain 独立 review + merge。
