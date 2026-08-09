# Peak File Workspace 视觉方案

日期：2026-07-24  
状态：**Design only / not implemented**

这个目录是 Peak Assistant 多文件工作区的快速审阅入口。它分别展示 Image、HTML 和 PDF 的目标工作区，不是生产截图，也不证明功能已经实现。

> 2026-08-10：本页保留为历史视觉报告。需要实际切换 Image、HTML、PDF、Code Source、Canvas 与 Excalidraw，请打开[六格式统一交互原型](../peak-file-workspace-interactive-2026-08-10/index.html)。

## Authority

| 需要 | 阅读入口 |
| --- | --- |
| 决定产品边界、架构、保存策略、实施顺序和验收 | [正式方案](../../superpowers/specs/2026-07-24-peak-file-workspace.md) |
| 核查当前源码事实、现有能力与待验证 spike | [研究与当前能力审计](../../research/2026-07-24-peak-file-workspace/README.md) |
| 快速理解三个工作区和端到端交互 | [视觉报告](./index.html) |

冲突时：

1. 生产源码是 current behavior authority；
2. 正式方案是 target behavior authority；
3. 本 HTML 只负责视觉解释。

## 打开

直接打开 [index.html](./index.html)，或在仓库根目录运行：

```bash
python3 -m http.server 8173
```

然后访问：

```text
http://127.0.0.1:8173/docs/gstack/peak-file-workspace-2026-07-24/index.html
```

## 验证

```bash
node docs/gstack/peak-file-workspace-2026-07-24/validate.mjs
```

验证覆盖：

- 状态必须明确标为 design-only；
- Image、HTML、PDF 三个 focused workspace 都存在；
- HTML safe preview、PDF native companion、Image version-safe edit 等关键边界存在；
- 所有导航 anchor 存在；
- 主阅读视口无横向溢出；
- companion spec、research 与 roadmap 链接可解析。
