// Debug-trace helpers for Analyze / Report.
//
// One report generation = one DebugRun. Records:
//   1. custom span 'analysis-plan' — section list + evidence path count
//   2. model.call per generated section
//   3. artifact.write for the saved report
//   4. filter.decision for skipped sections (abort/fallback)
//
// The Analyze surface piggybacks on AnalysisReportRun's runId so the debug
// receipt is joinable with the RunEnvelope trace.

import type { DebugRunHandle } from '@/core/debug-trace';

export function recordAnalysisPlan(
	debugRun: DebugRunHandle,
	input: {
		userQuery: string;
		sections: ReadonlyArray<{ id: string; title: string }>;
		evidencePathCount: number;
	},
): void {
	const span = debugRun.startSpan({
		kind: 'custom',
		name: 'analysis-plan',
	});
	span.setParams({
		sectionCount: input.sections.length,
		evidencePathCount: input.evidencePathCount,
	});
	span.setInput({ raw: input.userQuery, contentType: 'query' });
	span.setOutput({
		raw: input.sections.map((s) => `${s.id}: ${s.title}`).join('\n'),
		contentType: 'text/plain',
	});
	span.finish();
}

export interface AnalysisSectionToolUse {
	readonly toolName: string;
	readonly toolCallId?: string;
	readonly inputExcerpt?: string;
	readonly outputExcerpt?: string;
	readonly ok?: boolean;
}

export function recordAnalysisSectionGeneration(
	debugRun: DebugRunHandle,
	input: {
		sectionId: string;
		sectionTitle: string;
		provider?: string;
		model?: string;
		promptExcerpt: string;
		responseExcerpt: string;
		tokens?: {
			prompt?: number;
			completion?: number;
			total?: number;
		};
		durationMs?: number;
		/**
		 * Tool calls the LLM made while generating this section (extracted
		 * from `tool_use` / `tool_result` blocks in the SDK message stream).
		 * Each entry becomes a `tool.call` child of the section's model.call
		 * span so the receipt shows agent/tool steps per section.
		 */
		toolUses?: readonly AnalysisSectionToolUse[];
	},
): void {
	const span = debugRun.startSpan({
		kind: 'model.call',
		name: `section-${input.sectionId}`,
	});
	span.setParams({
		sectionId: input.sectionId,
		sectionTitle: input.sectionTitle,
		provider: input.provider,
		model: input.model,
	});
	span.setInput({ raw: input.promptExcerpt, contentType: 'text/markdown' });
	span.setOutput({ raw: input.responseExcerpt, contentType: 'text/markdown' });
	if (input.tokens?.prompt !== undefined) span.addMetric('promptTokens', input.tokens.prompt);
	if (input.tokens?.completion !== undefined)
		span.addMetric('completionTokens', input.tokens.completion);
	if (input.tokens?.total !== undefined) span.addMetric('totalTokens', input.tokens.total);
	if (input.durationMs !== undefined) span.addMetric('durationMs', input.durationMs);
	// Emit per-tool child spans BEFORE finishing the section span; the child
	// span helper uses this parent so the tree shape is deterministic.
	for (const tool of input.toolUses ?? []) {
		const child = span.child({
			kind: 'tool.call',
			name: tool.toolName,
		});
		child.setParams({
			toolName: tool.toolName,
			...(tool.toolCallId ? { toolCallId: tool.toolCallId } : {}),
			...(tool.ok !== undefined ? { ok: tool.ok } : {}),
		});
		if (tool.inputExcerpt !== undefined) child.setInput({ raw: tool.inputExcerpt });
		if (tool.outputExcerpt !== undefined) child.setOutput({ raw: tool.outputExcerpt });
		child.finish();
	}
	span.finish();
}

export function recordAnalysisArtifact(
	debugRun: DebugRunHandle,
	input: {
		path: string;
		kind: string;
		bytes?: number;
	},
): void {
	const span = debugRun.startSpan({
		kind: 'artifact.write',
		name: input.kind,
	});
	span.setParams({ path: input.path, kind: input.kind });
	if (input.bytes !== undefined) span.addMetric('bytes', input.bytes);
	span.finish();
}

export function recordAnalysisSkip(
	debugRun: DebugRunHandle,
	input: {
		sectionId: string;
		reason: 'aborted' | 'fallback' | 'error';
		detail?: string;
	},
): void {
	const span = debugRun.startSpan({
		kind: 'filter.decision',
		name: 'section-skip',
	});
	span.addDecision({
		decision: 'skip',
		target: input.sectionId,
		reason: input.reason,
		...(input.detail !== undefined ? { meta: { detail: input.detail } } : {}),
	});
	span.finish();
}
