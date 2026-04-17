# AI Analysis UX Overhaul — Design Spec

> Date: 2026-04-17
> Status: Draft
> Priority order: ① Report rendering → ② Persistence → ③ Continue append → ④ Sources improvements → ⑤ Multi-lens React Flow → ⑥ Search page quick actions

## Problem Statement

AI Analysis 功能存在多个 UX/UI 问题，来自用户标注的 9 张截图批注：

- **Report 渲染质量差**: 表格排版乱、markdown 段落合并、缺乏加粗、链接不可点击、TOC 字符串乱跳、颜色不统一
- **无持久化**: V2 的 process steps / plan / report / sources / graph 都没有保存，分析完关闭即丢失
- **Continue 行为错误**: 每次 Continue 触发全新搜索，旧结果被覆盖，无历史保留
- **Sources tab 信息架构弱**: 无排序分组，mermaid mindmap 过于简单
- **Mermaid 图不可靠**: 渲染不稳定，交互能力差，应替换为 React Flow multi-lens
- **搜索页缺少快捷操作**: 无 suggest query，无快捷入口

## Decision Record

| 决策点 | 选项 | 结论 |
|--------|------|------|
| Mermaid vs React Flow | A: 增强 mermaid / B: 全面 React Flow / C: 混合 | **B**: 全面 React Flow multi-lens |
| 持久化结构 | A: 线性平铺 / B: Report 主体 + callout 折叠 / C: 多文件 | **B**: 单文件，Report 是主体，辅助信息用 callout 折叠 |
| Continue 行为 | A: 追加模式 / B: 智能 merge / C: 批注+合并 | **A**: 追加 + Synthesize All |
| Report 渲染修复 | A: 主攻 prompt / B: 主攻 CSS / C: 双管齐下 | **C**: prompt 约束 + 防御性 CSS |

---

## Phase ①: Report 渲染质量修复

### 1.1 Prompt 侧规范

在 playbook 和 report section prompt 中增加格式约束：

- **表格**: 标准 markdown 表格，列数 ≤ 5，不生成半宽表格
- **加粗**: 关键结论、数据指标、产品名称必须 `**加粗**`
- **标题层级**: section 内容只用 `###` 和 `####`，不用 `#` `##`
- **禁止 TOC**: 不生成目录/导航链接
- **链接**: vault 文件引用用 `[[wikilink]]` 语法
- **列表**: 有序 `1. 2. 3.`，无序 `- `，不混用
- **禁止内联样式**: 不使用 HTML style 属性
- **语言**: 严格 match 用户 query 语言（CRITICAL）

### 1.2 渲染侧 CSS 修复（StreamdownIsolated）

| 问题 | 修复 |
|------|------|
| 表格半宽 | `table { width: 100%; }` |
| 表格排版乱 | 统一 `th/td` padding、border、text-align |
| 链接无法点击 | wikilink click handler 注册到 shadow DOM，绑定 `app.workspace.openLinkText()` |
| TOC 字符串乱跳 | 检测并过滤 `[toc]` / `[[toc]]` 标记 |
| 段落合并 | `p { margin-bottom: 0.75em; }` |
| 半宽元素 | block 级元素 `max-width: 100%` |

### 1.3 颜色/主题一致性

所有颜色统一使用 Obsidian CSS 变量，不硬编码 hex/rgb：

| 元素 | CSS 变量 |
|------|----------|
| 表格表头背景 | `var(--background-secondary)` |
| 表格边框 | `var(--background-modifier-border)` |
| 表格偶数行 | `var(--background-secondary-alt)` |
| 链接颜色 | `var(--text-accent)` |
| 加粗文字 | `var(--text-normal)` + `font-weight: 600` |
| 代码块背景 | `var(--code-background)` |
| callout 边框/背景 | `var(--callout-*)` 系列变量 |
| 高亮标签 | `var(--interactive-accent)` + `var(--text-on-accent)` |

VizRenderer 组件配色从 `getComputedStyle(document.body)` 读取 Obsidian CSS 变量。

Prompt 侧禁止 LLM 生成 HTML style 属性。

---

## Phase ②: 持久化 — 全量保存到单个 Markdown

### 2.1 文件结构

```markdown
---
type: ai-analysis
query: "用户的原始查询"
timestamp: 2026-04-17T14:30:00
duration: 45s
tokens: { input: 12000, output: 8500 }
sources_count: 13
---

# AI Analysis: 用户查询的简短标题

> [!abstract]- Process Log
> - 🔍 Browsing vault structure (82 notes, 1248 files) — 4.3s
> - 📖 Reading B-2-创意和想法管理 — 8.1s
> - 📖 Reading CA-WHOAMI — 6.5s
> - 🔎 Searching "独立开发 产品 想法" — 3.2s
> - ...

> [!note]- Analysis Plan
> ### 1. 产品库存盘点
> **Brief**: 梳理 50+ 个想法的成熟度分类...
> **Sources**: [[B-2-创意和想法管理]], [[A-All Ideas]]
>
> ### 2. 高回报路径分析
> **Brief**: 对比 PeakAssistant vs CiamoReader...
> **Sources**: [[B-5-付费策略]], [[Z-1-商业路径]]

## Executive Summary

（AI 生成的总结）

## 1. 产品库存盘点

（section 完整内容）

## 2. 高回报路径分析

（section 完整内容）

> [!info]- Sources
> | # | Source | Relevance |
> |---|--------|-----------|
> | 1 | [[kb1-life-notes/CA-WHOAMI/B-想做的事情]] | 核心产品想法库 |
> | 2 | [[B-5-付费策略和变现策略]] | 商业模式分析 |

> [!tip]- Graph Data
> ```json
> {
>   "lenses": {
>     "topology": { "nodes": [...], "edges": [...] }
>   },
>   "generatedAt": "2026-04-17T14:30:00"
> }
> ```

> [!question] Follow-up Questions
> - 哪些想法可以在一周内做出 MVP？
> - PeakAssistant 的技术壁垒在哪里？
```

### 2.2 设计要点

- **frontmatter**: query、时间、token 统计，方便 Dataview 查询
- **Report 是主体**: Executive Summary + sections 直接平铺
- **辅助信息折叠**: Process/Plan/Sources/Graph 用 Obsidian callout `> [!type]-` 默认收起
- **Graph JSON**: 存在折叠 callout 里，重新打开可恢复 React Flow 图
- **Follow-up Questions**: 不折叠

### 2.3 保存时机

- 分析完成后自动保存（扩展现有 auto-save）
- Continue 每轮完成后增量更新同一文件
- 手动 Save 按钮保留

### 2.4 实现

扩展 `AiSearchAnalysisDoc`（`src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts`），新增 V2 数据源：
- 从 `searchSessionStore` 读取 `v2Steps`（→ Process Log）
- 从 `v2ProposedOutline` + `v2PlanSections`（→ Plan）
- 从 `v2PlanSections` content（→ Report sections）
- 从 `v2Sources`（→ Sources table）
- 从 graph 组件导出 JSON（→ Graph Data）
- 从 `v2FollowUpQuestions`（→ Follow-up Questions）

---

## Phase ③: Continue 追加模式

### 3.1 Agent 流程

Continue 走 Claude Agent SDK，启动 `ContinueAnalysisAgent`：

```
[用户点 Continue + 输入追问]
     ↓
[ContinueAnalysisAgent 启动]
  ├── System Prompt: vault-sdk-playbook + continue-specific 指令
  ├── Context（system message 注入）:
  │     ├── 原始 query
  │     ├── 所有 rounds 的完整 report sections（全文）
  │     ├── Executive Summary
  │     ├── Sources 列表 + relevance
  │     ├── Graph 关系摘要（top-N 关键关系自然语言）
  │     └── 用户批注（annotations）
  └── User Message: 追问内容
     ↓
[Agent 使用 vault tools: read_note, grep, list_folders, submit_plan]
     ↓
[ReportOrchestrator 生成新 sections]
     ↓
[追加到 Report，标记 Round N]
```

### 3.2 Context 构建

```typescript
interface ContinueContext {
  originalQuery: string;
  rounds: {
    query: string;
    summary: string;
    sections: { title: string; content: string }[];  // 全文
    annotations: Annotation[];
  }[];
  sources: {
    path: string;
    relevance: string;
    readDepth: 'full' | 'partial' | 'title-only';
  }[];
  graphSummary: {
    nodeCount: number;
    keyRelationships: string[];  // top-10 边的自然语言描述
  };
}
```

Token 控制：如果总 context 超过 30k tokens，降级为 summary + 各 section 前 200 字。

### 3.3 批注（Annotation）

```typescript
interface Annotation {
  roundIndex: number;
  sectionIndex: number;
  selectedText?: string;
  comment: string;
  type: 'question' | 'disagree' | 'expand' | 'note';
}
```

UI：用户在 report section 中选中文字 → 弹出工具栏 → 选类型 → 输入批注。批注显示为 section 侧边标记。

Continue 时 agent prompt 包含批注信息，如：
```
用户批注：
- Section "产品库存盘点" | "高风险高回报" | [追问]: "风险具体指什么？"
- Section "路径分析" | "建议冻结开发" | [不同意]: "不想冻结，想并行"
```

### 3.4 UI 变化

- **Report tab**: sections 按 round 分组，round 分隔线 + 标签 `── Round 2: 追问内容 ──`
- **底部按钮**: Continue 旁新增 **Synthesize All**（Round ≥ 2 时显示）
- **Process tab**: 每个 round 的 tool calls 追加显示，round 分隔

### 3.5 Store 变化

- `searchSessionStore` 新增 `rounds: Round[]`
- `performAnalysis()` 在 continue 模式下 push 新 Round 而非 reset
- `v2PlanSections` → `getAllSections()`（flatten all rounds）
- `v2Sources` 合并所有 rounds sources（去重）

### 3.6 Synthesize

- 启动 `SynthesizeAgent`（不需要 vault tools，纯文本整合）
- 输入：所有 rounds 全文 + 批注
- 输出：一份连贯的最终报告
- 替换所有 rounds 为单个 "Synthesized" Round
- markdown 文件同步更新

---

## Phase ④: Sources Tab 改进

### 4.1 List 视图

- **按路径前缀分组**: 提取公共前缀（如 `kb1-life-notes/CA-WHOAMI/`），同前缀归组，可折叠
- **组内排序**: 按 relevance 降序（被引用次数 / 读取深度）
- **每个 source 增强**:
  - 引用次数 badge
  - 读取深度标记（full / partial / title-only）
  - 关联 section 标题列表（hover）

### 4.2 Graph 视图

移除 mermaid mindmap，替换为 React Flow `<MultiLensGraph lensType="topology" />`：
- **节点**: source 文件，大小 = relevance，颜色 = 前缀分组（Obsidian 主题色）
- **边**: wikilink 引用 + AI 语义关联
- **交互**: 点击 → `app.workspace.openLinkText()`，hover → source 摘要
- **布局**: d3-force

初版只做 topology lens，其他 lens 等 Phase ⑤。

### 4.3 按钮调整

- **Open in Chat** 保留
- Save icon → **Open in File** 文字按钮（保存并打开 markdown 文件）

---

## Phase ⑤: Multi-Lens React Flow

沿用 `2026-04-15-ai-graph-multi-lens.md` plan 设计。

### 5.1 组件复用

```
MultiLensGraph (共享组件)
├── topology lens  ← Sources Tab 默认使用
├── thinking-tree lens
├── cross-domain-bridge lens
└── timeline lens
```

`MultiLensGraph` 接受 `nodes/edges/lensType` props，Sources Tab 和独立 AI Graph 模式共用。

### 5.2 Graph 持久化格式

```json
{
  "lenses": {
    "topology": { "nodes": [...], "edges": [...] },
    "thinking-tree": { "nodes": [...], "edges": [...] }
  },
  "generatedAt": "2026-04-17T14:30:00"
}
```

存在 markdown callout `> [!tip]- Graph Data` 内，重新打开时从 JSON 恢复。

### 5.3 不做

- 实时协作编辑图
- 手动拖拽创建节点/边
- 图导出（PNG/SVG）

---

## Phase ⑥: 搜索页快捷操作

### 6.1 固定预设问题

配置在 `templates/config/default-analysis-queries.json`，用户可编辑。默认 5-8 个通用问题：
- "分析知识库结构"
- "最近笔记的主题趋势"
- "找出知识盲区"
- ...

### 6.2 历史问题学习

后台定时任务（每天一次 / 累计 10 次分析后触发）：
- 读取 `ai_analysis_record` 历史 query
- 简单聚类：高频关键词 / 相似 query 归并
- 输出 top-5 常问模式，存 SQLite 配置表
- 搜索页展示：常问模式 + 预设问题合并，常问排前

### 6.3 Quick Actions

- **Re-analyze**: 一键用最近一条历史 query 重新分析
- **Vault Overview**: 预设全面分析 query

零 token 消耗。

---

## 与现有 Plan 的关系

| 现有 Plan | 关系 |
|-----------|------|
| `2026-04-15-report-quality-overhaul.md` | Phase ①②④ 吸收其核心目标（移除 token cap、JSON viz pipeline、inline citation）。该 plan 的 viz pipeline 部分继续执行 |
| `2026-04-15-ai-graph-multi-lens.md` | Phase ⑤ 直接沿用，不重复设计 |
| `2026-04-14-report-ui-quality.md` | Phase ① 覆盖其 5 个 fix item |
| `2026-04-13-v2-report-quality-and-ui-fixes.md` | Phase ①③ 覆盖 report quality + continue chips |

## Token 统计需求

所有 Phase 共用：在 footer 区域显示当前分析的 token 使用统计（input / output / total），数据从 stream event 的 usage 字段累加。持久化到 markdown frontmatter 的 `tokens` 字段。
