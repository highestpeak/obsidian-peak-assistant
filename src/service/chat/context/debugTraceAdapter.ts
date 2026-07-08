// Debug-trace helpers for the chat context pipeline.
//
// The pipeline stays in charge of assembly; this adapter only records what
// happened. Callers pass an optional `debugRun?: DebugRunHandle`; every
// record function is a no-op when omitted.
//
// Redaction:
//   - Slot content excerpts are captured, never raw content. The recorder
//     itself gates whether raw is retained; excerpts are always safe.

import type { DebugRunHandle } from '@/core/debug-trace';
import type { GovernedSlot } from './BudgetGovernor';
import type { CompactSummary } from '@/core/context/compactSummary';

/** Record the outcome of building all slots (before budget governance). */
export function recordSlotBuild(
	debugRun: DebugRunHandle,
	items: readonly GovernedSlot[],
): void {
	for (const item of items) {
		const span = debugRun.startSpan({
			kind: 'context.assemble',
			name: item.slot.id,
		});
		span.setParams({ slotId: item.slot.id });
		span.addMetric('tokens', item.content.tokens);
		const preview = renderableExcerpt(item);
		span.setOutput({
			raw: preview,
			contentType: 'text/markdown',
		});
		span.finish();
	}
}

/** Record the budget governance result — surviving slots + dropped + compact. */
export function recordBudgetGovernance(
	debugRun: DebugRunHandle,
	input: {
		before: readonly GovernedSlot[];
		after: readonly GovernedSlot[];
		compactSummaries: readonly CompactSummary[];
		totalBudget: number;
	},
): void {
	const span = debugRun.startSpan({
		kind: 'context.compact',
		name: 'budget-governor',
	});
	span.setParams({ totalBudget: input.totalBudget });
	const tokensBefore = input.before.reduce((s, i) => s + i.content.tokens, 0);
	const tokensAfter = input.after.reduce((s, i) => s + i.content.tokens, 0);
	span.addMetric('tokensBefore', tokensBefore);
	span.addMetric('tokensAfter', tokensAfter);
	span.addMetric('slotsBefore', input.before.length);
	span.addMetric('slotsAfter', input.after.length);
	const survived = new Set(input.after.map((i) => i.slot.id));
	for (const dropped of input.before) {
		if (survived.has(dropped.slot.id)) continue;
		span.addDecision({
			decision: 'drop',
			target: dropped.slot.id,
			reason: 'budget-exceeded',
			meta: { tokens: dropped.content.tokens },
		});
	}
	for (const compact of input.compactSummaries) {
		span.addDecision({
			decision: 'demote',
			target: compact.origin,
			reason: compact.summary,
			meta: {
				level: compact.level,
				lostDetail: compact.lostDetail,
				suggestedRefetch: compact.suggestedRefetch,
			},
		});
	}
	span.finish();
}

/** Record the final assembled prompt shape (message count + rough tokens). */
export function recordAssembledPrompt(
	debugRun: DebugRunHandle,
	input: {
		profileId: string;
		messageCount: number;
		totalTokens: number;
		durationMs: number;
	},
): void {
	debugRun.mergeSummary({
		profileId: input.profileId,
		messageCount: input.messageCount,
		contextTokens: input.totalTokens,
		assembleDurationMs: input.durationMs,
	});
}

function renderableExcerpt(item: GovernedSlot): string {
	// GovernedSlot.content is capability-specific; render() produces the
	// LLMRequestMessage[]. Pull the first message's text as an excerpt; if
	// unavailable, fall back to JSON-stringifying the content.
	try {
		const rendered = item.slot.render(item.content);
		if (rendered.length > 0) {
			const first = rendered[0];
			if (typeof first?.content === 'string') return first.content;
			if (Array.isArray(first?.content)) {
				const textPart = first.content.find(
					(p) => typeof p === 'object' && p !== null && 'text' in (p as object),
				) as { text?: string } | undefined;
				if (textPart?.text) return textPart.text;
			}
		}
	} catch {
		// swallow — we only want a best-effort excerpt
	}
	try {
		return JSON.stringify(item.content);
	} catch {
		return String(item.content);
	}
}
