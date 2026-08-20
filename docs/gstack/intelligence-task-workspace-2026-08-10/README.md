# Intelligence Task Workspace Mock

这是 Composer 顶部导航、Intelligence Sidecar 与原生 Markdown companion modal 的交互 Mock。正文 Composer、现有 Diff、文档 Schema、编辑行为和 Obsidian 原生编辑器全部复用现有实现，不属于本次设计范围。

直接打开本地文件，不需要 file server：

```text
file:///Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/intelligence-task-workspace-2026-08-10/index.html
```

## 当前结构

- Composer Header 左侧是 `编辑 / 阅读 / 原生 Markdown` 三种文档视图。
- Header 中央把多文件 Review 分成三组：当前文件内的改动导航、拒绝/接受、Change Set 文件导航与任务文档入口。
- `任务文档 · N` 与文件导航共用一组控件。展开后先显示当前尚未接受或拒绝的 Change Set 文件，再显示不在当前 Change Set 中的任务上下文；同一文件不会重复出现。
- Change Set 文件行使用固定的增减双列：绿色 `+N` 与红色 `−N` 始终纵向对齐。全新文件整行呈绿色，整篇删除整行呈红色并贯穿删除线。
- Header 右侧只保留评论和图标化的 Intelligence 入口。
- Sidecar 第一行是可以横向滚动的任务 Session tabs，旁边是 `+` 与关闭。
- Sidecar 第二行是 `建议 / 对话 / History` 三个同级视图；右侧只有建议更新策略。
- 建议视图保留原有 Brief 能力：顶部 AI Graphs、`问 Copilot`、手动更新；建议可展开证据、单条追问、延后以及查看全部。
- 相关材料是一个复合浏览器：窄侧栏显示排序、相关度和悬浮预览，点击材料可固定预览；预览可 `查看全部材料 / 查看来源 / 带入协作`。全部材料在宽 Modal 中提供列表、文件夹与图谱三种投影。
- `还没安放的想法` 保留在 Brief 底部，可以展开来源、带入协作或标记为已安放。
- 对话视图有 Session 上下文状态、消息、Sources/Trace、Change Set 回执、快捷能力、附件、模型选择和固定在底部的输入区。
- History 同时保留 AI 生成、Copilot 和真正写入正文的编辑；支持来源快速筛选，以及按改动方式、结果状态、作用范围做高级筛选，并可打开详情、Run 或定位正文。
- 新建 Session 使用居中 dialog，从当前文档开始，不提供“自选范围”。
- 原生 Markdown 中点击 Header 的 Intelligence 图标会打开 520px companion modal。Modal 只有 `建议 / 对话`；复杂写回和多文件 Review 会切回编辑视图。

## 关键交互

1. Session tab 可以横向滚动、切换和关闭；任意时刻只有一个 Session 继续追踪。
2. 点击建议会在原位展开；材料在悬浮或键盘聚焦时临时预览，点击后固定。鼠标离开会回到已固定的材料。
3. `问 Copilot`、材料和想法的 `带入协作` 都进入同一个 Sidecar 对话，不创建重复视图。
4. Change Set 回执或建议中的 `打开 Review` 会切到编辑视图，但不会把 Review 变成 Intelligence 的第四个 tab。
5. Review 属于当前 Composer Session 和编辑视图。切换 `建议 / 对话 / History` 不影响它；切换 Session 时恢复各自状态。
6. 悬浮或键盘聚焦 Header 中央区域会以动画展开任务文档/Change Set 列表。鼠标可以进入列表并操作；只有离开整个触发区和浮层后才关闭。点击 `任务文档 · N` 可以显式打开，再次点击可以关闭。
7. `编辑 / 阅读 / 原生 Markdown` 控制 Review 是否显示；回到编辑视图会恢复同一 Session 的进度。
8. 悬浮或聚焦建议更新策略会展开完整策略菜单，鼠标可以从按钮进入菜单；选择策略后菜单保留，只有离开整个触发区和菜单后才关闭。`+` 仍是可重复开关的真实交互。
9. History 的快速筛选和“更多”筛选可叠加；材料的列表、文件夹、图谱只是同一份冻结材料快照的不同投影，不会因切换视图重新运行 AI。

这是 design-only artifact，不修改生产 UI。当前完成了 HTML、CSS 和 JavaScript 静态检查；由于本地 `file://` 页面在本轮没有可用的自动化浏览器通道，真实指针轨迹与视觉结果仍需在打开文件后人工确认。
