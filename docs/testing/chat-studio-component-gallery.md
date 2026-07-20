# Chat Studio 组件画廊与视觉回归

- 更新日期：2026-07-20
- 对象：生产 Chat Studio 组件，不是独立 HTML mock
- 命令：`Peak Assistant: Chat Studio: Rebuild Component Gallery`

## 用途

这条命令会重建一个名为 `[QA] Chat Studio Component Gallery` 的测试会话，并直接在 Chat Studio 打开。它使用真实消息、Composer、Outline、Resources、receipt、reasoning、Agent Run 与 Diagnostic Trace 组件，只替换输入数据；不会调用付费模型，也不会把 mock receipt 宣称为真实生成能力。

再次运行命令时，只清理带有 `peak.chat-studio.component-gallery.v1` 精确标签的旧画廊会话，不影响普通会话。

## 覆盖矩阵

| 区域 | 画廊数据 |
|---|---|
| 用户消息 | 普通文本、图片、URL、Markdown、CSV、MP3、MP4 附件 |
| Assistant 正文 | 段落、引用、列表、任务列表、wikilink、普通链接、行内代码、数学公式 |
| 表格 | 中英文、长 URL、inline code、宽列与横向滚动 |
| 代码 | TypeScript、JSON、Bash、长行、copy / download |
| Mermaid | 真实渲染、缩放、复制、下载、全屏入口；工具按钮保持 26px 点击区、15px 图标，不随 diagram SVG 放大 |
| Reasoning | 轻量折叠态与展开态，只显示 reasoning 文本 |
| Agent Run | 三步工具时间线、输入/结果摘要、耗时、token 与完成态 |
| Diagnostic Trace | 独立五层 runtime spans，不混入 Reasoning |
| Artifact receipts | 同一轮 4 image、3 video、3 audio/music、多 table / CSV、code、diagram、Base、document |
| Receipt 状态 | ready、saved、generating、needs-permission、failed |
| Message 状态 | completed、failed、cancelled |
| Outline | 故意使用 `Rich → Agent → Media → States → Rich`，验证严格倒序和只聚合连续 topic |
| Resources | Referenced / Generated、Input / Generated、audio / video 等类型筛选 |

## 每次回归流程

1. 运行 `npm run build` 并重新加载 Peak Assistant。
2. 从命令面板执行 `Peak Assistant: Chat Studio: Rebuild Component Gallery`。
3. 检查正文阅读宽度、用户消息、Reasoning、Agent Run、Trace、表格、代码、Mermaid 与 receipts。
4. 在 Outline 中确认从上到下严格按消息时间新到旧；同名 topic 只聚合相邻消息。
5. 切到 Resources，分别检查 `All / Input / Generated` 和类型筛选；音频与视频必须使用独立类型。
6. 在 Composer 输入 `[[`，连续上下移动并选择文档：建议选中态应可见；正文与 context shelf 只显示文件名；删除或破坏完整 wikilink 后 shelf 同步移除。
7. 到 `Settings → Peak Assistant → Advanced → Message appearance` 切换 Code block theme，确认当前画廊代码即时换色。
8. 检查主窗口和 popout，无新 uncaught error、横向溢出或 Composer 遮挡。

## 2026-07-19 实机证据

- Obsidian 1.12.7 popout：Outline 显示 22 项，时间严格倒序；前后两个 `Rich content` 被不同 topic 隔开，保持两个独立组。
- Resources 显示 18 项，Referenced / Generated 各 9 项；MP3 / WAV 为 `Audio / Music`，MP4 为 `Video`。
- `[[` 菜单在 Composer 上方展开，键盘选中背景随 `↓` 移动且保持可见；选中后正文和 shelf 都只显示 `选课课程调研.md`，完整路径仅作内部来源与帮助文本；编辑 wikilink 后 shelf 立即消失。
- TypeScript / JSON / Bash 使用 GitHub Dark token 而不是操作系统 light token；设置中可选 GitHub Dark、One Dark Pro、Nord、Dracula、Vitesse Dark。
- Agent Run 与五层 Diagnostic Trace 可独立折叠；Reasoning 仍是另一条轻量 disclosure。
- 图片、表格、公式、Mermaid、audio/video placeholder、ready / generating / needs-permission / failed receipts 均在真实组件中渲染。
- 完整执行 `Reload app without saving` 后，插件正常注册两条 Chat Studio 命令；不重建 fixture、直接从 Recent 打开旧画廊，22 条 Outline、连续 topic 边界与 Agent Run 均从持久化数据恢复。

## 2026-07-20 实机补充

- 三步 Agent Run 在实时 fixture 和重载后的持久化消息中都默认展开；Vault 搜索、读取笔记、组装上下文按执行顺序可见。session-only Diagnostic Trace 只在精确 `debugRunId` 仍可解析时出现，重载后不会伪造空 trace。
- 同一轮生成 4 张图片、3 个视频、3 段音频以及多份 CSV / code / document：两个及以上视觉媒体切为全宽自适应 gallery，不再把每个产物塞进固定等高卡片；支持产物继续使用连续紧凑清单。
- 任一图片点击后在 Chat Studio 所属窗口打开同批次 lightbox；Previous / Next、键盘左右键、Escape、遮罩和关闭按钮均可用，并显示当前序号。
- Receipts 使用“视觉媒体主预览 + 连续紧凑产物清单”：图片 / 可播放视频进入预览区；无真实 URL 的 MP4 只显示文件名 + 状态；真实 audio URL 使用紧凑原生控件，不再渲染假的波形或等高空卡片。
- Mermaid inline SVG 使用完整消息宽度；全屏按钮经当前窗口 portal 打开真实 diagram SVG，排除 Zoom / Reset 工具栏 icon，并清除 Mermaid 写入的像素级 `max-width` 限制。图表 SVG 的尺寸规则限定到 `[aria-label="Mermaid chart"] > svg`，下载 / 复制 / 全屏和缩放按钮不会再被 `width: 100%` 放大或越界。全屏内应验证拖动平移、滚轮按光标位置缩放、工具条缩小 / 放大 / 复位、百分比反馈，以及键盘 `+` / `-` / `0` / 方向键。
- 长 URL 单元格保留可读最小宽度，超出由表格 wrapper 横向滚动，不再重叠或逐字符竖排。
- 最终 fixture 在实机显示 37 条 Outline，其中 `Media and artifacts` 连续 topic 含 24 个 artifact anchor；4 张图片、3 个视频和 3 个 `.ogg` 音频名称均从持久化数据恢复。

## 自动化证据

核心覆盖位于：

- `test/chat-studio-gallery-fixture.test.ts`
- `test/chat-studio-right-index.test.ts`
- `test/chat-studio-message-state-ui.test.ts`
- `test/mermaid-fullscreen-viewport.test.ts`
- `test/chat-studio-message-actions.test.ts`
- `test/code-block-theme-settings.test.ts`

完整发布清单继续使用 [Chat Studio 能力测试清单](./chat-studio-capability-checklist.md)。画廊能验证 UI 契约，但不会把 `INFRA ONLY` 或 `NOT WIRED` 的媒体生成链路升级成 `AVAILABLE`。
