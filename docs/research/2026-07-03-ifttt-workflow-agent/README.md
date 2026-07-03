# IFTTT / Workflow Agent — 2026-07-03

## 一句话结论

**Peak 的 workflow 底层已经存在 `CommandGateway`（触发端）+ `CapabilityRegistry`（可执行能力）；缺的是"触发器 → 一连串 capability 编排"的定义层和 UI。推荐做<em>本地化 IFTTT</em>：`Trigger → Filter → Actions[]`，触发器包含 vault-event / clock / manual；action 是 CapabilityGatewayBinding。不做 SaaS 化 IFTTT / Zapier 集成。**

## 现有基础设施

- `CommandGateway` (B1 landed)：支持任意触发源（palette / URI / MCP）通过 id dispatch capability。
- `CapabilityRegistry` (T13 landed)：surface 侧注册能力状态。
- `SessionContextService` + `EventBus`：内部事件已存在。
- Vault 事件（file created / modified / deleted）：Obsidian 官方 API。

未有：
- Cron-like 时间触发
- Chained action（capability A 完成后 → capability B）
- Workflow UI

## Workflow 定义

```typescript
interface PeakWorkflow {
  id: string;
  name: string;
  enabled: boolean;
  trigger:
    | { kind: 'manual'; commandId: string }
    | { kind: 'file-created'; folder?: string; pathPattern?: string }
    | { kind: 'file-modified'; folder?: string; pathPattern?: string }
    | { kind: 'cron'; cron: string }        // 每日 6am 等
    | { kind: 'ambient-suggestion' }         // Ambient 建议后
    | { kind: 'lint-finding'; signalId: string };  // 特定 lint 触发
  filter?: {
    tagIncludes?: string[];
    contentMatches?: string;  // regex
    llmJudgeExpression?: string;  // LLM 判定 "对不对？"
  };
  actions: WorkflowAction[];
}

type WorkflowAction =
  | { kind: 'capability'; capabilityId: string; inputTemplate: string }
  | { kind: 'notify'; message: string }
  | { kind: 'vault-write'; pathTemplate: string; contentTemplate: string }
  | { kind: 'delay'; ms: number };
```

存 `plugin.data.workflows[]`。

## 示例 workflows

- **每周日整理**：cron `0 20 * * 0` → capability "Vault Lint scan" → capability "Weekly digest" → vault-write `weekly/YYYY-Www.md`
- **新 daily note 自动填**：`file-created` folder=daily → capability "Fill daily template" → capability "Ambient briefing"
- **每次 hub 被标 stale**：`lint-finding` T-STALE-HUB → notify "Hub X 已 stale，考虑 regenerate"

## 决策

- **必要性**：**中-高**。power user 明确要，普通用户看不到。
- **优先级**：Wave 6+。等 gateway + registry 稳定。
- **依赖**：CommandGateway 落地（B1 ✅）。

## 与 R11 (n8n / multi-agent) 的关系

R11 是 SaaS/编排 marketplace 方向；R10 是本地简单编排。R10 是 R11 的一个基础组件；先落 R10 再看是否要 R11。

## Next steps

1. Workflow schema PoC
2. Trigger dispatcher (监听 EventBus + cron scheduler)
3. Workflow editor UI（form-based，不做拖拽画布）
4. 3-5 个内置模板
