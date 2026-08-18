# Composer 长文档稳定视觉投影实施计划

## 目标

长文档首次打开、连续滚动和滚动停止后使用同一套视觉投影，不再在纯文本代理与完整编辑器之间切换。完整文档模型、全文定位、AI 候选和 block 结构继续保留；DOM 只覆盖 viewport、overscan 与 hard-pin。

## 合同

- 长文档从首屏开始采用静态视觉投影，Markdown 链接、样式、公式和 block 布局与编辑态一致。
- 静态块不创建 `DirectEditController` 或 `contenteditable`；点击、焦点、IME、拖拽、面板、选择端点等交互块才水合编辑器。
- 切换或卸载活动编辑器前必须先完成保存；AI 可以更新完整模型，但不能让全部 AI 相关 block 常驻 DOM。
- 滚动只调整 bounded virtual window；滚动停止只恢复普通 overscan，不替换行 renderer。
- 全文定位先从完整 layout index 求 offset，再挂载目标块；`not mounted` 不等于 `not found`。

## 实施结果与计划修正

原计划第 2 步只拆出了 `StaticEditableText`，因此只移除了普通文字叶的 editor 和 `contenteditable`。18:20 的真实录屏和两份新 CppHeap crash report 证明，这个边界仍然太窄：普通虚拟行继续挂载完整 `ComposerBlockRow`，以下对象仍会在快速遍历中反复分配：

- rail 与 action surface；
- effects 与 timers；
- SVG controls；
- comments 与 finding/candidate plumbing。

最终实现把静态边界上移到完整行：

- `ComposerStaticBlockRow` 承担普通 block 的稳定视觉投影，覆盖文字、标题、引用、callout、列表与 task。
- `ComposerStaticRowPolicy` 只让明确需要交互或状态 UI 的行进入完整 `ComposerBlockRow`。
- candidates、findings 和 comments 都在文档根订阅并按 block id 索引。普通行没有逐行订阅。
- selection endpoint 与静态链接焦点只保持挂载，不触发 renderer 替换；编辑激活才水合完整行。
- `DocumentComposerView` 在 controller start 前绘制文件级 skeleton，并统一处理 `onOpen` / `setState` 的两种生命周期顺序。

因此，计划中的“静态视觉投影”现在特指**无完整交互行壳的专用静态行**。只把 `EditableText` 换成静态叶不满足合同。

## 实施顺序

1. 把 `lightweight scroll projection` 配置与状态改为稳定 `static projection` 资格。
2. 拆分 `EditableText` 的静态和交互分支；该步骤只完成叶节点降载，不能单独作为最终边界。
3. 增加 block 级水合状态、critical hard-pin 和保存后切换合同。
4. 删除纯文本滚动代理、测量冻结和 idle renderer swap。
5. 补充策略、源码合同、首屏有界渲染测试，运行生产 build。
6. 通过真实 Obsidian CDP 检查首屏 mounted/editor 数量、快速滚动白屏、链接视觉与点击激活。
7. 将普通行提升为独立 `ComposerStaticBlockRow`，补充完整行壳零分配、根级评论索引和首开 paint gate。

## 验收

- 长文档初始与滚动后 `contenteditable` 数量为 0；激活一个普通文字块后只出现该块的编辑器。
- 普通已挂载行全部使用 `ComposerStaticBlockRow`，不包含 rail、action row、timer 或逐行 store subscription。
- 快速滚动期间和停止后没有纯文本代理、没有链接样式二次出现、没有整窗编辑器重新创建。
- mounted block 数保持有界，hard-pin 交互和全文跳转仍可用。
- focused tests 与 production build 通过；真实宿主未能完成的交互必须明确标记 `INTERACTION NOT VERIFIED`。
