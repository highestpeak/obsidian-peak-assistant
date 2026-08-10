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

## LLM 图片换肤

推荐使用 Theme Lab 的固定试件截图作为 image-to-image 输入，要求模型不增删元素、不改变内容和几何，只替换配色、字体气质、圆角与材质表达。生成图可以导回 Theme Lab 并排比较，但不能直接成为 Theme Pack。

真正可应用的产物必须是通过 schema 校验的 Theme JSON，并补齐：

- Light 与 Dark；
- Rest、Hover、Focus、Selected、Disabled、Loading 与 Error；
- 文字、按钮和状态色对比度；
- radius、elevation、density、typography 与 motion 角色；
- 无效 recipe 的 fallback。

## 禁止事项

- 不把设计稿 iframe 到页面；
- 不为 Search、Composer、Chat、Graph 或 File Atlas 另写一个“看起来差不多”的完整 HTML 产品；
- 不在 scene/specimen CSS 写主题 hex 或读取 Obsidian theme variable；
- 不把生成图、文档夹具或构建通过冒充真实 Obsidian 验收。
