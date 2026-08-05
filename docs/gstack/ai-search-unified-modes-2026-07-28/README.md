# AI Search unified modes interactive mock

这是设计稿，不是生产实现。入口：

- `index.html`
- 嵌入模式：`index.html?embed=1`

本稿验证以下产品判断：

- Quick Search modal 顶层只保留 `Vault Search` 与一个 AI workspace selector。
- 顶栏保持原有的 `Vault Search` / AI workspace 等分布局；嵌套的 AI selector 必须撑满顶栏高度，与 Vault Search 严格垂直居中。
- 插件冷启动后的第一次打开默认进入 `Vault Search`；同一次插件 runtime 内再次打开恢复上次精确 surface / AI mode。
- AI selector 的 menu 展开态不跨 modal 保留；点击 AI 主 tab 只切换页面，不自动弹出 mode menu。
- `AI Graph` 与 `Vault Intelligence` 是低频 AI mode，不再各占顶层入口。
- `Vault Analysis` 不再作为输入框里的第二层可见选择，它属于 AI Search 的内部 recipe。
- AI Graph 不再拥有独立卡片 Library；全部 graph 以同一 modal 内的紧凑历史列表呈现。
- 每个 AI Graph history row 显示稳定的创建来源与主要上下文，例如 `Created in File Atlas · AI 编辑器生态调研.md`；后续更新不覆盖创建来源。
- AI Graph 持久化、版本、Graph Detail 与 repository 设计保持不变，变化的是 browse surface。
- AI Graph 首页不显示 Graph Type；Graph Type 只出现在显式 Create Graph 流程。
- AI Search / AI Graph composer 单行时垂直居中，长文本自然换行并增长到最多约三行。
- `Vault Intelligence` 在本 modal 中直接提供 Vault graph overview、hubs、health 与 recent review projection，不再跳转旧 Copilot Vault workspace；进入模式本身不会启动扫描。
- 模式菜单与历史列表使用真实 DOM button、focus 和键盘事件，不是 SVG 截图。
- `Tab` 用于组件导航；menu 使用 `ArrowUp / ArrowDown / Enter / Escape`；`Alt/Option + Up/Down` 只作为后续可配置加速层，编辑输入时不拦截。

当前 mock 不修改任何 `src/` 生产文件，也不发起真实 AI、Vault scan 或 artifact persistence。
