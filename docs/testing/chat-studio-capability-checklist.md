# Chat Studio 能力测试清单

- 更新日期：2026-07-20
- 适用范围：Chat Studio 中栏、Composer、Outline / Resources、消息富内容与媒体产物
- 目标：用同一份清单区分“真的能用”“只接了底层”“尚未实现”，避免把调研目标当成生产能力

## 状态说明

| 状态 | 含义 |
|---|---|
| `AVAILABLE` | 有用户可达入口，可进行端到端验收 |
| `PARTIAL` | 能完成部分链路，仍受模型、loader、成本提示或 UI 入口限制 |
| `INFRA ONLY` | 底层 port / adapter 存在，但普通用户没有完整入口 |
| `NOT WIRED` | 当前 Chat Studio 没有对应执行链路 |

## 当前能力基线

这张表是测试前的诚实基线；后续每次实现能力时，先更新状态，再补对应测试证据。

| 能力 | 当前状态 | 已知边界 |
|---|---|---|
| 普通文本、多轮对话、流式输出 | `AVAILABLE` | 需要至少一个可用 Chat profile |
| `[[文档]]` 搜索与引用 | `AVAILABLE` | 输入框和 context shelf 只显示文件名，内部引用保留完整路径；删除行内引用时同步移除 shelf |
| 发送图片 | `PARTIAL` | Composer 有预览并会上传到 Vault；模型能否理解图片取决于当前 provider / model 的多模态能力 |
| 发送 PDF、Markdown、TXT、CSV、JSON、HTML、XML、DOCX、XLSX、PPTX | `AVAILABLE` | 需验证对应 loader；超大文件仍受上下文预算限制 |
| 发送 Canvas / Excalidraw | `PARTIAL` | 可作为 Vault 资源与可读文本进入检索链路，但 Chat 不提供原生画布编辑 |
| 发送音频 / 视频 | `PARTIAL` | 文件选择和 Vault 上传不拦截，MIME 映射存在；当前资源会落为 `unknown`，没有专用 audio / video loader，不能承诺模型可理解 |
| Markdown 表格、代码块、引用、列表、数学公式 | `AVAILABLE` | 由 Streamdown 渲染；需做流式中间态和长内容视觉测试 |
| Mermaid | `AVAILABLE` | Chat 内原生渲染；全屏、下载、Vault wikilink 点击需要分别验证 |
| Obsidian Bases | `AVAILABLE` | 模型输出 `base` fence；按钮保存为 `.base` 并在 Obsidian 原生打开，不在 Chat 内直接渲染 Bases |
| Dataview | `NOT WIRED` | 当前 rich-output registry 未注册 Dataview；只能把生成的 DQL 当普通代码处理 |
| Excalidraw / draw.io 生成 | `NOT WIRED` | 现有代码只认识相关资源类型，没有 Chat 生成和可编辑桥接 |
| 保存助手消息到 Vault | `AVAILABLE` | 通过消息操作执行；必须产生真实保存路径和 artifact receipt |
| Extract / Reminder 作为 Chat 产物 | `NOT WIRED` | Copilot 另有 extract actions，但 Chat Studio 没有统一的 Extract / Reminder artifact contract |
| 当前笔记生成 TTS | `AVAILABLE` | 命令 `peak-media-tts-active-note`；需要 fal.ai key，产物落 `_attachments/media/` 或配置目录 |
| 当前笔记生成封面图 | `AVAILABLE` | 命令 `peak-media-cover-active-note`；需要 fal.ai key，不是 Chat 内 inline 生图 |
| Chat 内 inline 生图 / 参考图迭代编辑 | `NOT WIRED` | `MediaGenerationPort` 尚未接入 Chat 消息流 |
| 视频生成 | `INFRA ONLY` | fal adapter 有 video 请求与结果解析，但没有 command / Chat UI、成本确认、任务状态或重试体验 |
| 音乐生成 | `NOT WIRED` | 当前没有 music kind、adapter 或 UI |

## 0. 每轮测试准备

- [ ] 先运行 `Peak Assistant: Chat Studio: Rebuild Component Gallery`，按[组件画廊回归说明](./chat-studio-component-gallery.md)检查真实组件的完整基线。
- [ ] `npm run build` 成功，Obsidian 已重新加载插件。
- [ ] 准备一个文本模型 profile；多模态用例另准备一个明确支持图片的 profile。
- [ ] 准备 fal.ai key，仅在执行 TTS / 封面图测试时启用。
- [ ] 准备测试 Vault 文件：Markdown、PDF、PNG/JPEG、CSV、DOCX、XLSX、PPTX、Canvas、Excalidraw、MP3、MP4。
- [ ] 开发者控制台无新的 uncaught error；记录 provider、model、主题、窗口类型和构建版本。
- [ ] 同一组关键用例至少覆盖主窗口和 Chat Studio popout；视觉用例覆盖亮色与暗色主题。

## 1. Composer 与引用

### COMP-01 `[[文档]]` 搜索菜单

1. 在靠近窗口底部的 Composer 输入 `[[` 和查询词。
2. 观察菜单位置，连续按 `↑` / `↓`，再用鼠标 hover 不同行。
3. 按 Enter 选择结果。

验收：

- [ ] 菜单在 Composer 上方展开，不被窗口底部裁切。
- [ ] 主窗口和 popout 都使用所属窗口的 viewport 定位。
- [ ] 键盘选中背景始终可见；hover 与 keyboard-selected 状态可区分。
- [ ] 滚动长结果列表时，当前选中项会进入可视区。
- [ ] 选中后输入框只显示可读的 `[[文件名.md]]`，不会暴露完整 Vault 路径，也不会只剩附件 chip。
- [ ] context shelf 同时出现显式 Vault 引用，只显示文件名；完整 Vault 路径保留在 hover 提示和内部 URI 中。
- [ ] 删除输入框里的完整 wikilink 后，配对的 context shelf 引用同步消失；普通上传和 URL 不受影响。
- [ ] 发送、切换会话、重新加载后，引用和正文按 Composer draft 规则恢复或清空。

### COMP-02 文件选择与拖放

对每种文件分别执行“`+` 选择”和拖入 Composer：PNG、PDF、DOCX、CSV、MP3、MP4。

- [ ] 同一文件重复加入会按 hash 去重。
- [ ] 图片显示缩略图；其他文件显示文件名和稳定的类型图标。
- [ ] 删除附件不会删除 Composer 正文或显式 Vault 引用。
- [ ] 发送失败时正文与附件保留，成功后清空。
- [ ] 发送成功后消息资源和右侧 Resources 都能看到对应文件。
- [ ] 音频 / 视频明确显示为“已上传但理解能力未保证”，不得伪装成已完成多模态分析。

## 2. 会话顺序、Outline 与 Resources

### INDEX-01 全局时间倒序

构造消息时间线：`Topic A(旧) → Topic B → Topic A(新)`，并让输入数组顺序与时间顺序不同。

- [ ] Outline 从上到下严格按 `createdAtTimestamp` 新到旧排列。
- [ ] 时间相同使用稳定 tie-break，不因重新渲染跳动。
- [ ] message 的 process / error / artifact 子节点紧跟父 message，不漂到其他消息上方。

### INDEX-02 只聚合连续 Topic

- [ ] 相邻且 topic 相同的消息进入同一个 group。
- [ ] 中间出现不同 topic 后，再次出现同名 topic 必须形成新的 group。
- [ ] 展开 / 折叠状态按连续 group id 保存，不会同时折叠所有同名 topic。
- [ ] 搜索过滤后仍保持原始时间顺序与 group 边界。

### INDEX-03 Resources 诚实性

- [ ] 本轮引用和本轮生成分区正确。
- [ ] 图片、音频 / music、视频、文档、表格、代码、diagram、Base 类型映射正确。
- [ ] 点击资源回跳到来源消息；不会假装已经打开或管理了 Vault 文件。
- [ ] 真实保存产物有 artifact receipt、Vault path 和可执行 open / copy 等动作。

## 3. 消息与富内容视觉

对同一条助手回复一次性生成：两段正文、列表、blockquote、宽表格、长代码块、Mermaid、数学公式、普通图片链接和 wikilink。

### RENDER-01 阅读层级

- [ ] 用户消息是右对齐的轻量文本块，不像第二个 Composer 输入框。
- [ ] Reasoning 是正文流中的轻量 disclosure，不是大面积灰色卡片；折叠时只显示名称，展开后用左侧细线与正文区分。
- [ ] Reasoning 只承载模型 reasoning 文本，不混入工具调用、工具参数、结果、耗时或 runtime span。
- [ ] Composer、消息正文与主要富内容共享同一阅读宽度。
- [ ] 窄窗口仍保留正文优先级，左右栏不挤压到不可读。

### RENDER-01B Agent Run 与 Diagnostic Trace

准备四种消息：单工具成功、多工具运行中、中间工具失败、带嵌套 `DebugRun` spans 的 agent run。

- [ ] 有工具调用时显示独立的 `Agent run`，按真实执行顺序连接成时间线；不得伪装成 Reasoning。
- [ ] running / completed / failed / cancelled 状态、步骤数、总耗时和 token 信息与实际运行一致。
- [ ] 每个步骤能区分输入摘要、结果摘要、错误和耗时；长参数与长结果不会撑破消息列。
- [ ] 只有消息存在精确匹配的 `debugRunId` 且能读到 spans 时，才显示 `Diagnostic trace`。
- [ ] trace 根据 `parentSpanId` 展示嵌套栈，失败 span 明确标红；没有 trace 时不生成假的空栈或静态占位。
- [ ] 折叠 Agent run 不影响正文阅读；展开 trace 不遮挡 Composer，窄窗口仍能辨认层级。

### RENDER-02 表格

- [ ] 表头有轻量区分，没有渐变、厚阴影或强斑马纹。
- [ ] 宽表格只在表格自身横向滚动，不撑破消息列。
- [ ] 单元格换行、中文、长 URL、inline code 与最后一行边界正常。
- [ ] 亮色与暗色主题均有足够文字 / border 对比度。

### RENDER-03 代码

- [ ] header、body、copy / download actions 构成一个结构面，没有双重边框和浮起阴影。
- [ ] 长行可滚动，长代码块不会压住 Composer。
- [ ] 流式中未闭合 fence 不产生白屏、布局跳跃或无法复制的残片。
- [ ] 暗色 Obsidian 主题下 code body 不出现刺眼白底。
- [ ] `Settings → Peak Assistant → Advanced → Message appearance` 可切换 GitHub Dark、One Dark Pro、Nord、Dracula、Vitesse Dark，消息、Reasoning 与报告内代码即时同步。

### RENDER-04 图片与 Mermaid

- [ ] 图片保留自然比例，最大宽度不超过正文，超高图片不会无限拉长会话。
- [ ] 点击生成图片会在当前 Obsidian 窗口打开可关闭的放大预览；不误开到主窗口或浏览器。
- [ ] 图片没有额外 glossy card shadow；加载失败时不破坏周围正文。
- [ ] 没有真实媒体 URL 的 video / audio receipt 只显示紧凑图标、文件名和状态，不画假的波形或大片空白播放器。
- [ ] Mermaid 小图、宽图、错误语法、全屏和导出动作都可恢复；全屏复制真正的 diagram SVG，不得误放大工具栏 icon。
- [ ] Mermaid 节点内真实 `peak://wikilink/` 可以打开 Vault 文件；不存在的路径不得由模型编造。

## 4. 结构化产物

### ART-01 Obsidian Bases

提示模型生成带 `# filename: active-projects.base` 的 `base` fence。

- [ ] fence 在 Chat 中显示为代码并出现 `Save & Open in Bases`。
- [ ] 保存前 filename hint 被清除，目标路径位于配置的 AI Bases 目录。
- [ ] Obsidian 以新 tab 打开 `.base`；重复保存不会静默覆盖用户文件。
- [ ] 成功后记录真实 artifact receipt；失败时保留源代码并显示可行动错误。

### ART-02 保存消息到 Vault

- [ ] More / 自适应动作中可找到 Save to Vault。
- [ ] 成功提示包含真实路径；Resources / 项目资源页可看到产物。
- [ ] 消息 Markdown、表格、code fence、图片引用和 wikilink 在保存后不丢失。
- [ ] 权限、目录不存在和文件名冲突有明确降级结果。

### ART-03 尚未接入能力的防误导

- [ ] Dataview、Excalidraw、draw.io、Reminder、Extract、inline image、video、music 不显示成可点击的已上线能力。
- [ ] 如果模型只返回源码，UI 明确叫“源码 / 草稿”，不叫“已创建产物”。
- [ ] 未来新增入口时，必须同时补状态、成本、取消、失败恢复、Vault 生命周期和 artifact receipt。

## 5. 媒体生成

### MEDIA-01 当前笔记 TTS

1. 打开非空 Markdown 笔记。
2. 运行 `Peak Assistant: Generate TTS for active note` 对应命令。

- [ ] 未配置 fal.ai key 时只提示配置，不发请求。
- [ ] 成功生成 MP3 / WAV 并写入配置目录；提示包含路径和大小。
- [ ] 空笔记、网络失败、超时和 provider 错误均关闭进度 notice，并给出错误。
- [ ] 不把单次 TTS 命令描述成“Chat 内音频生成”。

### MEDIA-02 当前笔记封面图

- [ ] 标题和正文摘要进入 prompt；产物为 PNG / JPEG / WebP。
- [ ] 16:9 输出写入 Vault 配置目录，原笔记不会被自动改写。
- [ ] 未配置 key、空笔记、网络失败和超时行为可恢复。
- [ ] 生成结果不会被错误标记为 Chat inline image。

### MEDIA-03 Video / Music 上线前门槛

以下全部满足前，状态不得从 `INFRA ONLY` / `NOT WIRED` 改为 `AVAILABLE`：

- [ ] 有用户入口和明确 model / duration / aspect / voice 控件。
- [ ] 单次调用前显示估算成本，高成本调用需要确认。
- [ ] 有异步 job 状态、取消、超时、重试和应用重启后的恢复策略。
- [ ] 产物保存到 Vault，可预览、打开、再次作为 reference 使用。
- [ ] 有真实 artifact receipt 和 Usage Dashboard 记录。
- [ ] 音乐另有授权 / 商用边界说明，不能复用 TTS 的许可假设。

## 6. 回归与证据记录

每次发布保留以下最小证据：

| 证据 | 必填内容 |
|---|---|
| 自动测试 | Outline 顺序 / 连续 topic、popup 定位、wikilink 行内保留、Composer draft |
| 构建 | `npm run build` 结果 |
| 主窗口截图 | 完整 Chat Studio，包含用户消息、Analysis、富正文和 Outline |
| popout 截图 | `[[文档]]` 菜单、键盘高亮和 Composer 边界 |
| 主题截图 | 表格、代码、图片、Mermaid 的亮色 / 暗色结果 |
| 媒体记录 | provider、model、输入、耗时、Vault path、失败原因、实际成本（若可得） |

相关资料：

- [Chat Studio 组件画廊与视觉回归](./chat-studio-component-gallery.md)
- [Chat Studio UI/UX 功能图](../11-feature-chat-studio-ui-ux.html)
- [Chat Context](../11-feature-chat-context.html)
- [多模态生成能力调研](../research/2026-07-01-multimodal-generation-studio/README.md)
- [Chat 富生成能力调研](../research/2026-07-01-rich-generation-in-chat/README.md)
