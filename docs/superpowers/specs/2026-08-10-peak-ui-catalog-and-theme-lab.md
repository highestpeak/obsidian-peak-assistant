# Peak Design System、Theme Lab 与 UI Inventory 设计

> 状态：implemented in docs-only reference surfaces
> 日期：2026-08-10
> 读者：Peak 产品负责人、UI 维护者、后续实现代理
> 范围：文档与可交互参考实现；不修改生产 React、CSS bundle 或运行时

## 1. 决策

Design System 文档不能同时承担“定义规则”“查看换肤感觉”和“复刻真实产品”三种职责。静态 HTML 一旦手工重画完整 Search、Composer、Graph、File Atlas 或 Chat，就会出现元素多/少、错位和过期，并让文档夹具冒充产品事实。

本方案拆成三个入口：

- `docs/design-system.html`：设计规则、Foundation、Theme Schema 与 Obsidian Host Boundary；
- `docs/design-system-playground.html`：Theme Lab，用固定内容、固定几何和标准试件判断整体主题；
- `docs/ui-inventory.html`：UI Inventory，用真实录屏帧、源码和设计稿记录产品原貌；
- `docs/ui-system/`：共享 Theme Pack、运行时、真实证据清单、文档样式与静态校验。

三个入口共享 Theme State，但只有 Theme Lab 的标准试件用于判断 Theme。UI Inventory 的截图不会随 Theme 改变；其页面 chrome 可以同步主题，但证据保持原样。

对 owner 而言，`docs/design-system-playground.html` 是唯一需要打开的可操作入口：全局 Theme、Composer 文档主题、组件覆盖、代表场景、固定主题图、完整 Theme JSON 和关键边界说明都必须在本页完成。Design System、UI Inventory 与 specs 是规则、证据和实现依据，不是操作工作流中的必经跳转。

## 2. 三层证据边界

| 层 | 回答的问题 | 允许的实现 | 禁止冒充 |
| --- | --- | --- | --- |
| Design System | 哪些角色、规则和边界必须统一 | 原则、token、schema、组件状态 contract | 真实产品实现 |
| Theme Lab | 换 Theme 后整体感觉是否协调 | 标准 primitives 与代表性 scene specimens | Search / Composer 等完整页面复刻 |
| UI Inventory | 产品界面实际上长什么样 | 真实截图/录屏、状态、源码和设计文件 | 可交互 Theme 预览 |
| Obsidian QA | 几何与交互是否真的正确 | CDP + 实机截图/录屏 | 文档页或 harness 验收 |

因此：

- Theme Lab 的场景只保留决定观感的结构与关键状态；
- UI Inventory 以真实帧为第一视觉内容，不再维护产品 DOM 镜像；
- 焦点、键盘、拖拽、流式输出、Portal 和宿主侵入只在真实 Obsidian 验证；
- 文档构建或截图相似不能升级为产品验收。

## 3. Theme Lab 标准试件

### 3.1 Foundations

- semantic color roles：canvas、surface、sunken、text、border、accent；
- type ladder：page、section、component、body、supporting、meta；
- radius/elevation：control、panel、overlay、pill；
- density 与 motion：只改变各自职责，不缩放整页。

### 3.2 Shared primitives

- Primary / secondary / ghost / disabled actions；
- segmented selection、chip 和 semantic status；
- search/input、setting row、switch；
- Rest、Hover、Focus、Selected、Disabled、Loading、Error contract。

### 3.3 Visual coverage boards

为了让 Theme 判断不局限于几个孤立控件，Theme Lab 固定维护 8 块产品派生的中等保真组合。它们共享 Theme State，但不复制生产组件的完整数据与业务逻辑：

- control strips：产品 Tab、List / Tree / Graph、density、底栏动作和五态钉住对照；
- inputs & elevation：flat / outlined / raised / error / disabled / focus，以及四级 surface 深度；
- report & mixed content：长文本、引用、来源、行内动作与底部工作区；
- dashboard：health banner、4 metric cards、community map、issue queue 与 top hubs；
- Composer Markdown：标题、段落、行内语法、列表、选中块、附着动作、callout、editable paragraph、code 与 table；
- File Atlas inspector：分区导航、正文预览、quick actions、keywords 和 statistics；
- graph system：两级工具栏、range、layout、edge 与 selected / hover / related / muted node；
- long outline：至少 27 行、分组、滚动、连续选择、hover、warning 与 error。

每块 coverage board 必须满足：固定内容与几何；只消费 `--pk-*`；真实 hover 可操作且关键状态可固定比较；Theme Pack、Light / Dark、Density、Radius、Typography、Elevation 与 Motion 切换后同时更新。新增高频 UI 组合时必须同步补覆盖板与 `validate.mjs` 约束，避免文档悄悄退化成少量展示卡。

### 3.4 Representative scenes

- Search result row：层级、选中态、score 与 density；
- Composer document block：文档表面、选区、附着动作；
- Chat message + composer：消息层级、来源、输入与 primary action；
- Graph canvas：node、edge、selection、semantic label 与 toolbar；
- Overlay feedback：surface elevation、warning、error、loading 与 stable geometry。

标准试件允许使用文档专属布局 class，因为它们明确不是生产页面镜像；所有视觉值仍只能消费 `--pk-*` semantic token。

### 3.5 Composer document theme workshop

Composer 不再只依赖 coverage board 判断总体感觉。Theme Lab 另有一块纵向文档主题工作台，固定覆盖 H1–H6、正文行内语义、四类列表、quote、callout、divider、focused paragraph、AI diff、code、table、formula、media、embed、Dataview、footnote 与 unknown fallback。

工作台遵守三条边界：

- 全局 Theme State 继续控制 color、appearance、density、radius、typography、elevation 与 motion；
- `composer.preset + overrides` 只解析为 `--pk-doc-*` 文档 token；
- Edit / Clean 只显示或移除 editor chrome，不进入 Theme JSON，也不制造第二份 Markdown 内容。

默认只展示四个完整 preset 与六个高频调节；列表、引用、Callout、代码、表格、媒体和公式进入 Advanced overrides。完整字段、范围、生产迁移与验收见 [`Composer Markdown 主题与快速定制设计`](./2026-08-12-composer-markdown-theme-customization.md)。

## 4. UI Inventory 清单

录屏：`iShot_2026-08-10_16.23.51.mp4`，145.13 秒，3456×2168，SHA-256 `87441fc768b532d227cb396965510058cae8017dcb26da794faa23f0752e62df`。

| 产品域 | 已锁定的真实帧 |
| --- | --- |
| Vault Search | List、Tree、Graph |
| AI Search | Report、Sources |
| Vault Intelligence | Overview |
| File Atlas | Tree / Inspector、Graph |
| Composer | Selection |
| Composer Intelligence | Sidecar、Related Materials、AI Graph |
| Chat Studio | Empty、Gallery、Message states |
| Settings / Usage | Overview、AI Setup、Media、Provider & Model |

每个 Inventory 项必须拥有：

1. 产品职责；
2. 状态清单；
3. 一张或多张真实截图/录屏帧及时间码；
4. 生产组件路径；
5. 已有设计稿路径；
6. 明确的验收边界说明。

新增 UI 时先更新 `catalog-manifest.js`，不在 Inventory 写第二套产品 DOM。

## 5. Theme State 与 Theme Pack

```ts
interface PeakThemeState {
  pack: 'violet' | 'ink' | 'moss' | 'ocean';
  appearance: 'light' | 'dark';
  density: 'compact' | 'comfortable';
  radius: 'square' | 'balanced' | 'soft';
  typography: 'compact' | 'default' | 'large';
  elevation: 'flat' | 'subtle' | 'layered';
  motion: 'reduced' | 'standard';
  accent: string;
}

interface PeakThemeFileV3 {
  version: 3;
  theme: PeakThemeState;
  composer: {
    preset: 'peak-default' | 'research-compact' | 'longform' | 'editorial';
    overrides: Record<string, string | number>;
  };
}
```

Theme Pack 提供 canvas、surface、raised、sunken、text、muted、border、accent 和 semantic colors。运行时派生 hover、selected、soft border、shadow、radius、type scale 与 motion。任何 specimen 或生产组件不得根据 pack 名写视觉分支。

主题导入必须验证全局枚举、accent、Composer preset 与每个 override 的枚举/数值范围；无效值安全回落。后续允许扩展完整 Light/Dark palette recipe，但 schema 必须版本化、可预览、可回退，不能把任意 CSS 当作 Theme Pack 导入。

Theme Lab 不维护独立 Header 或“锁定/未锁定”状态。Theme State 是页面唯一的 sticky surface，并融合章节导航、Design System 和 UI Inventory 入口；折叠后完整表单从键盘 focus order 移除，但标题、7 个枚举 Theme 轴、Accent、导航和展开保持在同一行，紧凑图标区或导航空间不足时自身横向滚动而不换行。枚举轴 icon button 不允许盲目循环值：点击后必须打开共享的小型 option popover，展示轴名称、当前值、全部选项和选中勾，明确选择后才应用；Popover 支持再次点击、outside click 和 Escape 关闭并恢复触发器焦点；Accent 继续使用系统 color input。只有折叠状态使用独立 localStorage key，不能进入 Theme JSON、Theme BroadcastChannel 或生产 schema。SVG symbol sprite 必须为零尺寸并脱离文档流，避免浏览器默认 SVG intrinsic size 制造首屏空白。

## 6. Codex 固定图片替换

LLM 图像生成适合高带宽探索整体气质，但 Theme Lab 不承担图片上传、外部模型调用或 Prompt 搬运。它在页面中直接展示 19 个固定输出文件，覆盖 8 个产品域：

```text
docs/ui-system/theme-concepts/current/*.jpg
```

这些固定槽位与只读录屏来源登记在 `theme-concepts/manifest.json`。用户在 Theme Lab 调整 Theme、复制当前 JSON，然后在 Codex 中打开 `design-system-playground.html`，要求 Codex 按该 JSON 重新生成全部图片或指定产品域。HTML 路径不变，刷新即显示新结果。页面按产品域纵向分组，每张图片接近 1280px 原始宽度展示，并可单独打开原始文件。

Codex 必须遵守：

- 读取当前固定图片、Theme JSON 和 manifest；
- 保持原图信息架构、主要元素和几何，替换主题气质；
- 只写 `theme-concepts/current/`，不得覆盖 `evidence/`；
- 不把生成图直接写进生产 CSS；
- 生成图只是方向预览，真正可应用的主题仍由 Theme Pack / Theme JSON 驱动并经过 Light/Dark、状态、对比度和 fallback 校验。

## 7. Obsidian 宿主拒绝策略

Peak 视觉完全自治，Obsidian 只提供挂载位置和可选 appearance intent：

1. 完全自治 surface 根带 `pktw-root peak-design-root`；
2. Portal 挂到带相同 scope 的 ownerDocument portal host；
3. root 内重建 font、color、line-height、box sizing 与控件 reset；
4. 固定 hit target 显式声明 width / height / min / max / padding；
5. 旧 production selector 需要 Obsidian 名称时，只能由 `host-compat.css` 反向绑定到 `--pk-*`；
6. 生产组件和文档试件不得直接消费 Obsidian theme variable。

“Follow host”若将来存在，也只读取 Light/Dark 意图，不读取宿主颜色、圆角、字体和控件几何。

## 8. 自动化门槛

`node docs/ui-system/validate.mjs` 必须检查：

- 三个入口都有且只拥有一个 autonomous root；
- Theme Lab 覆盖 Theme State 的全部轴、Foundation、primitive、代表性 scene 与 AI bridge；
- Composer 工作台覆盖四个 preset、六个 quick controls、八个 advanced controls、Edit/Clean 与完整 Markdown 元素压力样张；
- UI Inventory 的 scene、state、production/design/reference 路径全部存在；
- Inventory 的真实证据 SHA 与时间码匹配 manifest；
- Theme Lab 和 UI Inventory 都没有 iframe；
- specimen/inventory CSS 不含主题 hex 或 Obsidian theme variable；
- UI Inventory 不再出现手工重画的产品 anatomy contract；
- 所有 anchor、cross-page link、script 和 stylesheet 均可解析。

## 9. 更新与验收

- 只改 Theme Pack：不修改 Inventory，也不修改标准试件几何；
- 新增视觉角色：先进入 Design System，再进入 Theme runtime，最后由 specimen 覆盖；
- 新增产品 UI：更新 Inventory manifest 与真实证据，不重画完整 HTML scene；
- Codex 探索主题：覆盖固定 theme-concept 图片槽位并保留只读 evidence；只有通过 schema、Light/Dark、状态和对比度验证后才能成为 Theme Pack；
- 文档页只做设计与证据管理。真实 Obsidian 没有完成 QA 时，结论必须保持 `INTERACTION NOT VERIFIED`。
