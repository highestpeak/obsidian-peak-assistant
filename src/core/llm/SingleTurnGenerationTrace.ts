import type { LLMUsage } from '@/core/providers/types';

/** Ephemeral request/response evidence for one provider round-trip. */
export type SingleTurnGenerationTraceEvent = {
	requestId: string;
	phase: 'request' | 'stream' | 'response' | 'failed';
	startedAt: number;
	completedAt?: number;
	systemPrompt: string;
	userPrompt: string;
	responseText?: string;
	/** Provider-emitted reasoning channel only; never synthesized by Peak. */
	reasoningText?: string;
	usage?: LLMUsage;
	error?: string;
};
