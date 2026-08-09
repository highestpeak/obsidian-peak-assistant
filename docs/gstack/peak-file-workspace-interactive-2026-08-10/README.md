# Peak File Workspace · 六种文件交互原型

日期：2026-08-10
状态：**Design mock only / implementation pending**

这是当前文件能力调研的聚焦交互入口。它解决旧稿的两个问题：

1. 旧 `peak-file-workspace-2026-07-24` 是纵向视觉报告，Image、HTML、PDF 的模式按钮没有实际状态切换；
2. Code Source、Canvas 与 Excalidraw 只有规格或 Markdown 嵌入示意，没有独立文件工作面。

## 打开

[直接打开交互原型](./index.html)

支持用 hash 直接进入指定 surface：

- `index.html#image`
- `index.html#html`
- `index.html#pdf`
- `index.html#code`
- `index.html#canvas`
- `index.html#excalidraw`

## 可以实际点击什么

- 左侧六个 native file 在同一个 Workspace 中切换；
- Image 的 View / Crop / Inspect；
- HTML 的 Source / Split / Preview 和 Pick element；
- PDF 的页码与 copied selection context；
- Code Source 的 Source / References / 三文件 Review，以及 symbol / related file；
- Canvas 的 selection / subgraph / whole canvas 和节点选择；
- Excalidraw 的 elements / bindings / patch preview 和 element selection；
- 右侧 Copilot / Context / History、suggestion、Generate candidate、review、accept 和 dismiss。

## 产品边界

- 原型不是生产截图，不证明 Obsidian 已注册这些 extension view；
- Image、HTML、Code Source 是专属工作面；
- PDF、Canvas、Excalidraw 复用宿主或生态 renderer，Peak 只增加格式感知的 AI companion；
- 查看或编辑源码不会自动执行；run/test/build/shell/network 属于另一类授权动作；
- 所有修改先产生 candidate，绑定 source revision 后 review/accept；
- Code Source 的多文件变化是一次 reviewed transaction，不允许逐文件半接受；
- PDF 原文件保持只读；Image 默认另存版本；Canvas/Excalidraw 使用 typed object patch。

正式能力合同见：

- [File Surface AI capability model](../../superpowers/specs/2026-08-09-file-surface-ai-capability-model.md)
- [File format capability audit](../../research/2026-07-31-file-format-capability-audit/index.html)

## 验证

```bash
node docs/gstack/peak-file-workspace-interactive-2026-08-10/validate.mjs
```

验证脚本检查六个 surface、直接 hash、核心交互 hook、本地资源和文档链接。浏览器自动点击若受本地 `file://` 策略限制，需要 owner 在当前 Codex Browser 中刷新后人工复核。
