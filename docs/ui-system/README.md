# Peak UI System docs

这个目录维护 Design System Theme Lab 与全量 UI Catalog 的共享资源。

入口：

- `../design-system.html`：主题、基础、组件和宿主边界；
- `../design-system-playground.html`：产品场景、交互状态和录屏对照。

维护顺序：

1. 在 `catalog-manifest.js` 登记新的 scene/state/source/reference；
2. 在 Catalog HTML 增加相同 `data-scene-id`、`data-scene-state` 与 `data-scene-panel`；
3. 只通过 `--pk-*` 语义变量实现视觉；
4. 运行 `node docs/ui-system/validate.mjs`；
5. 真实产品行为仍按 Obsidian real UI QA 单独验收。

不要把旧设计稿 iframe 到 Catalog，也不要在 scene CSS 中添加 Obsidian 主题变量或主题专属 hex。
