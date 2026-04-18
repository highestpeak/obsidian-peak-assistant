# Graph Layout Fix — "能看清就行"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix graph layout so nodes don't overlap, edges don't cross unnecessarily, and labels don't obscure each other.

**Architecture:** Five independent fixes in `src/ui/component/mine/multi-lens-graph/`: (1) dynamic handle direction, (2) spacing params, (3) edge label density control, (4) deterministic d3-force, (5) CJK width for dagre. All within the graph component — no external interface changes.

**Tech Stack:** React Flow, d3-force, dagre

---

### Task 1: Dynamic handle direction based on relative node position
### Task 2: Increase spacing parameters across all 4 layouts
### Task 3: Edge labels — hide by default on dense graphs, show on hover
### Task 4: Deterministic d3-force initial positions
### Task 5: Use CJK-aware width estimation in dagre tree layout
