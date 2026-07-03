# Canvas Conversation Type — 2026-07-03

## 一句话结论

**Obsidian 已有 Canvas file type（`.canvas` JSON），API 允许 embed 自定义 node type + web view。落地路径：新增 `conversationType.kind = 'canvas'`，在一张 Canvas 里生成一个 chat node + 多个 artifact node（output document / image / mermaid），节点间用 Canvas edge 连接对话步骤。核心复杂度在 Canvas 交互（Obsidian 官方 view，不容易嵌深度 UI）。**

## 问题定义

普通线性 chat 不适合"多路并行探索 + 可视化关系"的场景（研究、写作 outline、项目 kickoff）。用户希望：
- 左边是 chat 输入 + LLM 回答
- 右边同 Canvas 里生成的 artifact（图、代码、文档草稿）可以拖动、连线、批注
- 分支对话 → Canvas 上多条分叉

## Obsidian Canvas 现状盘点

- **文件格式**：`.canvas`，JSON schema `{ nodes: [{ id, type, x, y, width, height, text? / file? / url? }], edges: [{ id, fromNode, fromSide, toNode, toSide }] }`。
- **原生 node type**：text / file / group / link；无 "chat" node。
- **API**：官方 canvas API 有限 — `workspace.getActiveViewOfType(CanvasView)`；node 类型无法在 registerViewCreator 层扩展（Canvas view 是官方 view）。可以：
  - 生成 `.canvas` 文件；
  - 用 `file` node 引用另一个 markdown 文件（chat message 存到 file 里）；
  - **不能**在 Canvas 里嵌一个 React chat panel（受限于官方 view）。

结论：Canvas view 本身不适合做深度嵌入；但可以用 Canvas 作为<em>产物容器</em>。

## 推荐落地形态

**"Peak Chat + Canvas 视图切换"**：

1. 用户在普通 Peak Chat 里对话；
2. 用户/AI 触发 "Export to Canvas" 命令；
3. 后端生成 `.canvas` 文件：
   - 一个 text node "Conversation summary + link back to chat"
   - N 个 text/file node 对应每个 artifact（output note / mermaid / image）
   - Edges 反映 message → artifact 关系
4. 用户在 Canvas 里拖动、批注、connectinfo
5. 反向同步：Canvas 上的批注写回 chat conversation 作为 note-turn（可选）

不做 native "canvas conversation type" —— Obsidian Canvas API 不足以支撑。

**替代方案**：如果用户强需在 Canvas 里对话，实现 `.canvas` node 类型 file/link 指到 chat file，让用户 double-click 打开 chat。低集成度但可行。

## 竞品参考

- **Obsidian Canvas** 原生：只做 spatial notes。
- **Miro / FigJam**：AI 板块但非 note-taking。
- **Curio (macOS)**：非常接近但已停更。
- **Excalidraw plugin (Obsidian)**：也是画板，AI 集成有限。

## 决策

- **必要性**：**低-中**。少数 spatial-thinker 用户强需要，多数用户不需要。
- **形态**：轻量 export-to-canvas，不做 native canvas conversation type。
- **优先级**：Wave 6+。低 ROI。
- **依赖**：无（已有 chat / artifact 基础设施）。

## Next steps

1. `.canvas` 文件 emit PoC（一个 chat conversation → 一个 canvas）
2. UX 决策：export 是命令触发 or 自动同步
3. 优先级评估 vs Wave 4/5
