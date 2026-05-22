# Design System Migration · 全盘统一计划

> Status: decided — §7 7 项决策已拍板（见 §8），可启动 Phase 0。
> Date: 2026-05-22
> Scope: 全 plugin UI 的视觉一致性根治
> Estimated effort: 6-8 工作日（合并后 5 phase；Phase 1 含 dark mode）

> **核心决策回顾**：
> - Plugin 视觉**完全自治**，不再继承 Obsidian 主题变量（Q2=A）
> - Light + Dark 在 Phase 1 一次到位（Q3=B）
> - 真源紫色 `#7c3aed`，vault review 的 `#7B5CFF` 回退（Q1）
> - 旧 mock 归档到 `docs/mockups/_archive/`（Q4=B）
> - Streamdown 保持独立子系统，仅做 mapping 注释（Q5=A）
> - 字号单位用 px（Q6）；暂不引入 hi-DPI scale（Q7）

---

## 1. 现状盘点（事实清单）

### 1.1 视觉资产分布

| 类别 | 数量 | 位置 |
|---|---|---|
| Mock HTML（旧期）| 11 | `docs/mockups/` |
| Mock HTML（新期）| 1 | `docs/superpowers/mockups/` |
| Scoped CSS | 6 | `src/styles/*.css` |
| Tailwind theme config | 1 | `tailwind.config.js` |
| TSX 文件含 inline hex | **73 文件 / 370 次出现 / 89 unique 值** | `src/ui/**` |
| TSX 文件引用 `--pk-*` Tailwind utility | 200+ refs | `src/ui/**` |
| TSX 文件直接引用 Obsidian `var(--background-*)` 等 | **29 文件 / 182 次出现** | `src/ui/**` |

> **Phase 0 扫描更新 2026-05-22**：数字比初稿略高。
> Hex 大头是 fallback 写法 `var(--pk-accent, #7c3aed)`，并非真硬编码 —— Phase 3 主要工作是把这种 fallback 字面量统一移除。
> Obsidian var 直引集中在 usage-dashboard（22 + 13 + 12 + 9 + 9）、ContextMenu（19）、ambient-push、skills 几块，可分子目录批量处理。
> 详细清单见 §11。

### 1.2 现存的 5 套并行 token 系统

| 系统 | 命名 | accent 紫 | bg surface | 文件数 | 真用否 |
|---|---|---|---|---|---|
| **A. 真源** | `--pk-*` | `#7c3aed` | `var(--background-primary)` Obsidian chained | 1（peak-variables.css）| ✅ 全 Tailwind 类指向它 |
| **B. Chat redesign** | `--accent` `--bg` `--fg` 无前缀 | `#7c3aed` | `#fff` hard-coded | 4 mock | 仅设计稿，未落地 |
| **C. AI Analysis** | `--pk-*` 与真源同名 | `#7c3aed` | `#fff` hard-coded | 2 mock | 仅设计稿 |
| **D. Dark variants** | 混乱 | `#7c3aed` / `var()` | `#1e1e2e` / `#0a0a12` | 4 mock | 仅设计稿，无对应实现 |
| **E. Vault Review (我做的)** | `--vr-*` | **`#7B5CFF`** ❌ | `#F7F7FA` hard-coded | 1 mock + 1 CSS | 已落地，**色板不对** |

### 1.3 三种"渲染上下文"并存

| 上下文 | scope | token 系统 | 备注 |
|---|---|---|---|
| 主插件 UI（Tailwind） | `.pktw-root` | `--pk-*` 链到 Obsidian | important + Tailwind 类 |
| Vault Review modal | `.peak-vault-auto-run-modal .peak-design-root` | `--vr-*` 硬编码 | mock CSS 复制 |
| Streamdown markdown | `[data-streamdown-root]` shadow DOM | HSL `var(--background)` Tailwind shadcn-style | 完全隔离 |

三个上下文的颜色 / spacing / radius **互不一致**。同一个紫色按钮在不同上下文里能差 3 个不同值。

### 1.4 已知具体 bug

1. Vault Review modal 的紫色和 picker 的紫色不一致（`#7B5CFF` vs `#7c3aed`）
2. Vault Review modal 的背景是 `#F7F7FA`，picker / chat 是 Obsidian 主题色（亮模式下接近 `#ffffff`）
3. 旧 mock dark variants 完全没有对应代码实现
4. Streamdown 用的 shadcn 风格 HSL 变量（`hsl(var(--background))`）跟 `--pk-bg` 不通

---

## 2. 目标状态

### 2.1 一份真源（完全自治）

Plugin 视觉**不再依赖** Obsidian `var(--background-primary)` / `--text-normal` 等主题变量；
所有 token 在 peak-tokens.css 里硬编码 light + dark 两套值，按插件 root 上的 `.theme-dark` / `.theme-light` 类切换。

```
src/styles/peak-tokens.css       ← 单源 token 定义（light + dark 两段，硬编码值）
  ↓ 引用（不链回 Obsidian）
peak-variables.css                ← 旧文件，改为薄壳：纯 alias 到 peak-tokens.css
tailwind.config.js                ← extend.theme 用 var(--pk-*)，不再嵌套 fallback 链
vault-review.css                  ← 引用同一份 token，删 --vr-*
其他 scoped CSS                   ← 同上
所有 mock HTML                    ← 引用同一份 token 的副本
```

**theme 同步策略**：Obsidian 切换 light/dark 时给 `body` 加 `.theme-light` / `.theme-dark`，
插件 root（`.pktw-root` / `.peak-design-root`）通过祖先选择器跟随，无需 JS hook。
即使用户装第三方 Obsidian 主题改了 `--background-primary` 也不影响插件 UI。

### 2.2 命名约定（统一）

- 前缀：`--pk-*`（保留现有命名空间，不大规模 rename）
- 删除：`--vr-*`、mock 里的 `--accent`、`--bg` 等无前缀变量
- 新增 token 必须放在 `peak-tokens.css`，不在私有文件里发明

### 2.3 必须包含的 token 类别

```
color · core
  --pk-bg                background-primary fallback
  --pk-bg-secondary
  --pk-bg-tertiary
  --pk-surface           card / modal background
  --pk-surface-raised    elevated surface
  --pk-surface-sunken    nested / inset surface
  --pk-border
  --pk-border-soft       hairline divider
  --pk-border-strong     emphasized border

color · text
  --pk-text-primary
  --pk-text-secondary
  --pk-text-tertiary
  --pk-text-faint
  --pk-text-inverted

color · accent + states
  --pk-accent            primary brand color
  --pk-accent-hover
  --pk-accent-tint       lightest backdrop (10-15% opacity)
  --pk-accent-soft       light border / divider
  --pk-accent-text       contrasting text on accent

color · semantic
  --pk-success / --pk-success-bg / --pk-success-text
  --pk-warning / ...
  --pk-error / ...
  --pk-info / ...
  --pk-indigo / ...      vault review uses this for "dying" status

typography
  --pk-font-sans
  --pk-font-mono
  --pk-text-xs           font-size: 10px
  --pk-text-sm           font-size: 11px
  --pk-text-base         font-size: 12px
  --pk-text-md           font-size: 13px
  --pk-text-lg           font-size: 14px
  --pk-text-xl           font-size: 16px
  --pk-text-2xl          font-size: 20px
  --pk-text-3xl          font-size: 28px

spacing (4px grid)
  --pk-space-1           4px
  --pk-space-2           8px
  ... up to --pk-space-12 (48px)

radius
  --pk-radius-sm         4px
  --pk-radius-md         8px
  --pk-radius-lg         12px
  --pk-radius-xl         16px
  --pk-radius-full       9999px

shadow
  --pk-shadow-card       hairline + tiny
  --pk-shadow-modal      large blur
  --pk-shadow-popover    medium blur

z-index
  --pk-z-base            0
  --pk-z-sticky          10
  --pk-z-dropdown        20
  --pk-z-modal           50
  --pk-z-popover         60
  --pk-z-tooltip         80

transition
  --pk-transition-fast   0.1s
  --pk-transition-base   0.15s
  --pk-transition-slow   0.3s
```

### 2.4 Light + Dark + 高对比 三套

```css
:root, .theme-light .pktw-root, .theme-light .peak-design-root {
  --pk-bg: #ffffff;
  --pk-accent: #7c3aed;
  ...
}

.theme-dark .pktw-root, .theme-dark .peak-design-root {
  --pk-bg: #1e1e2e;
  --pk-accent: #a78bfa;
  ...
}

/* 可选：高对比 */
.theme-light.is-high-contrast .pktw-root {
  --pk-border: #000000;
  --pk-text-primary: #000000;
  ...
}
```

---

## 3. 风险清单（17 类，按严重度排序）

### 3.1 关键风险（可能阻塞）

**R1 · Tailwind theme.extend 引用 `--pk-*`，重命名/删除会破坏 200+ 处用法**
- 现状：`tailwind.config.js` 里 `bg-card: 'var(--pk-surface, var(--background-secondary, ...))'` 这种链式 fallback
- 后果：删一个变量，对应 `pktw-bg-card` 全坏
- 缓解：**保持 `--pk-*` 命名不变**，只补全 token、不重命名

**R2 · Obsidian 主题深色模式适配（自治后改形）**
- 现状（迁移前）：`--pk-bg: var(--background-primary)`，亮 / 暗自动跟着 Obsidian 切换
- 决策（Q2=A）：plugin 完全自治，不再 chain Obsidian 变量
- 新风险：硬编码 light 值后，必须自己监听 Obsidian theme 切换
- 缓解：**用 `.theme-dark` / `.theme-light` 祖先选择器**（Obsidian 加在 body 上的 class）
  在 peak-tokens.css 里写两套值；不依赖变量继承，依赖 CSS cascade
- 验证：Obsidian 切 light/dark 时插件 UI 跟随，第三方主题改 `--background-*` 不影响 plugin

**R3 · Streamdown shadow DOM 用的是另一套（shadcn HSL）token**
- 现状：`hsl(var(--background))` `hsl(var(--foreground))` —— 是 shadcn 风格 HSL
- 风险：把这套 token 改了，所有 markdown 渲染（chat / insights / report）颜色错乱
- 缓解：**Streamdown shadow DOM 不动**，作为独立子系统。只在两套间加 mapping 表（文档约定 streamdown `--background` ≈ peak `--pk-surface`）

**R4 · 71 个 TSX 文件含 hardcoded hex**
- 现状：很多组件直接写 `style={{ color: '#7c3aed' }}` 或 Tailwind arbitrary `pktw-text-[#7c3aed]`
- 风险：token 改了，hex 不跟着变 → 局部色差
- 缓解：**用 codemod / 脚本搜索替换**为 token 引用；列清单逐文件 review

### 3.2 中等风险

**R5 · 4 个 dark variant mock 没有对应代码实现**
- 现状：mock 设计了深色版本，但没人落地
- 风险：迁移后发现一堆 surface 缺深色 token
- 缓解：**先实现亮色一致性，深色 token 通过 Obsidian `--background-*` 变量链自动适配**；专门的深色样式留 Phase 5

**R6 · vault-review 的 `#7B5CFF` 已落地，改色会让 UI 突变**
- 现状：用户已经看过这版 modal 视觉
- 风险：突然变成 `#7c3aed` 用户会注意到
- 缓解：**告知用户**这是统一动作；视觉冲击限于 vault modal

**R7 · 旧 mock（11 个）不知道哪些还是"有效设计稿"**
- 现状：mock 文件 timestamp 跨度 Apr 22 - May 22，部分功能可能已被废弃
- 风险：花精力对齐已废弃的设计
- 缓解：**逐个标注**：authoritative / superseded / draft，废弃的归档

**R8 · 不同 mock 用了不同字号 / spacing / radius**
- 现状：mock A 用 `radius: 10px`，mock D 用 `14px`，mock E 用 `8px`
- 风险：选哪个？哪个对？
- 缓解：**Phase 0 出一份 token 提案 mock**，让用户 / 设计师拍板

**R9 · CSS `@import` 链 + Tailwind 处理顺序**
- 现状：`tailwind.css` 顶部 `@import "./peak-variables.css"`，新加文件需要插对位置
- 风险：顺序错 → token 在 Tailwind utility 编译时未定义 → 编译失败或回退
- 缓解：**测试 build 链**，确认 import 顺序

**R10 · React 组件 / shadcn 库的 CSS variable 引用**
- 现状：shadcn Button 默认引用 `--primary` `--secondary` 等 shadcn 标准名
- 风险：我们没定义 shadcn-style HSL 名，shadcn 组件可能用默认蓝
- 缓解：**保留现有 shadcn HSL 变量映射层**（已在 peak-style-settings.css 做了）

### 3.3 低风险但容易忽略

**R11 · 设计师工作流未对齐**
- 设计师（Codex）做 mock 时不知道 token 表
- 缓解：写 `docs/conventions/design-tokens.md`，列所有 token + 给 mock 模板 HTML

**R12 · Obsidian 主题切换瞬间的闪烁**
- 用户切 light → dark，如果 token 不全在同一 cascade 层，会闪
- 缓解：所有 token 在同一 ruleset 里定义

**R13 · CSS 变量值大小写一致性**
- mock 用 `#FFFFFF`，代码用 `#ffffff`
- 缓解：**约定小写**

**R14 · CSS 变量 fallback 链的脆弱性**
- `var(--pk-bg, var(--background-primary, #ffffff))` 三层 fallback，浏览器逐层求值
- 风险：中间环节解析失败，回退到最后一层
- 缓解：保留 fallback 但简化，最多两层

**R15 · 自定义 Obsidian 主题不兼容（决策后已消除）**
- 历史风险：第三方主题改 `--background-primary` 会污染 plugin
- 决策（Q2=A）：plugin 完全自治，已无此风险
- 唯一保留依赖：Obsidian 在 body 上加的 `.theme-light` / `.theme-dark` 类（这是 Obsidian 稳定 API，不会因主题变）

**R16 · accessibility 对比度**
- 紫色 accent 上的白字对比度 ~4.6:1（接近 WCAG AA 边缘）
- 缓解：在 token 文件加注释，必要时调
 
**R17 · 性能 / bundle 大小**
- 多加 50+ CSS variables，每个 ~30 bytes = ~1.5KB 增量
- 可忽略

---

## 4. 分阶段实施计划

### Phase 0 · 决策 & 准备（半天）

**输出物**：
- ✅ 本文档评审过
- token 设计稿（一个 mock HTML 列出所有 token 视觉预览）
- 旧 mock 标注（authoritative / superseded / draft）
- 用户拍板：紫色用 `#7c3aed`（继续真源）or 切到 `#7B5CFF`（vault review 已经在用）

**验证**：色板 mock 在浏览器里好看，所有 stakeholders 同意

---

### Phase 1 · 真源 token 文件 + Light/Dark 双套（1.5-2 天）

> 决策 Q3=B：dark mode 在 Phase 1 一次到位，避免后续返工。

**改动**：
1. 创建 `src/styles/peak-tokens.css` —— 完整 token 定义（§2.3 列表全部）
   - light 段：`:root .pktw-root, :root .peak-design-root, .theme-light .pktw-root, .theme-light .peak-design-root { --pk-*: ... }`
   - dark 段：`.theme-dark .pktw-root, .theme-dark .peak-design-root { --pk-*: ... }`
   - 所有值**硬编码**（不再引用 Obsidian 变量），落实 Q2=A 自治
2. `peak-variables.css` 改为薄壳（仅 alias 旧名 → 新 token，保留向后兼容）
3. `tailwind.config.js` theme.extend 显式引用 `var(--pk-*)`，砍掉 fallback 链中间层
4. 出一份 dark mode 设计稿（mock HTML），让用户拍板深色色值
5. 验证现有 4 个 dark variant mock 表达的语义都进入真源

**风险点**：R1 / R2 / R9 / R12（cascade 闪烁）
**验证**：
- `npm run build` 通过
- 现有 Tailwind 类（`pktw-bg-card` 等）渲染颜色 light 模式不变
- Obsidian light → dark 切换时插件 UI 跟随，无白底刺眼
- 装第三方 Obsidian 主题（Minimal / Things）插件视觉不受影响
- 现有 200+ `pk-*` 引用 0 regression

---

### Phase 2 · 迁移 vault-review.css 到 token（半天）

**改动**：
1. 删 `vault-review.css` 顶部所有 `--vr-*` 变量
2. 所有引用改成 `var(--pk-*)`
3. 更新 `2026-05-20-vault-review-mockup.html`，紫色改 `#7c3aed`，删 `--vr-*` 用 `--pk-*` 副本

**风险点**：R6（用户视觉冲击）
**验证**：mock 和 React modal 都是新紫色，跟 picker 颜色统一

---

### Phase 3 · 审计 71 个 TSX 文件的 hardcoded hex（1-2 天）

**改动**：
1. 脚本扫描：`grep -rn "#[0-9a-fA-F]\{6\}" src/ui` 列清单
2. 逐文件 review：
   - 是品牌色 → 改 `var(--pk-accent)` 或 Tailwind 类
   - 是 status 色（红绿黄）→ 改 `var(--pk-error/success/warning)`
   - 是临时调色 / 一次性背景 → 保留 + 加注释解释为何不用 token
3. 同时检查 `var(--background-primary)` 等 25 处 Obsidian 直接引用 → 改 `var(--pk-bg)`

**风险点**：R4 / R10 / R15
**验证**：grep 后剩余 hex 应该 < 10 处（仅状态色 + 临时）

---

### Phase 4 · Mock 文件统一（1-2 天）

**改动**：
1. 创建 `docs/mockups/_shared/peak-tokens.css`（同 `src/styles/peak-tokens.css` 内容，独立副本以让 mock 可独立打开）
2. 每个 mock HTML 顶部 `<link rel="stylesheet" href="../_shared/peak-tokens.css">`（相对路径）
3. 删 mock 内的 `:root { --... }` 块
4. mock 内引用 token 统一用 `--pk-*`
5. 废弃 mock **移到 `docs/mockups/_archive/`**（Q4=B），加 README 说明被谁取代
6. 创建 `docs/conventions/design-tokens.md` 规则文件 + token 索引 HTML

**风险点**：R7 / R8 / R11
**验证**：所有 mock 浏览器打开都能用同一份 token；紫色统一为 `#7c3aed`

---

### Phase 5 · Streamdown 边界 + 深色全 surface 验收（0.5-1 天）

> Dark mode 主体已在 Phase 1 落地，此处仅做 Streamdown 边界 + 全 surface dark 走查。

**改动**：
1. Streamdown shadow DOM token 不动（Q5=A），写一份 mapping 注释放进 `streamdown.css`：
   - `--background` ≈ `--pk-surface`
   - `--foreground` ≈ `--pk-text-primary`
   - `--primary` ≈ `--pk-accent`
   - `--border` ≈ `--pk-border`
2. 全 surface dark 走查截图（picker / vault modal / chat / settings / search / quick-search / project list），
   补齐 Phase 1 漏的 token 值
3. 验证 Streamdown markdown 在 light/dark 下颜色都合理（即使是独立 token 系统，视觉上不该差太多）

**风险点**：R3 / R5
**验证**：dark mode 下所有 surface 无白底闪烁；markdown 渲染不"跳色"

---

### Phase 6 · 规范固化 + 防御（半天）

**改动**：
1. 写 `docs/conventions/design-tokens.md`
   - 所有 token 列表 + 用途
   - 新增 token 流程：先在 peak-tokens.css 加 → 通过评审 → 才能在组件用
   - mock 必须 link 共享 token 文件
2. CLAUDE.md "Project Rules" 加一行指针
3. 加 ESLint / stylelint 规则（如果可行）禁止 inline hex 在 src/ui
4. PR checklist 加："任何新颜色 / spacing / radius 引用了 token 而非 hex"

**输出物**：规范文档，配套 lint 防御

---

## 5. 验证策略

### 5.1 自动化

- `npm run build` 通过（baseline）
- grep `#[0-9a-fA-F]` in `src/ui/**/*.tsx` —— Phase 3 后 < 10 处
- grep `--vr-` —— Phase 2 后 = 0
- grep `var(--background-primary)` 直接引用 —— Phase 3 后 = 0

### 5.2 视觉

逐 surface 截图对比 before / after：
- Picker（Document / Vault / Setting 三个 tab）
- Vault Review modal 6 tabs
- Chat view（message + input toolbar）
- Settings 各 panel
- Search modal
- Quick Search inline plan review
- Project list sidebar

每个 surface light + dark 各一张截图，比对色彩 / 紫色 / surface 一致。

### 5.3 兼容性

- 用 Obsidian 默认主题
- 用至少 2 个第三方主题（如 Minimal / Things 2）
- 验证 plugin UI 在 3 个主题里都不崩

---

## 6. Rollback 计划

每个 phase 独立 commit，可独立回退：

- Phase 1 回退：删 peak-tokens.css，恢复 peak-variables.css 原样
- Phase 2 回退：恢复 `--vr-*` 块
- Phase 3 回退：逐文件 revert
- Phase 4 回退：mock CSS link 改回内联
- Phase 5 回退：删 dark override block

最差情况：完全回到当前 master，无数据损失。

---

## 7. 决策记录（已拍板 2026-05-22）

### Q1 · 紫色定哪个？ → **`#7c3aed`** ✅
- 迁移成本最低（11 mock + 真源已用）
- 副作用：vault-review modal 紫色需回退（Phase 2 内处理）

### Q2 · 是否完全脱离 Obsidian 主题变量？ → **A：完全自治** ✅
- plugin 视觉跟 Obsidian 主题完全无关
- 收益：第三方主题不再能污染 plugin 视觉；视觉一致性可控
- 代价：Obsidian 切 light/dark 时，靠 `.theme-dark` / `.theme-light` 祖先选择器跟随（不靠变量继承）
- 影响：§2.1 重写、R2 缓解方案重写、R15 风险消除、所有 `var(--background-primary)` 等直接引用必须替换

### Q3 · Dark mode 优先级 → **B：Phase 1 一起做** ✅
- 避免后续返工，token 一次定稿
- Phase 1 估时从 1 天上调到 1.5-2 天
- Phase 5 从 1-2 天降到 0.5-1 天（只做 Streamdown 边界 + 全 surface dark 走查）

### Q4 · 旧 mock 怎么处理 → **B：归档到 `docs/mockups/_archive/`** ✅
- 不删（留参考），不污染主目录
- 加 `_archive/README.md` 说明各废弃 mock 被谁取代

### Q5 · Streamdown 是否纳入统一 → **A：单独子系统 + mapping** ✅
- 不改 shadow DOM 内部，仅在 `streamdown.css` 写 mapping 注释
- 维护两套 token 但风险可控

### Q6 · 字号单位 → **px** ✅
- Obsidian 用户字体常自调，rem 会被牵动
- mock 用 px → fidelity 更高
- 注意：和 Tailwind 默认 rem 体系冲突时，通过 token 显式覆写解决

### Q7 · 是否引入 hi-DPI / 字号 dynamic scale → **暂不引入** ✅
- 复杂度收益不匹配；后续如需要再加

---

## 8. 决策影响一览

| 决策 | 选择 | 主要影响章节 |
|---|---|---|
| Q1 紫色 | `#7c3aed` | Phase 2（vault-review 回退） |
| Q2 Obsidian 主题继承 | 完全自治 | §2.1 重写、R2 重写、R15 消除、Phase 1/3 必须替换所有 Obsidian 变量直接引用 |
| Q3 Dark mode 时机 | Phase 1 一起做 | Phase 1 估时 +0.5-1 天、Phase 5 -0.5-1 天 |
| Q4 旧 mock 处置 | 归档到 `_archive/` | Phase 4 步骤 5 |
| Q5 Streamdown 边界 | 单独子系统 | Phase 5 步骤 1（仅 mapping） |
| Q6 字号单位 | px | §2.3 typography 段 |
| Q7 hi-DPI scale | 暂不引入 | 不在范围 |

---

## 9. 附录：当前真源 inventory

### peak-variables.css 已定义的 token（98 行）

仅列代表性的；完整看文件：

```
--pk-bg, --pk-bg-secondary, --pk-fg, --pk-fg-muted, --pk-fg-faint
--pk-border, --pk-hover, --pk-active, --pk-popover
--pk-accent: #7c3aed
--pk-accent-hover: #6d28d9
--pk-accent-muted: rgba(124, 58, 237, 0.15)
--pk-success / --pk-warning / --pk-error / --pk-info（各自带 -muted）
--pk-surface, --pk-surface-raised, --pk-surface-sunken
--pk-text-primary, --pk-text-secondary, --pk-text-tertiary, --pk-text-inverted
--pk-border-light
```

### 缺失的 token（Phase 1 要补的）

```
--pk-accent-tint        最浅紫底（vault review 用 --vr-accent-tint）
--pk-accent-soft        浅紫边
--pk-accent-text        深紫文字（在浅紫底上）
--pk-border-soft        hairline（vault review 用）
--pk-indigo / --pk-indigo-bg  (dying status 紫蓝)
--pk-text-faint         比 muted 更淡
--pk-shadow-card / --pk-shadow-modal / --pk-shadow-popover
所有 spacing / radius / typography / z-index / transition token
```

---

## 10. 不在范围内（明确边界）

- 不重写 shadcn 组件库
- 不动 streamdown shadow DOM 内部
- 不引入新设计语言（icons / illustrations / animations）
- 不重做布局结构（信息架构）
- 不解决 i18n / RTL
- 不引入 design system 工具链（Style Dictionary、Figma sync）

---

## 11. Phase 0 Inventory（2026-05-22 扫描结果）

### 11.1 Hex 硬编码全景

```
总计  370 次出现 · 89 unique 值 · 73 个文件
```

按类别（与 §2.3 token 类对应）：

| 类别 | 主要值 | 出现次数 | 处理策略 |
|---|---|---|---|
| 品牌紫 | `#7c3aed` ×40, `#6d28d9` ×17, `#8b5cf6` ×5 | 63 | 多数是 `var(--pk-accent, #7c3aed)` fallback —— Phase 3 砍 fallback |
| 紫色 tint（背景/边） | `#f5f3ff`, `#ede9fe`, `#cba6f7`, `#faf8ff` … | ~20 | 改 `var(--pk-accent-tint)` / `--pk-accent-soft` |
| Success 绿 | `#22c55e` ×35, `#059669`, `#10b981` … | ~48 | fallback 砍掉，全用 `--pk-success` |
| Error 红 | `#ef4444` ×24, `#dc2626`, `#f38ba8` … | ~40 | 同上 → `--pk-error` |
| Warning 橙 | `#f59e0b` ×21, `#fab387`, `#f9e2af` … | ~36 | → `--pk-warning` |
| Info 蓝 | `#3b82f6` ×15, `#2563eb`, `#89b4fa` … | ~42 | → `--pk-info` |
| 灰阶 | `#2e3338` ×27, `#6c757d`, `#999999`, `#fff` … | ~90 | → `--pk-text-*` / `--pk-border-*` |
| **保留 hex 不进 token** | 见下表 | ~28 | 加注释解释 |

**保留为字面 hex 的合法场景**：

| 类型 | 文件 | 理由 |
|---|---|---|
| Provider 品牌色 | `ProviderIcon.tsx` (Anthropic `#d4a574`, OpenAI `#10a37f`, Google `#4285f4`, Perplexity `#20b2aa`, OpenRouter `#6366f1`) | 第三方品牌，token 化无意义 |
| 知识图谱边色语义 | `LensEdgeComponent.tsx` (`#5b8fd4` builds_on, `#d4a84a` applies, `#e06080` contrasts) | 语义编码色，应单独建 `--pk-graph-edge-*` 子系列 |
| Recharts Catppuccin 调色板 | `TrendCharts.tsx` (`#89b4fa`, `#a6e3a1`, `#f9e2af` …) | 数据系列轮转色，单建 `--pk-chart-1..n` |

### 11.2 Top 10 hex 重灾文件

```
21  src/ui/view/quick-search/components/ActiveSessionsList.tsx
20  src/ui/component/mine/multi-lens-graph/edges/LensEdgeComponent.tsx
16  src/ui/view/settings/components/ProviderIcon.tsx               ← 多为合法品牌色
16  src/ui/view/copilot/panels/CorrectContentPanel.tsx
16  src/ui/component/mine/multi-lens-graph/nodes/LensNodeComponent.tsx
15  src/ui/view/usage-dashboard/components/DistributionCharts.tsx
15  src/ui/view/quick-search/components/V2InlinePlanReview.tsx
15  src/ui/view/prompt-template/components/PromptItem.tsx
14  src/ui/view/quick-search/components/VaultSearchResult.tsx
12  src/ui/view/quick-search/components/ai-analysis-sections/RecentAIAnalysis.tsx
```

### 11.3 Obsidian 变量直引全景

```
总计  182 次出现 · 29 个文件
```

| Obsidian var | 命中 | 映射到 |
|---|---|---|
| `var(--background-modifier-border)` | 48 | `var(--pk-border)` |
| `var(--text-normal)` | 33 | `var(--pk-text-primary)`（同时清理 `--pk-fg`/`--pk-text-primary` 两套别名） |
| `var(--text-muted)` | 32 | `var(--pk-text-secondary)` |
| `var(--text-faint)` | 14 | `var(--pk-text-faint)` ← Phase 1 新增 |
| `var(--background-secondary)` | 11 | `var(--pk-bg-secondary)` |
| `var(--background-primary)` | 9 | `var(--pk-bg)` |
| `var(--interactive-accent)` | 8 | `var(--pk-accent)` |
| `var(--text-accent)` | 6 | `var(--pk-accent-text)` |
| `var(--background-modifier-hover)` | 6 | （Phase 1 引入 `--pk-state-hover`） |
| 其他 6 类 | 15 | 个案处理 |

### 11.4 Top 10 Obsidian-var 重灾文件

```
22  src/ui/view/usage-dashboard/components/TrendCharts.tsx
19  src/ui/view/chat-view/components/ContextMenu.tsx
13  src/ui/view/usage-dashboard/components/DailyBreakdown.tsx
12  src/ui/view/usage-dashboard/components/DistributionCharts.tsx
10  src/ui/view/prompt-template/PromptTemplateList.tsx
 9  src/ui/view/usage-dashboard/components/RecentCallsTable.tsx
 9  src/ui/view/usage-dashboard/components/KpiCards.tsx
 9  src/ui/view/skills/SkillPickerModal.tsx
 9  src/ui/view/ambient-push/PushCard.tsx
 8  src/ui/view/ambient-push/AmbientPushPanel.tsx
```

**观察**：usage-dashboard 一个目录占 65 次 / 6 个文件 —— Phase 3 应作为独立 sub-batch 处理。

### 11.5 Mock 分类（送 Phase 4 用）

**保留（authoritative，6 个）**：

| File | 取代关系 |
|---|---|
| `docs/mockups/ui-theme-chat-review.html` | 唯一 `--pk-*` 色板参考文件 |
| `docs/mockups/ai-analysis-landing-v2.html` | 取代 v1 |
| `docs/mockups/input-toolbar-final.html` | 取代 redesign |
| `docs/mockups/chat-ui-redesign.html` | 合并 part1+part2 |
| `docs/mockups/tool-call-redesign.html` | 唯一 tool-call mock |
| `docs/superpowers/mockups/2026-05-20-vault-review-mockup.html` | 最新；Phase 2 调紫色 |

**归档到 `_archive/`（6 个）**：

| File | 归档原因 | 取代它的文件 |
|---|---|---|
| `ai-analysis-landing.html` | superseded | `ai-analysis-landing-v2.html` |
| `chat-redesign-part1-messages.html` | superseded | `chat-ui-redesign.html` |
| `chat-redesign-part2-pages.html` | superseded | `chat-ui-redesign.html` |
| `input-toolbar-redesign.html` | superseded | `input-toolbar-final.html` |
| `copilot-document-intelligence.html` | draft / 未落地 | — |
| `prompt-template-modal.html` | draft / 无 token 系统 | — |

### 11.6 Phase 0 deliverable

- ✅ **本节 §11 完成**（hex + Obsidian var + mock 分类清单）
- ✅ **Token 预览 mock**：`docs/mockups/_design-tokens-preview.html`
  - 包含全部 token（surface / border / text / accent / semantic / typography / spacing / radius / shadow）
  - light + dark 切换按钮
  - 组件抽样（buttons / input / badges / tinted card）验证 token 组合视觉
  - 此 mock 的硬编码值 == Phase 1 落盘 `peak-tokens.css` 的初稿

### 11.7 Phase 1 启动 checklist

待你审完 `_design-tokens-preview.html` 视觉，确认色板 + 字号 + 间距后：

- [ ] 拍板 Light 紫色背景（`#7c3aed` tinted 10%）够不够明显
- [ ] 拍板 Dark accent（`#a78bfa`）对比是否合适
- [ ] 拍板 `--pk-border-soft` (`#ececef`) 是否够淡
- [ ] 拍板 chart palette 命名（保留 Catppuccin or 重选）
- [ ] 拍板 indigo（`#6366f1`）vs vault review 既有 indigo 是否一致
- [ ] 拍板 `--pk-fg` / `--pk-text-primary` 双别名如何收敛（Phase 1 改 alias 还是直接 rename）

回复"启动 Phase 1"我就开始写 `peak-tokens.css`。

---

*文档完。§7 决策已拍板，§11 Phase 0 已交付。等审 `_design-tokens-preview.html` → 启动 Phase 1。*
