# AI Graph Agent Design

> 用 Anthropic Agent SDK 的 tool-use loop 生成知识图谱，替代当前基于物理数据的图渲染。

## 问题

当前 Graph 视图（Topology / Bridges / Timeline）基于物理数据（wikilinks、文件夹路径、文件 ctime），存在以下问题：

1. **Topology 无边**：当源文件间无物理链接或语义近邻时，退化为散列网格，与 List 视图无信息增量
2. **Bridges 无结构**：桥梁判定仅基于 "不同顶级文件夹"，无法识别真正的跨主题连接
3. **Timeline 无时间感**：等距排列丢弃时间间隔信息，无时间轴线、无日期标注、无演化链
4. **边类型 bug**：`build-sources-graph.ts:141` 所有边都写成 `kind: "link"`，UI 层的边类型颜色区分是死代码
5. **Tab 无 tooltip**：Topology / Bridges / Timeline 对普通用户不直觉

核心问题：图比 List 应该多传达至少一个维度的信息（关系、聚类、演化），当前三个 tab 都没有做到。

## 设计

### 架构概览

```
用户搜索 → AI Search → Top Sources
                          ↓
                    Graph Agent (并行启动)
                          ↓
                    结构化 JSON → 缓存在搜索结果中
                          ↓
              用户切换到 Graph → 直接渲染三个 Tab
```

- Graph Agent 在搜索结果产出后立即启动，不等用户点击 Graph 按钮
- 图数据缓存在搜索结果状态中，切换 List/Graph 不重新调用
- 如果用户切到 Graph 时 agent 还在跑，显示 loading 状态

### Agent 设计

**SDK**: `@anthropic-ai/sdk`，使用 tool-use loop 模式。

**模型**: `claude-sonnet-4-20250514`（速度和质量平衡；图结构推理不需要 Opus 级别）。

**初始 Context**（system prompt）:
- 用户的搜索查询
- source 文件列表（path + 文件名 + 文件夹 + ctime + mtime + relevance score）

**工具（2个）**:

#### `read_sources`

批量读取所有源文件内容和双向链接。

```typescript
// 输入
{ paths: string[] }

// 输出
Array<{
  path: string;
  content: string;           // 文件全文
  outgoing_links: string[];  // 从该文件出发的 wikilinks
  incoming_links: string[];  // 指向该文件的 wikilinks
}>
```

#### `submit_graph`

提交最终图结构 JSON，结束 agent loop。

```typescript
// 输入：GraphOutput schema（见下方）
```

**典型 Agent Loop（2轮）**:
1. Agent 调用 `read_sources(所有 paths)` → 获得全部内容和 links
2. Agent 分析关系、聚类、桥梁、演化链 → 调用 `submit_graph(JSON)`

### 输出 Schema（`GraphOutput`）

一份 JSON 供三个 Tab 消费：

```typescript
interface GraphOutput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  bridges: GraphBridge[];
  evolution_chains: EvolutionChain[];
}

interface GraphNode {
  path: string;                              // vault 文件路径
  label: string;                             // 显示名称
  role: 'hub' | 'bridge' | 'leaf';           // AI 判定的角色
  cluster_id: string;                        // 所属主题聚类 id
  summary: string;                           // 一句话摘要
  importance: number;                        // 0-1，映射节点大小
  created_at?: number;                       // unix ms，用于 Timeline 定位
}

interface GraphEdge {
  source: string;                            // 源节点 path
  target: string;                            // 目标节点 path
  kind: 'builds_on' | 'contrasts' | 'complements' | 'applies' | 'references';
  label: string;                             // AI 生成的边描述
  weight: number;                            // 0-1，映射边粗细
}

interface GraphCluster {
  id: string;                                // 聚类标识
  name: string;                              // 聚类名称（如 "AI产品设计"）
  description: string;                       // 聚类描述
}

interface GraphBridge {
  node_path: string;                         // 桥梁节点 path
  connects: [string, string];                // 连接的两个 cluster id
  explanation: string;                       // AI 解释为什么是桥梁
}

interface EvolutionChain {
  chain: string[];                           // 按思想演化排序的 path 列表
  theme: string;                             // 演化链主题描述
}
```

### Tab 可视化设计

#### Topology（关系图）

- **Tooltip**: "展示文档间的语义关系和知识结构"
- **数据消费**: `nodes` + `edges` + `clusters`
- **布局**: dagre TB，hub 居中，leaf 在外围
- **节点大小**: `importance` 值映射
- **节点颜色**: `cluster_id` 映射到调色板
- **边样式**:
  | kind | 颜色 | 线型 |
  |------|------|------|
  | `builds_on` | 蓝色 `#89b4fa` | 实线 |
  | `complements` | 绿色 `#a6e3a1` | 虚线 |
  | `contrasts` | 红色 `#f38ba8` | 虚线 |
  | `applies` | 黄色 `#f9e2af` | 实线 |
  | `references` | 灰色 `#585b70` | 细实线 |
- **边标签**: `edge.label` 显示在边中点
- **节点角色视觉区分**:
  - Hub: 加粗边框 + 聚类色
  - Bridge: 虚线边框 + 粉色
  - Leaf: 普通边框
- **图例**: 右下角，包含边类型 + 聚类颜色 + 节点角色

#### Bridges（知识桥梁）

- **Tooltip**: "标识跨越知识领域的关键连接文档"
- **数据消费**: `clusters` + `bridges` + `nodes`
- **布局**: 泳道式
  - 每个 `cluster` 一个垂直泳道（虚线边框 + 聚类色 + 标签）
  - 桥梁节点放在中间列，两侧连线到它 `connects` 的两个 cluster
  - 非桥梁节点收在所属 cluster 泳道内
- **桥梁节点样式**: 虚线边框 + 粉色 + 显示 `explanation` 作为副标题
- **连接线**: 从桥梁节点到两侧泳道的实线

#### Timeline（演化时间线）

- **Tooltip**: "展示知识积累和思想演化的时间脉络"
- **数据消费**: `evolution_chains` + 节点 `created_at`
- **布局**: 水平时间轴
  - 时间轴线（水平基准线）+ 日期刻度
  - 节点按真实时间间距定位（非等距）
  - 有演化链的节点分布在轴线上下，用箭头连接
  - 独立节点（不在任何 chain 中）半透明靠近轴线
- **演化链**: 每条 chain 一种颜色，用带箭头的曲线连接 chain 中的节点
- **演化链标签**: chain 附近标注 `theme`
- **日期刻度**: 自动计算合适的间隔（日/周/月）

### Tab Tooltip

每个 tab 标签增加 `title` 属性：

| Tab | Tooltip |
|-----|---------|
| Topology | 展示文档间的语义关系和知识结构 |
| Bridges | 标识跨越知识领域的关键连接文档 |
| Timeline | 展示知识积累和思想演化的时间脉络 |

### 空状态处理

- Agent 正在运行时：显示骨架屏 + "正在分析文档关系..."
- Agent 完成但某个 tab 无有效数据时（如 Bridges 未发现桥梁节点）：显示说明文字 "当前源文件之间未发现跨领域桥梁连接"
- Agent 失败时：显示错误信息 + 降级到物理数据（当前逻辑）

### 集成点

**触发位置**: 搜索结果产出后，在 `AIServiceManager` 或搜索结果处理层启动 graph agent。

**数据流**:
1. AI Search 返回 `SearchResultItem[]`
2. 并行启动 Graph Agent，传入 source 列表
3. Agent 完成后，`GraphOutput` 存入搜索结果状态（Zustand store 或 view state）
4. 前端 `MultiLensGraph` 组件从状态中读取 `GraphOutput`，按 tab 过滤和布局
5. `buildLensGraphFromSources`（当前入口）替换为新的 agent 调用

**缓存**: 同一搜索结果的图数据缓存在 store 中，切换 List ↔ Graph 不重新调用。用户发起新搜索时清除。

## 文件影响

| 文件 | 变更 |
|------|------|
| `src/service/agents/ai-graph/` | 新建 graph agent（Anthropic SDK client、tools、prompt） |
| `src/ui/component/mine/multi-lens-graph/types.ts` | 新增 `GraphOutput` 类型定义 |
| `src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts` | 改为从 `GraphOutput` 消费数据 |
| `src/ui/component/mine/multi-lens-graph/layouts/topology-layout.ts` | 适配新的 nodes/edges 结构 |
| `src/ui/component/mine/multi-lens-graph/layouts/bridge-layout.ts` | 重写为泳道式布局 |
| `src/ui/component/mine/multi-lens-graph/layouts/timeline-layout.ts` | 重写为时间轴布局 |
| `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx` | 添加 tab tooltip、空状态、loading |
| `src/ui/component/mine/multi-lens-graph/nodes/LensNodeComponent.tsx` | 适配新的 node data（importance→大小、cluster→颜色） |
| `src/ui/component/mine/multi-lens-graph/edges/LensEdgeComponent.tsx` | 适配新的 edge kind 集合 |
| `src/service/agents/ai-graph/build-graph-data.ts` | 替换为 agent 调用入口 |
| 搜索结果处理层 | 添加 graph agent 并行启动逻辑 |

## 不在范围

- Thinking Tree tab（保留现有 LLM 调用逻辑，不纳入本次重构）
- 图的交互编辑（拖拽重排、手动加边等）
- 多 provider 支持（本次锁定 Anthropic SDK）
