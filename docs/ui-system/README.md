# Peak UI System docs

这个目录维护三个职责严格分开的文档表面，共享同一套 Theme Pack 与语义 token：

- `../design-system.html`：设计约束、Foundation、Theme Schema 与 Obsidian Host Boundary；
- `../design-system-playground.html`：Theme Lab，用固定几何和标准试件观察整体换肤效果；
- `../ui-inventory.html`：UI Inventory，只用真实截图/录屏、生产源码与设计稿说明产品原貌。

## 维护顺序

1. 设计规则或 Theme Schema 变化时，先更新 `design-system.html`；
2. 新视觉角色进入 `theme-packs.js` / `theme-runtime.js`，标准试件只能消费 `--pk-*` 语义 token；
3. 新产品界面在 `catalog-manifest.js` 登记 scene、state、production source、design reference 与真实截图；
4. UI Inventory 不重画产品界面，Theme Lab 不承诺产品像素复刻；
5. 运行 `node docs/ui-system/validate.mjs`；
6. 真实交互仍按 `docs/conventions/obsidian-real-ui-qa.md` 在 Obsidian 验收。

## Theme Lab 视觉覆盖板

Theme Lab 除了 Foundations、共享 primitives 和代表性场景，还维护 8 个产品派生的中等保真覆盖板。它们固定信息结构、内容与几何，用同一套 `--pk-*` 语义 token 检查整体主题，而不是复刻第二套产品：

1. 控制条：产品 Tab、List / Tree / Graph、Compact / Detailed、工作区底栏，以及 Rest / Hover / Focus / Selected / Disabled；
2. 输入与深度：flat、outlined、raised、error、disabled、focus 输入，以及 flat / bordered / raised / overlay surface；
3. Report：长文本、引用、来源卡、行内 Ask / Revise / Copy 和底部动作区；
4. Dashboard：健康总览、4 个指标卡、关系图、问题列表与 Top hubs；
5. Composer Markdown：标题、段落、行内语法、列表、选中块、附着工具栏、callout、可编辑段落、代码和表格；
6. File Atlas：多分区导航、正文预览、Quick actions、关键词频率和统计；
7. Graph：两层工具栏、关系范围、布局、selected / hover / related / muted 节点与边；
8. Long Outline：27 行分组长列表、连续选择、错误、hover 和滚动密度。

新增视觉角色或高频 UI 组合时，必须先判断属于现有覆盖板还是需要新增 coverage contract，并同步扩展 `validate.mjs`。真实组件结构、数据和像素仍以 UI Inventory 与 Obsidian 实机为准。

Theme Lab 不维护独立的全局 Header，也没有“锁定/未锁定”状态。Theme State 是页面唯一的 sticky surface，并融合基础、组件、视觉覆盖、场景、主题图、规则和真实 UI 导航；折叠后标题、7 个枚举 Theme 轴、Accent 色块、导航与展开保持在同一行，空间不足时只允许图标区或导航内部横向滚动。点击枚举轴图标弹出小型 option popover，显示轴名称、当前值、所有可选值和选中勾，用户明确选择后才应用；再次点击、点击外部或 Escape 关闭并恢复焦点。Accent 继续使用系统颜色选择器。只有折叠偏好进入独立 localStorage key，不进入 Theme JSON，也不跨页面广播。页面开头的 SVG symbol sprite 必须保持零尺寸并脱离文档流，禁止重新引入首屏空白。

## Codex 固定图片换肤

Theme Lab 直接展示 19 个固定的 repo-local 图片槽位，覆盖 Vault Search、AI Search、Vault Intelligence、File Atlas、Composer、Composer Intelligence、Chat Studio、Settings & Usage。全部输出位于 `theme-concepts/current/*.jpg`，按产品域单列大图展示并可点击查看原始 1280×802 文件。

槽位与只读录屏来源登记在 `theme-concepts/manifest.json`。上方 Theme 控件调整完成后，复制当前 Theme JSON，在 Codex 中打开 `design-system-playground.html` 并要求按 JSON 替换全部图片或指定产品域。Codex 直接读取现有图片和 manifest，生成后覆盖对应固定文件；页面不提供上传控件，也不要求用户复制另一段 Prompt。

`evidence/` 永远是只读真实证据，不能被生成图覆盖。固定主题图用于视觉方向；真正可应用的产物仍必须是通过 schema 校验的 Theme JSON，并补齐：

- Light 与 Dark；
- Rest、Hover、Focus、Selected、Disabled、Loading 与 Error；
- 文字、按钮和状态色对比度；
- radius、elevation、density、typography 与 motion 角色；
- 无效 recipe 的 fallback。

## 禁止事项

- 不把设计稿 iframe 到页面；
- 不为 Search、Composer、Chat、Graph 或 File Atlas 另写一个“看起来差不多”的完整 HTML 产品；
- 不在 scene/specimen CSS 写主题 hex 或读取 Obsidian theme variable；
- 不把生成图、文档夹具或构建通过冒充真实 Obsidian 验收；
- 不在 Theme Lab 增加图片上传、Prompt 搬运或外部模型 API 流程。
