# Onboarding × Settings 一体化重设 — 工作追踪

**Date:** 2026-05-29
**Status:** brief 已就位 / mocks v1 已就位 / Settings 输入 pending / 产品代码未动
**Owner:** highestpeak
**Scope:** Onboarding wizard 重设 + Settings IA 重组 + 跨 surface readiness 系统，三者作为**同一系统**交付

---

## 1. 背景与定位

这次工作不是"做一个 onboarding wizard"，也不是"重做 Settings 页"。是把**配置心智模型 + 配置入口 + 配置消费面**当**一个系统**重做：

```
Onboarding wizard ─── curated 路径（首跑 + repair）
       ↓
共享心智模型 + 配置数据模型 + readiness 三态
       ↑
Settings IA ─── 完整可调面（5 tab）
       ↑
Chat / Search / AI Analysis / Copilot / Quick Search ─── 在每个 surface 暴露"用什么 + 修复 CTA"
```

触发这次重做的真实信号（按时间先后）：

1. OpenRouter Test 按钮一直 Failed → 查到 `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/core/providers/testProviderConnection.ts:51` 拼出 `/v1/v1/models`（双 `/v1`）。
2. "我没看到 onboarding 里有 harness agent 我们的配置啊" → 现状是两套独立 modal（`OnboardingModal` + `HarnessOnboardingModal`），首跑用户结束后 Harness tier 仍空。
3. "什么是 quick 什么是 deep 什么是 premium" → 即便走了 Harness wizard，用户也是在 Review 屏第一次见到这套术语，前面没教学，推荐看起来武断。
4. 多屏视觉/交互反馈：cheap radio dot、孤零零 spinner、看不见的选中态（`bg-[--interactive-accent]/10` 在某些 theme 下被 color-mix 算成几乎透明）、混杂中英。
5. 结构性：Chat / Search / Copilot / AI Analysis 各用各的词，用户每去一个 surface 就要换一套 vocabulary。

**结论：不是更漂亮的 wizard，是一份心智模型 + 同一套词汇贯穿全产品。**

---

## 2. 这个 session 已完成

### 2.1 设计 brief

`/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/specs/2026-05-29-onboarding-design-brief.md`（约 690 行）

包含的部分：

- §1 为何重做（4 个真实信号 + 1 个结构信号）
- §2 范围
- §3 心智模型：5 概念 + 词汇 lock 表（Profile → Provider、Agent → Research、Agent Fast → Fast Lookup、Chat slot → Conversation、Embedding → Knowledge Index、Web Search → Web Access、Harness 从用户面消失）
- §4 配置数据模型 + 三态 readiness（Green / Yellow / Red）
- §5 Onboarding wizard 7-step 全规格 + 进度指示器契约
- §6 Settings IA（Overview / AI Setup / Knowledge Index / Tools / Advanced 5 tab，构架引用 5-26 spec）
- §7 Per-surface integration（Chat / Quick Search / Vault Search / AI Analysis / Copilot / Command Center）
- §8 视觉系统（token / 组件 / 卡片选中规则 / loading 规则 / 语言）
- §9 26 张 mockup 交付清单
- §10 5 PR 落地路径（PR-A 到 PR-F）
- §11 11 个待决问题
- §12 Non-goals

**关系：5-29 brief 的 §6 / §7 暂时和 `2026-05-26-settings-mental-model-redesign.md` 并存。下一步会合一份。**

### 2.2 HTML 评审 mocks

`/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/onboarding-redesign-2026-05-29/`

文件清单：

- `index.html`（评审入口 + 词汇约定表）
- `onboarding-progress.html`（7-step indicator + hover tooltip）
- `onboarding-capabilities.html`（Step 2：Chat / Vault Search / AI Analysis / Copilot 四张能力卡）
- `onboarding-provider.html`（Step 3：saved row + 8 chip grid + 内联表单）
- `onboarding-ai-behavior.html`（Step 4：starter model + preferences + 单 CTA Generate recommendation + behavior preview）
- `onboarding-index-readiness.html`（Step 5：先检测 5 行状态再推荐 action，radio dot 而非 icon）
- `onboarding-ready-launchpad.html`（Step 7：summary + 4 first-action 卡）
- `onboarding-full-flow.html`（tab 串联 7 步 + Step 4 generating loader + Step 6 system check）
- `mock.css` / `mock.js`（共享设计 token + Lucide-style icon set + 真品牌 mark）

历经多轮修正（v1 → v2 → v3 → v4 → v5），最终对照参考图都已对齐：

- 进度指示器：active step 渲染为 56×8 横向 pill bar，labels 改 `position: absolute` 不挤占 flex 宽度，全 7 dot 装入 modal
- Step 2：Try later 改为 inline pill + 长文 ellipsis，去掉冗余 hint banner
- Step 3：saved row 用 Connected 绿点 + Ready chip + Test + 3-dot menu；API key 用 eye icon；"Test connection before continuing" 改 subtle gray
- Step 4：单 primary CTA "Generate recommendation"（不再 Accept/Edit/Regenerate 三联）
- Step 5：recommended action 真 radio dot（空心 / 选中蓝填充）
- Step 7：4 张卡 icon 色彩错落（蓝 / 绿 / 紫 / 琥珀）
- Tooltip：从 bubble 上方移到 label 下方，加 CSS 上箭头，不再溢出 modal 顶
- 品牌 icon：Anthropic / OpenAI / Google / Ollama / Perplexity 用 Simple Icons 官方 path；OpenRouter 用 openrouter.ai header 抠出来的真 SVG（viewBox 0 0 512 512，加 `ICON_OVERRIDES` 表支持）；LiteLLM 用 Lucide `TrainFront`（其品牌素材是 emoji 火车头，无 vector）；Custom 用 Lucide `</>` chevron

### 2.3 规则写入

| 规则 | 位置 | 索引 |
|---|---|---|
| 给用户的所有路径必须**绝对路径**（Alfred 打开） | `/Users/zhangjike/.claude/CLAUDE.md` Response Style | `/Users/zhangjike/.claude/projects/-Users-zhangjike-code-my-code-mobius-highestpeak-kb--obsidian-plugins-obsidian-peak-assistant/memory/feedback_absolute_paths.md` |
| 品牌 icon 解析顺序（Simple Icons → vendor 站点 → Lucide as last resort）+ 自定义 viewBox 处理 | `/Users/zhangjike/.claude/CLAUDE.md` UI Style | `/Users/zhangjike/.claude/projects/-Users-zhangjike-code-my-code-mobius-highestpeak-kb--obsidian-plugins-obsidian-peak-assistant/memory/feedback_brand_icons.md` |

### 2.4 产品代码

**未动。** `git status` 干净（除了 `.claude/` 配置）。零 commit。

---

## 3. 已锁定的设计决定

这些不再回头讨论，作为后续动作的前提：

1. **Onboarding 和 Settings 是同一系统的两面。** Onboarding 是 curated 路径，Settings 是完整面。两者共享心智模型 / 数据模型 / 词汇 / readiness。
2. **7 个 primary step**：Welcome → What Peak can do → Add Provider → Choose how Peak should work → Check your vault index → System check → Ready to try。底层子状态（pick bootstrap / run curator / review / edit / redo）不上升为顶层进度点。
3. **Settings 5 tab**：Overview / AI Setup / Knowledge Index / Tools / Advanced（替换现 Profiles / MCP / Search / Harness / Maintenance / General 6 tab）。
4. **词汇 lock**：Provider / Conversation / Fast Lookup / Research / "Use a stronger model when needed" / Knowledge Index / Web Access。**禁用** Profile / AI Account / AI Connection / Quick / Deep / Premium / Quality Review / Harness / Cascade（这些只在 implementation 注释里可见，不上产品面）。
5. **Readiness 三态**：Green / Yellow / Red。每个 surface 都要回答"我现在能跑吗"，Red 必须给 inline 修复 CTA。
6. **Step 5 行为反直觉的关键约定**：打开页面**只检测**，不自动开跑 indexing。检测结果驱动推荐 action。
7. **品牌 icon**：Simple Icons → vendor SVG → Lucide as fallback。已固化为全局规则。
8. **mocks 文案与代码字符串都英文**，统一抽到 `templates/config/onboarding.json` + `templates/config/settings.json`，不写死在 TSX。
9. **存储不动**：5 tab 是 UI re-map，复用现有 `ProfileRegistry` / `HarnessSettings` / `MyPluginSettings` 字段，零数据迁移。
10. **没有第二个 Harness wizard**：`HarnessOnboardingModal` 会被删，所有"re-run setup"入口收回到统一 `OnboardingModal` 的 re-run 模式（`initialStep: 'choose-bootstrap'`）。

---

## 4. 待决定（等用户输入）

### 4.1 等 Settings 输入

用户已明示"setting 我一会儿给你再"。需要的输入：

- 现状 Settings 痛点（哪个 tab / 哪个 control 最让你 / 用户难受）
- 想保留的概念（哪些不能动）
- 想改的概念（命名 / 分组 / 入口位置）
- 想新增的概念（usage dashboard / safety / mobile-specific 等是否进 Settings）
- 已有的草图或参考（如果有）

拿到后会进入 §5.B 节奏（合并 spec）。

### 4.2 设计 brief §11 里 11 个 open questions（暂选默认）

| # | 问题 | 当前默认（待 confirm） |
|---|---|---|
| 1 | Step 2 在 re-run 模式是否隐藏？ | 隐藏 |
| 2 | Cascade（"Use stronger when needed"）何时显示？ | 仅当 Fast Lookup 和 Research 绑定到不同 Provider 时显示 toggle |
| 3 | Done 屏是否给"试试这个"提示词？ | 给一句话提示（一行） |
| 4 | Edit Plan 在 wizard 里 vs Settings AI Setup 里 是同一组件还是密度不同？ | 同一组件，wizard 内更紧凑 variant |
| 5 | 对话级 model override 在 Chat 顶部？ | 本 brief 不做，留待 follow-up |
| 6 | Premium fallback off → Yellow 永远还是仅当用户选"quality first"？ | 永远 Yellow（Premium 是 opt-in） |
| 7 | `--pk-accent-soft` 在 light / dark 的精确百分比？ | 设计师定 |
| 8 | OpenRouter 测试 bug 是否纳入本系统 PR？ | 否，独立 PR-F |
| 9 | mocks 给设计师后，HTML 是否同步演进？ | 设计师产出高保真后，HTML mocks 仅作历史评审存档 |
| 10 | Settings Overview 的 readiness 行点击行为—跳 wizard 还是跳本页其他 tab？ | 跳 wizard 对应 step（修复路径短） |
| 11 | "Harness" 一词在 Advanced > Agent runtime 是否可保留？ | 保留为内部技术名，不出现在 tab label |

收到 Settings 输入后，连同这 11 个一起 confirm 一遍，写进合并 spec。

---

## 5. 后续执行路径

### 5.A 立即可下（不依赖 Settings 输入）

| 项 | 内容 | 状态 |
|---|---|---|
| **PR-F** | 修 `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/core/providers/testProviderConnection.ts:51` 的 `/v1/v1/models` bug | 用户授权即可下 |

### 5.B 等 Settings 输入后

| 项 | 内容 | 依赖 |
|---|---|---|
| **B1 合并 spec** | 把 5-29 brief 升级为 `2026-05-29-configuration-and-onboarding-system-design.md`（或换名），明确 supersede 5-26 settings spec。结构改为：心智模型 → 配置数据模型 → readiness → **并列两章** Onboarding wizard 和 Settings IA → per-surface integration。 | 4.1 输入 + 4.2 确认 |
| **B2 mocks 补全** | 现在 HTML 覆盖 wizard 6 区。Settings 5 tab 需要等 B1 后补 mocks（Overview / AI Setup / Knowledge Index / Tools / Advanced），仍走 `docs/gstack/` 路径。 | B1 |

### 5.C 实现路径（按依赖排）

| PR | 内容 | 依赖 |
|---|---|---|
| **PR-A** | 状态机合并：删 `HarnessOnboardingModal`，扩 `OnboardingModal` 收 7 step，`openHarnessSetupWizard` 重定向到 re-run 模式（`initialStep: 'choose-bootstrap'`）。**行为对齐，零视觉变化。** | B1 |
| **PR-B** | 字符串抽 `templates/config/onboarding.json` + `templates/config/settings.json`，TemplateManager 加载，全英化。预留 `.zh.json` 空壳。 | B1 |
| **PR-C** | 视觉重做应用到 React：新增 `RadioCard` / `TierCard` / `ReadinessChip` / `ProgressChecklist` 组件 + `--pk-accent-soft` 等新 token 进 `src/styles/peak-tokens.css` + 全 wizard 迁移到 `--pk-*` token。**最大的 PR。** | PR-A + 高保真 mocks |
| **PR-D** | Settings IA remap：替换 `SettingsView.tsx` 6 tab → 5 tab。UI re-map 现有字段，零数据迁移。老 tab 藏在开发者 flag 后一个 release。 | PR-A + B1 |
| **PR-E** | Per-surface integration：Chat / Quick Search / Vault Search / AI Analysis / Copilot 加 capability sublabel + readiness chip + 修复 CTA。可并行。 | PR-D |

每 PR 独立可 review，每 PR 不交叉职责。

---

## 6. 文档生命周期

| 文档 | 状态 | 处置 |
|---|---|---|
| `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/specs/2026-05-26-settings-mental-model-redesign.md` | 现有 spec | 在 B1 完成后标记 **SUPERSEDED**，内容已被合并进新文档 |
| `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/specs/2026-05-29-onboarding-design-brief.md` | 当前 spec | 在 B1 完成后**升级**为合并版（或重命名），不删历史 |
| `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/plans/2026-05-29-onboarding-settings-unification.md`（本文件） | 工作追踪 | 持续更新，PR 落地后逐项 mark done |
| `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/onboarding-redesign-2026-05-29/` | HTML mocks | 设计师高保真出图后，作历史评审存档 |

---

## 7. 当前阻塞

**唯一阻塞：Settings 输入。**

收到后：
1. 跟用户过一遍 §4.1 + §4.2 的开放问题，30 分钟内能拍板
2. 进 B1：合并 spec
3. 同步开 B2 + PR-F

PR-F（OpenRouter bug fix）也可以**今天**就独立下，不必等任何东西。

---

## 8. 这次 session 留下的可信资产

- 一份立场清晰的设计 brief（5-29，690 行）
- 一套真实可点击的 HTML mocks（8 文件 + 共享 CSS/JS）
- 真实的官方品牌 icon 集（Simple Icons + 抠的 OpenRouter SVG）
- 两条全局规则（绝对路径 + 品牌 icon 顺序）已写入 `/Users/zhangjike/.claude/CLAUDE.md`
- `src/` 零污染，回退成本为 0

下一段对话：把 Settings 输入丢进来。
