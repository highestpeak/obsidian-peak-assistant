// 1. 时间维度 (Temporal Info)
// 这是最重要的信息。AI 必须知道“现在”是什么时候，才能理解相对时间。

// 具体时间 (Current Time)：例如 2023-10-27 14:30。

// 星期几 (Day of Week)：这有助于处理“上周末的笔记”这种请求。

// 时区 (Timezone)：如果用户涉及跨时区的工作日志。

// 2. 当前焦点 (Current Focus)
// AI 应该知道你现在正盯着哪篇笔记。

// 当前活跃笔记路径 (Active File Path)：解决用户说“总结一下这篇内容”或者“帮我给这里加个标签”的问题。

// 当前光标位置 (Cursor Position)（进阶）：如果是在写插件，可以提供光标所在的行号或选中的文本。

// 3. 库的结构与统计 (Vault Stats)
// 这能帮 Agent 建立对你知识库规模的认知。

// 库名称 (Vault Name)：如果你有多个库（工作、生活），防止它搞混。

// 文件夹结构 (Folder Structure)：不一定要全部传，但可以传一个顶层文件夹列表，帮它判断搜索范围（例如：是去 Archives/ 还是 Inbox/）。

// 总笔记数：帮助它决定搜索策略（笔记多时更依赖关键词，少时可以多做 N-Hop）。

// 4. 插件状态 (Plugin State)
// 选中的文本 (Selection)：如果用户选中了一段话问“这段话是什么意思？”，你需要把这段文本直接喂给它。

// 打开的面板 (Open Leaf)：知道用户当前打开了哪些笔记（左边是文档，右边是日记），可以提供跨文档的上下文。

// 你给它的 Info 越详细，它的 “指代消解” 能力就越强。

// 用户问：“搜一下昨天的笔记。” → Info 提供时间。

// 用户问：“这篇文章里提到的 A 和 B 怎么关联？” → Info 提供当前文件路径。

// 用户问：“把这段代码重构一下。” → Info 提供选中的文本。

// 建议你采用 “两层架构”：基础上下文自动注入 + 动态元数据按需查询。

// // 这个工具允许 Agent 自己指定想看哪类信息
// // 灵活性：如果以后你加了新插件，只需要在 inspect_obsidian_context 的 switch 分支里加一行，而不需要改动 Agent 的逻辑。
// const contextTool = {
//     inspect_obsidian_context: {
//         description: "获取 Obsidian 的运行上下文。可以查询 'active_note' (当前笔记), 'vault_structure' (库结构), 或 'recent_files' (最近访问)。",
//         parameters: {
//             aspect: { 
//                 type: "string", 
//                 enum: ["active_note", "vault_structure", "recent_files", "plugin_status"] 
//             }
//         },
//         execute: async ({ aspect }) => {
//             switch(aspect) {
//                 case "active_note":
//                     return this.getActiveNoteDetail(); // 返回当前内容、光标、路径
//                 case "vault_structure":
//                     return this.getFolderTree(); // 只返回文件夹结构，不返回文件
//                 case "recent_files":
//                     return this.getRecentlyModified(10); // 返回最近改动的10个文件
//                 // ...
//             }
//         }
//     }
// }

// 静默 Context 注入
// 有些信息是 “通用常识”，不该让 Agent 调用工具获取。你应该在每次用户发送消息前，自动把最核心的几个状态拼接到 System Prompt 里：

// 当前时间 (Time)!! yyyy-mm-dd hh:mm:ss timezone

// 当前文件路径 (Active Path)

// 当前选中文本 (Selected Text)

// 这三者覆盖了 80% 的“这”、“那”、“刚才”、“昨天”这类代词需求。

