import type {
	HubCurationDecision,
	HubCurationSubmit,
} from '@/core/schemas/agents/hubCuration';
import type { HubCurationMemory } from './types';

// Merge a new HubCurationSubmit into HubCurationMemory. Later submits override
// earlier ones for the same nodeId (LLM revises its own plan). Coverage +
// confidence are set to the most recent submit; iteration count is incremented.

export function buildInitialHubCurationMemory(): HubCurationMemory {
	return {
		decisions: [],
		coveragePct: 0,
		confidence: 0,
		iterations: 0,
		lastSubmit: null,
	};
}

export function mergeSubmitIntoMemory(
	memory: HubCurationMemory,
	submit: HubCurationSubmit,
): HubCurationMemory {
	const byNode = new Map<string, HubCurationDecision>();
	for (const d of memory.decisions) byNode.set(d.nodeId, d);
	for (const d of submit.hubs) byNode.set(d.nodeId, d);
	const coveragePct = submit.coverage.totalMembers > 0
		? submit.coverage.coveredMembers / submit.coverage.totalMembers
		: 0;
	return {
		decisions: [...byNode.values()],
		coveragePct,
		confidence: submit.confidence,
		iterations: memory.iterations + 1,
		lastSubmit: submit,
	};
}
