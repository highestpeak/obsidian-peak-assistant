# Message Branching — 2026-07-03

## 一句话结论

**在当前 chat.sqlite schema 上加 `parentMessageId + branchId + branchLabel` 三个字段即可支持"从某条消息分叉"。UI 侧走"tree view + 当前分支高亮"，不做 3D graph。核心复杂度在<em>存储</em>是 O(1) 改动，在 <em>UI</em> 是中等，在 <em>产品语义</em> 是决定"分叉后原分支还看得到吗、要不要 auto-merge"这类判断。**

## 问题定义

现有 Chat 是<strong>线性对话</strong>：一次 conversation 是一条 `messages[]`，重发消息（换模型 / 换 prompt）会覆盖 assistant message。用户没法：

1. 从某条 assistant message 分叉出另一条 turn（换用户提问变体）；
2. 保留多条平行探索路径；
3. 回到 5 轮前的 message 说"从这里重新走"。

ChatGPT / Claude.ai / Cursor 都有 branching UI（左右箭头切换 sibling messages）。用户对此有明确需求。

## 存储 schema

现有 `chat_message` 表大致包含 `id / conversation_id / role / content / created_at / order`。加三列：

```sql
ALTER TABLE chat_message ADD COLUMN parent_message_id TEXT REFERENCES chat_message(id);
ALTER TABLE chat_message ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'main';
ALTER TABLE chat_message ADD COLUMN branch_label TEXT;
```

**语义**：
- `parent_message_id = null` → conversation root（第一条 user message）；
- `parent_message_id = X` → 这条 message 是接在 X 后面；
- `branch_id`：一个 UUID / short slug，同一条 branch 上的所有 message 共享；
- `branch_label`：可选，用户或 AI 命名（"用 Claude-Haiku 试试" / "从技术角度切入"）。

线性对话 == 所有 message `branch_id = 'main'`，`parent_message_id` 按 order 递增。

**查询 pattern**：
- 加载 conversation：`SELECT * FROM chat_message WHERE conversation_id = ? ORDER BY created_at`（不变）；
- 加载"当前显示分支"：从当前 leaf 反向沿 `parent_message_id` 回溯到 root（O(depth)）。
- 树结构：客户端把 messages 按 `parent_message_id` group 成 tree。

## UI 形态

**三档形态选择**（推荐 B）：

### A. 只用 sibling 箭头（ChatGPT 现状）
每条 assistant message 底下 `< 2/3 >` 分页箭头。不显示树结构。

- 优点：低复杂度。
- 缺点：3+ 分叉后用户迷路。

### B. 侧栏 minimap + 主对话流
主对话流保持线性显示当前分支；右侧一个小 minimap 或 outline 显示分叉树，点击 minimap 切换分支。

- 优点：既保持主流线性阅读，也提供全局视图。
- 缺点：需要写一个树可视化组件。
- **推荐**：与 conversation outline（当前 chat view 已有）复用。

### C. 全屏 tree canvas
类似 Excalidraw 画板显示所有分支节点。

- 优点：探索型用户爱。
- 缺点：日常写作用户不需要。

**决定**：MVP 用 B，Wave 4+ 视用户反馈决定是否加 C。

## 产品判断

| 问题 | 决定 |
|---|---|
| 分叉后原分支删掉吗？ | 否。所有分支永久保留。可以手动 "prune this branch"。 |
| Auto-merge 支持吗？ | 否。手动"copy from branch X" 就够了。 |
| 分支跨模型吗？ | 是。每条 message 已有 `provider / model_id` 字段，天然支持。 |
| 分支 count 上限？ | 软限制 20 条 branch/conversation。超过给 warn。 |
| Analytics / usage 怎么算？ | 按 message-level，跟 branch 无关。 |
| 导出 vault 时怎么保存？ | 按当前显示的 branch 导。full-tree export 是 Follow-up。 |

## 依赖 / 阻塞

- 需要在 chat message store 加载路径上把 tree structure 建起来 → `useChatDataStore` 加 `getMessageTree()` selector；
- 需要 Streamdown 侧的 message renderer 拿到 `siblings.count` 才能显示 `< 1/3 >` 箭头。

不阻塞。

## 竞品参考

- **ChatGPT**：sibling 箭头，无 tree view。
- **Claude.ai**：同 ChatGPT，最近才加。
- **Cursor**：edit + retry，无 branch 概念。
- **Perplexity**：无 branch。
- **Cline / Roo Code**：只有 revert-to-state，无 branch UI。

Peak 的差异化：**minimap + label + cross-model**（B 方案）。

## 成本估算

| 项 | 成本 |
|---|---|
| Schema migration | 半天 |
| Store selector / tree builder | 半天 |
| Message renderer siblings 箭头 | 半天 |
| Minimap 组件 | 1-2 天 |
| Branch label rename UI | 半天 |
| QA / edge cases（分叉后 delete、undo） | 半天 |

**总计**：3-4 天工程 + 1 天 QA。

## 决策

- **必要性**：**中高**。ChatGPT-style 用户会明显期待。
- **优先级**：Wave 4 之后。放在 D1 Ambient Current Work State 之后，与 D2 Copilot Command Center 一起做（都涉及 conversation state 重构）。

## Next steps

1. Schema migration PoC
2. Tree builder + selectors
3. Minimap component + Streamdown message hooks
4. Cross-model branching e2e test
