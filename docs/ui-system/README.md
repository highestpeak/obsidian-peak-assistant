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
