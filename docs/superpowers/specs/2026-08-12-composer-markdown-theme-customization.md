# Composer Markdown 主题与快速定制设计

> 状态：owner-review design，尚未进入生产实现
> 日期：2026-08-12
> 读者：Peak 产品负责人、Composer 维护者、Design System 实现代理
> 范围：Composer 文档视觉、Markdown 元素、编辑状态与 Theme JSON；不改变 Markdown 语义、文档结构或 AI 能力

## 1. 决策

Composer 的视觉不能继续由 `composer.css` 中一组固定的局部值决定，也不能把每个 Markdown 元素做成一个散乱的设置面板。最终模型分为三层：

1. **Peak Theme** 决定全产品的颜色、字体家族、圆角、阴影、密度和 motion。
2. **Composer 文档样式** 是 Theme JSON 的一个受校验子配置，决定正文行宽、排版节奏与 Markdown 元素表现。
3. **编辑状态** 决定焦点、选区、块 hover、AI 候选、diff 和附着工具；它不是文档样式，不能被“极简正文”隐藏。

用户先选一套完整文档预设，再用少量高杠杆控件快速调整。元素级高级设置只在需要时展开；不允许导入任意 CSS，也不把 Obsidian 主题变量接入 Composer。

## 2. 为什么现在必须单独设计

当前生产实现已经拥有丰富的 Markdown 与对象块，但视觉配置仍是静态的。

| 已确认事实 | 证据 | 设计影响 |
| --- | --- | --- |
| 文档纸张、正文、标题和间距由局部 `--pkc-*` 固定值控制 | `src/styles/composer.css` | 全局 Theme 不能完整改变 Composer 阅读气质 |
| H1–H3 有独立尺寸；H4–H6 没有完整层级映射 | `src/styles/composer.css`、`documentParser.ts` | 长文标题层级会在低级标题处失真 |
| 引用固定为 15px / 1.65，callout 保留独立蓝色族 | `src/styles/composer.css` | Typography 与 accent 切换不能稳定覆盖全部文档元素 |
| Parser 已区分 22 种顶层 Block kind，并保留未知源码 | `src/core/composer/types.ts` | 主题覆盖必须按真实 block taxonomy 建立，不能只看段落和代码块 |
| 编辑与纯净阅读共享同一份文档；原生 Markdown 是同 leaf 转换 | `DisplayStateSwitch.tsx`、现有 Composer 设计稿 | 视觉设置应跨编辑/阅读一致，交互 chrome 另行治理 |
| Theme Lab 目前只有一张 Composer coverage board | `docs/design-system-playground.html` | 能看总体感觉，不能审查每种 Markdown 元素和状态 |

根因不是“缺少更多 CSS 参数”，而是文档语义、主题角色与编辑状态没有明确分层。继续增加 `.pk-composer-*` 局部值只会形成第六套视觉系统。

## 3. 目标与非目标

### 3.1 目标

- 一次切换能同时观察标题、正文、列表、引用、callout、代码、表格、公式、媒体、脚注和行内语义。
- 80% 的调整通过完整预设和 6 个快速控件完成。
- 高级用户可以覆盖单个元素族，但只能使用有范围、有回退的结构化字段。
- 编辑视图与纯净阅读使用同一文档排版；编辑提示保持清晰且不会改变内容几何。
- Light / Dark、CJK / Latin、长文、超长表格和代码溢出都可以验证。
- Theme 文件可版本化、预览、导入、导出、局部重置和整体回滚。

### 3.2 非目标

- 不提供任意 CSS 编辑器、selector 注入或 Obsidian CSS snippet 兼容层。
- 不允许 Theme 改变 Block 顺序、工具栏命令、AI 能力或 Markdown 序列化。
- 第一阶段不支持按单篇文档写 frontmatter 主题，避免 Vault 内视觉碎片化。
- 不追求 Composer 与原生 Obsidian Markdown 的视觉一致；两者要求的是源码与语义一致。
- 不让 Density 缩小正文到不可读，也不让 Theme 缩小按钮 hit target。

## 4. 配置解析顺序

```text
Peak Theme Pack
  -> Composer built-in preset
  -> validated quick overrides
  -> validated element overrides
  -> resolved --pk-doc-* semantic tokens
  -> Composer document elements

Editor interaction state
  -> --pk-editor-* state tokens
  -> focus / selection / hover / AI diff / block chrome
```

关键边界：`--pk-doc-*` 只描述文档内容与纸张；`--pk-editor-*` 只描述编辑状态。一个预设可以让正文更安静，但不能把 caret、focus ring、selected range 或 pending AI change 降成不可见。

## 5. 用户如何快速调整

### 5.1 默认路径

Theme Lab 的 Composer 工作台按以下顺序纵向排列：

1. 选择文档预设。
2. 在同一行切换“编辑视图 / 纯净阅读”，比较同一内容。
3. 调整 6 个快速项，整篇固定试件立即更新。
4. 需要时展开元素细节；每一组都有“恢复预设”。
5. 复制 Theme JSON，得到全局 Theme 与 Composer 子配置的一个文件。

### 5.2 初始预设

| 预设 | 主要用途 | 固定倾向 |
| --- | --- | --- |
| Peak Default | 一般知识编辑 | 15px 正文、标准行宽、清晰标题、平静纸张 |
| Research Compact | 资料密集、提纲和长列表 | 较窄段间距、紧凑列表与表格、代码偏紧 |
| Longform | 长文阅读与写作 | 阅读字体、更舒展行高、较窄行宽、弱化 chrome |
| Editorial | 对外文章与视觉叙事 | 标题反差更强、媒体更突出、正文节奏更明显 |

预设是完整且经过 Light / Dark 验证的组合，不是只改变字体的“主题名称”。修改任意快速项后，UI 显示“自定义自 Peak Default”，同时保留一键回到预设。

### 5.3 六个快速项

| 快速项 | 修改范围 | 不得修改 |
| --- | --- | --- |
| 字体组合 | 正文、标题、mono 的角色映射 | 控件字体与图标 |
| 正文大小 | 正文及从属 inline 元素 | 按钮 hit target、meta 字号 |
| 内容行宽 | 纸张中的阅读 measure | Composer sidecar 与工具栏宽度 |
| 行高 | 段落、列表、引用的阅读节奏 | 代码和表格的独立密度 |
| 段间距 | 连续正文 Block 的垂直节奏 | 对象块内部 padding |
| 标题强调 | 标题比例、字重与上下间距 | 标题语义级别和折叠层级 |

快速项使用枚举或带明确范围、实时数值和即时预览的 slider；不能出现“拖了但不知道当前值”的盲调。高级面板只处理低频元素族，并同样显示有效范围。

## 6. Markdown 元素覆盖

工作台必须用一篇纵向固定文档同时覆盖以下内容。它不是 Composer 产品 DOM 的像素复刻，而是主题审查试件。

| 元素组 | 必须出现 | 可调角色 |
| --- | --- | --- |
| 文档框架 | canvas、paper、content measure、页边距 | 纸张表面、边框、阴影、宽度、padding |
| 标题 | H1–H6、标题后的第一段 | scale、weight、line-height、前后间距、分隔方式 |
| 正文 | 多段 CJK / Latin 混排、长链接 | body font、size、line-height、paragraph gap |
| 行内语义 | strong、em、delete、highlight、link、wikilink、tag、inline code、inline math | 颜色、下划线、背景、字重；不改变源码语义 |
| 列表 | 无序、有序、嵌套、task、完成态 | marker、indent、row gap、checked treatment |
| 强调块 | quote、note/tip/warning callout、divider | border、tint、title/body 层级、内边距 |
| 技术内容 | code fence、Mermaid、display math、Dataview fallback | mono、code surface、overflow、math scale |
| 结构内容 | table、frontmatter、footnote | header、cell density、row divider、supporting text |
| 媒体与嵌入 | image、caption、embed/native object | flush/framed、caption、placeholder、object surface |
| 未知内容 | raw HTML / unknown verbatim fallback | 可读 mono fallback；不静默隐藏 |

H4–H6 必须保持可辨认，但不复制 H1–H3 的巨大比例。建议采用 H1 作为文档标题，H2/H3 建立主要结构，H4–H6 主要通过字重、间距和细小尺寸差建立层级。

## 7. 编辑状态独立于文档样式

### 7.1 工作台固定展示的状态

- Resting paragraph；
- 真实 hover block；
- focused editable leaf 与 caret；
- native text selection 与跨 Block selection；
- selected list/table unit；
- pending AI addition；
- inline rewrite diff；
- disabled / loading / error object state；
- 附着 action row 与 selection toolbar。

### 7.2 几何规则

- Focus、hover 和 selection 只能增加 overlay、ring、rail 或 tint，不得改变正文宽度、行高和 Block margin。
- 编辑视图显示结构发现性；纯净阅读移除 block rail、action row、editable focus 与候选工具，但保留已接受内容。
- `prefers-reduced-motion` 下，主题切换和状态切换立即完成；标准模式只允许 100–180ms 的颜色/阴影过渡。
- 不对标题缩放、段落 reflow 或整页行宽变化做弹簧动画。

## 8. Theme JSON 提议

下面是拟议结构，不是当前生产接口。

```ts
// proposed
interface PeakThemeFileV3 {
  version: 3;
  theme: PeakThemeState;
  composer: {
    preset: 'peak-default' | 'research-compact' | 'longform' | 'editorial';
    overrides: {
      fontPair?: 'interface' | 'reading-serif' | 'hybrid';
      bodySizePx?: number;        // 14..18
      contentMeasurePx?: number;  // 620..920
      bodyLineHeight?: number;    // 1.5..2.0
      paragraphGapPx?: number;    // 6..24
      headingEmphasis?: 'quiet' | 'clear' | 'strong';
      listIndentPx?: number;      // 16..32
      listGapPx?: number;         // 0..10
      quoteStyle?: 'rail' | 'tint' | 'plain';
      calloutStyle?: 'outlined' | 'tinted' | 'quiet';
      codeSurface?: 'flat' | 'outlined' | 'raised';
      tableDensity?: 'compact' | 'comfortable';
      mediaFrame?: 'flush' | 'framed' | 'soft';
      mathScale?: 'compact' | 'default' | 'large';
    };
  };
}
```

规则：

- `preset` 先给出完整默认值，`overrides` 只保存用户改过的字段。
- 所有数值在导入时 clamp；枚举无效则删除该 override，回退到 preset。
- Preview state、当前滚动位置、编辑/阅读切换不进入 Theme JSON。
- 导入前展示差异摘要；应用后可一次回滚到导入前状态。
- Theme JSON 不接受 CSS 字符串、selector、URL 或字体文件路径。

## 9. Token 分层

生产实现不应让组件读取 `composer.preset` 名称。Theme resolver 把 schema 转成稳定语义 token。

### 9.1 文档 token

```css
/* proposed names */
--pk-doc-canvas;
--pk-doc-paper;
--pk-doc-paper-border;
--pk-doc-paper-shadow;
--pk-doc-measure;
--pk-doc-padding-inline;
--pk-doc-body-font;
--pk-doc-body-size;
--pk-doc-body-line-height;
--pk-doc-paragraph-gap;
--pk-doc-heading-1-size;
--pk-doc-heading-2-size;
--pk-doc-heading-3-size;
--pk-doc-heading-4-size;
--pk-doc-heading-5-size;
--pk-doc-heading-6-size;
--pk-doc-list-indent;
--pk-doc-list-gap;
--pk-doc-quote-border;
--pk-doc-code-surface;
--pk-doc-table-row-height;
--pk-doc-media-radius;
```

颜色继续来自全局 semantic roles。Composer resolver 只组合、混合或选择角色，不创造主题专属 hex。

### 9.2 编辑状态 token

```css
/* proposed names */
--pk-editor-hover-bg;
--pk-editor-focus-ring;
--pk-editor-selection-bg;
--pk-editor-block-rail;
--pk-editor-ai-addition-bg;
--pk-editor-ai-deletion-bg;
--pk-editor-pending-border;
```

这些 token 不出现在用户的 Markdown 元素面板里。它们由全局 accent、semantic states、appearance 和 accessibility rules 派生。

## 10. Obsidian 与原生 Markdown 边界

Composer 继续在 `peak-design-root` 内完整自治。宿主可以提供 Light / Dark intent，但不能提供字体、颜色、圆角、heading margin、blockquote、table 或 code 的视觉值。

“原生 Markdown parity”只表示：

- 保存的 Markdown / canonical HTML 字节正确；
- wikilink、embed、code、formula 和 footnote 语义不丢失；
- 同一文件在两个 view 间转换时内容身份不变。

它不表示原生 Obsidian Markdown 必须跟随 Composer Theme。若未来需要把 Peak 文档样式导出为 Obsidian snippet，应作为单独、显式、可撤销的输出能力设计，不能反向恢复宿主继承。

## 11. 实现顺序

### Phase 0：主题试件与现状 characterization

- 扩充 Theme Lab Composer 工作台，覆盖本设计的元素与状态。
- 为当前生产 Composer 锁定 Light / Dark、编辑 / 阅读、CJK / Latin 基准截图。
- 记录所有 `--pkc-*`、固定 font-size、固定 line-height 与局部颜色。

### Phase 1：schema 与 resolver

- 引入 versioned Composer theme config、preset registry、validation 和 fallback。
- 只生成 `--pk-doc-*` / `--pk-editor-*`；不改 DOM。
- 增加 import/export、preset reset、group reset 和 rollback tests。

### Phase 2：生产 CSS 收敛

- 先迁移 paper、body、H1–H6、paragraph、list、quote 和 callout。
- 再迁移 code、table、math、frontmatter、media 与 native object。
- 删除被稳定 token 完全替代的 `--pkc-*`；不得保留两套并行 source of truth。

### Phase 3：设置入口与真实验收

- 在 Peak 自己的 Appearance 设置加入 Composer 文档样式入口。
- Preview 在隔离 root 中完成，不向 Obsidian 页面写 selector。
- 通过 CDP 验证 computed typography、geometry、focus、selection 与 theme switch。

## 12. 验证矩阵

| 范围 | 自动验证 | 真实 Obsidian |
| --- | --- | --- |
| Schema | version、enum、range、fallback、migration | 导入、撤销、重开后保持 |
| Theme | 4 presets × Light/Dark × compact/comfortable | 无闪烁、无宿主侵入 |
| Markdown | 每个元素组有 DOM/token contract | CJK/Latin、长文、真实 Vault 内容 |
| 编辑状态 | focus/selection/diff 不改变几何 | caret、IME、hover corridor、keyboard |
| 溢出 | code/table/media bounded | 缩放、窄 leaf、sidecar 打开 |
| 可达性 | contrast、focus-visible、reduced motion | 键盘流程与 screen reader labels |

工作台和 harness 只能证明配置解析与参考视觉，不能升级为真实 Obsidian 验收。未完成 CDP 流程时必须写 `INTERACTION NOT VERIFIED`。

## 13. 主要风险与禁止路径

| 风险 | 防线 |
| --- | --- |
| 参数太多，用户无法建立整体风格 | 默认只显示预设 + 6 个快速项 |
| 高级 override 产生不可读组合 | range clamp、contrast check、逐组 reset、fallback |
| 文档 Theme 误伤工具栏与 sidecar | `--pk-doc-*` 与 `--pk-editor-*` / global UI token 分离 |
| 编辑/阅读切换发生 reflow | 两者共享 document tokens；只改变 chrome visibility |
| Obsidian theme 重新侵入 | autonomous root、reset、Portal ownerDocument、computed-style QA |
| Composer 与原生 view 看起来不同被误判为 bug | 文档明确区分语义 parity 与视觉 autonomy |
| 为兼容旧 CSS 长期保留两套值 | Phase 2 逐族替换后删除旧 token，不双写 |

禁止把每个 preset 实现为 `.theme-longform .pk-composer-*` 的条件分支。Preset 名称只存在于 resolver 输入；组件最终只读取语义 token。

## 14. Owner review 的三个决定

在进入生产实现前，只需要确认三件事：

1. 初始四套文档预设的用途是否正确；名称可以调整，职责不要重叠。
2. 第一阶段是否只做 Vault / workspace 级默认，不允许 per-document override。
3. 高级设置是否保留精确数值，或首版只开放受控枚举。

其余实现细节可以由本规范、真实 Composer CSS 和 Theme Lab 试件共同驱动，不再通过零散页面级 CSS 决定。
