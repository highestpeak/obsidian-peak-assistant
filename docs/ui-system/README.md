# Peak UI System docs

这个目录维护 Design System Theme Lab 与全量 UI Catalog 的共享资源。

入口：

- `../design-system.html`：主题、基础、组件和宿主边界；
- `../design-system-playground.html`：产品场景、交互状态和录屏对照。

维护顺序：

1. 在 `catalog-manifest.js` 登记新的 scene/state/source/reference；
2. 从 production TSX 复制组件的 DOM anatomy 与 class contract；不要另起 Catalog 专用组件名；
3. Catalog 直接消费根目录 `styles.css`，`ui-catalog.css` 只允许做文档 viewport、fixture 和 canvas adapter；
4. 产品视觉只通过 `--pk-*` 语义变量变化；旧 production selector 需要 Obsidian 名称时，只能在 `host-compat.css` 里反向绑定到 Peak token；
5. 运行 `node docs/ui-system/validate.mjs`；
6. 真实产品行为仍按 Obsidian real UI QA 单独验收。

不要把旧设计稿 iframe 到 Catalog，也不要添加 `search-shell`、`composer-page`、`chat-message__bubble`、`graph-node` 一类平行实现。Cytoscape/canvas 没有可复制 DOM 时，适配层必须声明生产源码行来源。
