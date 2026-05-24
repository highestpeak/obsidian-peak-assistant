/**
 * Public surface for the self-hosted agent harness. Consumers should only
 * import from this module — internal layout may shift between M-phases.
 */

// Loop
export { runAgentLoop } from './loop/AgentLoop';
export { evaluateStopConditions, hasFinalAnswer, budgetExceeded, abortRequested } from './loop/stopConditions';
export type {
    AgentLoopConfig,
    AgentLoopResult,
    AgentLoopBudget,
    AgentLoopFinishReason,
} from './loop/types';
export { DEFAULT_BUDGET } from './loop/types';

// Tier
export { TierController } from './tier/TierController';
export { defaultTierBindings } from './tier/bindings';
export { scoreStep } from './tier/scoreStep';
export {
    TIER_ORDER,
    DEFAULT_TIER_POLICY,
    DEFAULT_TIER_CAPABILITIES,
} from './tier/types';
export type {
    ModelTier,
    TierBinding,
    TierBindings,
    TierPolicy,
    TierCapabilities,
} from './tier/types';

// Tool
export { ToolRegistry } from './tool/registry';
export { ok, fail } from './tool/types';
export { adaptMcpServer, adaptAllMcpTools } from './tool/McpToolAdapter';
export type { ToolDef, ToolExecCtx, ToolResult } from './tool/types';

// Skill
export { HarnessSkillRegistry, defaultLifter } from './skill/SkillRegistry';
export type { HarnessSkill, SkillSummary, SkillInvocation } from './skill/types';

// Trace
export { TraceBus } from './trace/events';
export type {
    StepResult,
    ToolCallTrace,
    ToolResultTrace,
    TierUpgradeEvent,
    ContextCompactedEvent,
    TraceEventMap,
    TraceEventName,
    TraceHandler,
} from './trace/events';

// Permission (M2)
export { PermissionGuard, DEFAULT_PERMISSION_MODE, isMutating, ruleMatches } from './permission';
export type {
    PermissionConfig,
    PermissionDecision,
    PermissionDecisionAllow,
    PermissionDecisionDeny,
    PermissionMode,
    PermissionRule,
    ToolForPermission,
    ToolKind,
} from './permission';

// Hook (M2)
export { HookBus, runHook, matcherApplies } from './hook';
export type {
    HookConfig,
    HookContext,
    HookContextMap,
    HookEvent,
    HookHandler,
    HookResult,
    HookSessionPayload,
    HookToolCallPayload,
    HookToolResultPayload,
} from './hook';

// SubAgent (M2)
export { SubAgentDispatcher, buildSubagentTool, subagentToolName } from './subagent';
export type {
    DispatcherCtx,
    DispatchOptions,
    SubAgentDefinition,
    SubAgentDispatchSummary,
} from './subagent';

// Memory (M3)
export {
    MemoryStore,
    ReflectionStore,
    InMemoryReflectionStore,
    createMemoryBlock,
    renderMemoryBlock,
    renderMemoryBlocks,
    DEFAULT_BLOCK_PRIORITY,
} from './memory';
export type {
    MemoryBlock,
    MemoryStoreSnapshot,
    Reflection,
    ReflectionStoreLike,
} from './memory';

// Context (M3)
export { ContextManager, DEFAULT_CONTEXT_CONFIG } from './context';
export type { ContextManagerConfig, CompactionResult } from './context';
