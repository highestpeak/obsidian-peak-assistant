/**
 * Harness Tool model. See spec §3.2.
 *
 * The type + helper vocabulary now lives in `@/core/types/tool.ts` so
 * `core/ports/ToolPort.ts` can reference it without inverting the
 * layering. This file re-exports the public surface — every downstream
 * consumer keeps its existing import path (`@/service/agents/harness/tool/types`).
 */

export type {
	ToolExecCtx,
	ToolResult,
	ToolSource,
	ToolDef,
} from '@/core/types/tool';

export { ok, fail } from '@/core/types/tool';
