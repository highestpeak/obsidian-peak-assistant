# Composer 长文档稳定视觉投影实施计划

## 目标

长文档首次打开、连续滚动和滚动停止后使用同一套视觉投影，不再在纯文本代理与完整编辑器之间切换。完整文档模型、全文定位、AI 候选和 block 结构继续保留；DOM 只覆盖 viewport、overscan 与 hard-pin。

## 合同

- 长文档从首屏开始采用静态视觉投影，Markdown 链接、样式、公式和 block 布局与编辑态一致。
- 静态块不创建 `DirectEditController` 或 `contenteditable`；点击、焦点、IME、拖拽、面板、选择端点等交互块才水合编辑器。
- 切换或卸载活动编辑器前必须先完成保存；AI 可以更新完整模型，但不能让全部 AI 相关 block 常驻 DOM。
- 滚动只调整 bounded virtual window；滚动停止只恢复普通 overscan，不替换行 renderer。
- 全文定位先从完整 layout index 求 offset，再挂载目标块；`not mounted` 不等于 `not found`。

## 实施顺序

1. 把 `lightweight scroll projection` 配置与状态改为稳定 `static projection` 资格。
2. 拆分 `EditableText` 的静态和交互分支，确保静态分支零编辑器控制器。
3. 增加 block 级水合状态、critical hard-pin 和保存后切换合同。
4. 删除纯文本滚动代理、测量冻结和 idle renderer swap。
5. 补充策略、源码合同、首屏有界渲染测试，运行生产 build。
6. 通过真实 Obsidian CDP 检查首屏 mounted/editor 数量、快速滚动白屏、链接视觉与点击激活。

## 验收

- 长文档初始与滚动后 `contenteditable` 数量为 0；激活一个普通文字块后只出现该块的编辑器。
- 快速滚动期间和停止后没有纯文本代理、没有链接样式二次出现、没有整窗编辑器重新创建。
- mounted block 数保持有界，hard-pin 交互和全文跳转仍可用。
- focused tests 与 production build 通过；真实宿主未能完成的交互必须明确标记 `INTERACTION NOT VERIFIED`。
