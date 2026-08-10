# Peak UI Catalog 与 Theme Lab 设计

> 状态：implemented in docs-only reference surfaces
> 日期：2026-08-10
> 读者：Peak 产品负责人、UI 维护者、后续实现代理
> 范围：文档与可交互参考实现；不修改生产 React、CSS bundle 或运行时

## 1. 为什么需要这两个页面

旧的 `design-system.html` 和 `design-system-playground.html` 把设计原则、通用组件、产品场景和旧设计稿混在同一个页面里。它能展示颜色和几个近似 mock，但不能回答四个关键问题：

1. 录屏里的真实页面和交互状态是否被覆盖；
2. 一个 scene 对应哪些生产组件和既有设计稿；
3. Theme、Light/Dark、Density、Radius、Typography、Elevation、Motion 改动后，所有场景是否同时变化；
4. 页面变更后，如何自动发现引用失效、状态缺失和主题旁路。

本方案把职责拆成两个入口，但只保留一套主题运行时和一份场景清单：

- `docs/design-system.html`：定义允许变化的主题轴、语义 token、组件状态和 Obsidian 宿主边界；
- `docs/design-system-playground.html`：展示真实产品界面的结构镜像、交互状态和录屏参照；
- `docs/ui-system/`：共享主题、Catalog 清单、场景样式、运行时与校验器。

## 2. 第一原则约束

### 2.1 必须保留

- 录屏中的真实布局比例、控件层级和主要状态；
- `real UI -> recording frame -> production source -> tracked design artifact` 的可追溯关系；
- 两个页面共享同一 Theme State，并可通过 BroadcastChannel、opener postMessage 和 localStorage 同步；
- 所有交互都在同一 DOM 中运行，不用 iframe，也不复制旧 HTML runtime；
- 所有产品颜色只读取 `--pk-*` 语义变量，场景不能拥有自己的主题色。

### 2.2 明确删除

- 以“像某个产品”为目标的通用 mock；
- 只平铺几张卡片、没有状态转换的组件画廊；
- 两个新入口对 iframe 预览桥和旧页面 DOM 全局 CSS 注入的依赖；历史设计稿仍可为其独立预览保留兼容脚本，但不得进入新 Catalog runtime；
- 把 Result Graph、File Atlas Graph、AI Graph 当成同一个 Graph；
- 在 scene CSS 中散落主题 hex，或引用 Obsidian `--background-*` / `--text-*` 变量。

### 2.3 重要取舍

生产 React runtime 不直接装入文档页。Catalog 使用“结构镜像”：DOM anatomy、状态名称、交互路径和主题契约与生产实现对齐，但数据使用静态 fixture。这样可以直接 `file://` 打开、稳定复现状态，也不会启动索引、模型、数据库或 Obsidian API。

结构镜像不能冒充真实运行验收。它用于主题与结构回归；真实 Obsidian 的焦点、键盘、拖拽、流式输出和几何仍按 `docs/conventions/obsidian-real-ui-qa.md` 验证。

## 3. 信息架构

```text
docs/design-system.html
  -> theme controls
  -> semantic tokens
  -> foundations
  -> shared component states
  -> host boundary

docs/design-system-playground.html
  -> catalog filters
  -> product scene mirrors
  -> state and interaction controls
  -> recording reference viewer
  -> source/design evidence

docs/ui-system/
  -> theme-packs.js        theme schema and built-in packs
  -> theme-runtime.js      resolve/apply/sync/import/export
  -> theme.css             autonomous root and shared primitives
  -> design-system.css     Theme Lab presentation
  -> catalog-manifest.js   screen/state/source/reference inventory
  -> catalog-runtime.js    scene state machines and reference viewer
  -> ui-catalog.css        product scene anatomy
  -> validate.mjs          static contract checks
  -> evidence/             normalized recording keyframes
```

## 4. 录屏场景清单

录屏：`iShot_2026-08-10_16.23.51.mp4`，145.13 秒，3456×2168，SHA-256 `87441fc768b532d227cb396965510058cae8017dcb26da794faa23f0752e62df`。

| 场景 | 录屏状态 | Catalog 必须可操作的状态 |
| --- | --- | --- |
| Vault Search | List、Tree、Graph、Compact/Detailed、Key Tips | 视图切换、密度切换、结果选择、Inspector、Graph preset、Semantic |
| AI Search | Report、Sources List/Tree/Graph | 底部 workspace 切换、source 投影切换、source 选择 |
| Vault Intelligence | Health、metrics、community、issues | metric 选择、Run review 状态 |
| File Atlas | Tree、Graph、file rail、Inspector | 文件选择、Tree/Graph、scope、layout、Inspector |
| Composer | 文档、选中块、列表 action、公式、callout | display state、block selection、action bar、评论标记 |
| Composer Intelligence | Copilot、History、Related Materials、AI Graph | sidecar tab、material modal、AI Graph overlay、关闭/返回 |
| Chat Studio | Empty、Gallery、status/error、Outline/Resources | 会话选择、空态/内容态、右栏 tab、composer focus |
| Settings / Usage | Overview、AI Setup、Media Generation、Usage | tab 切换、preset 选择、segmented control、usage period |

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
```

Theme Pack 只提供基础角色：canvas、surface、raised、sunken、text、muted、border、accent 和 semantic colors。运行时负责派生 hover、selected、soft border、shadow、radius、type scale 和 motion。Scene 不得读取 pack 名，也不得根据 pack 写分支。

主题导入必须先验证 pack/axis 枚举和 accent hex；非法字段回退到当前值。导出 JSON 是 Theme Pack 定义的最小可交换格式，不包含 scene state。

## 6. Obsidian 宿主拒绝策略

Peak 视觉完全自治，Obsidian 只提供挂载位置和可选的外观意图。边界分三层：

1. 每个完全自治的 surface 根必须带 `pktw-root peak-design-root`；
2. Portal 只能挂到带相同 scope 的 ownerDocument portal host；
3. button/input/select/textarea 和标题/链接等裸标签在 root 内先 reset，再由 Peak primitive 显式声明 geometry、状态和焦点。

禁止从 Obsidian 继承颜色、字体、圆角、阴影、控件高度和 hover transform。若产品选择“跟随宿主 Light/Dark”，只读取稳定的 appearance intent，不读取宿主主题变量。

## 7. 自动化门槛

`node docs/ui-system/validate.mjs` 必须检查：

- 两个入口同时加载共享 production tokens、Theme runtime 和 Theme Pack；
- Catalog 的 scene id、state id、production/design/reference 路径全部存在；
- 每个清单状态在 HTML 中有对应可点击 control 或 panel；
- 不存在 iframe、Obsidian theme variable、scene-local theme hex；
- 所有录屏证据文件存在，SHA 和时间码有登记；
- Theme controls 与 `PeakThemeState` 字段一一对应；
- 页面 anchor 和 cross-page links 存在。

## 8. 更新方式

新增或修改产品 UI 时，先改 `catalog-manifest.js`：登记 scene、状态、生产源、设计稿和录屏/截图。随后修改结构镜像并运行校验。若只改 Theme Pack，不应修改任何 scene HTML；若 scene 需要额外颜色，先增加语义 token，再由 Theme Pack 解析。

视觉核对至少包含：录屏/真实截图、Catalog 当前状态、相同 Theme State。没有真实 Obsidian 环境时只能结论为文档镜像已验证，不能升级为产品交互验收。
