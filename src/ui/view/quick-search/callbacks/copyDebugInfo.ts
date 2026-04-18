import { useSearchSessionStore } from '../store/searchSessionStore';

/**
 * Serialize the full AI search session state to plain text for debugging/sharing.
 * Returns the text string (caller is responsible for clipboard + UI feedback).
 */
export function buildDebugInfoText(): string {
	const s = useSearchSessionStore.getState();
	const lines: string[] = [];

	lines.push('=== AI Search Session Debug Export ===');
	lines.push(`Query: ${s.query}`);
	lines.push(`Status: ${s.status}  Duration: ${s.duration != null ? `${(s.duration / 1000).toFixed(1)}s` : '-'}`);
	if (s.startedAt) lines.push(`Started: ${new Date(s.startedAt).toISOString()}`);
	lines.push(`Analysis mode: ${s.runAnalysisMode ?? s.analysisMode}`);
	lines.push('');

	// ── Steps ──────────────────────────────────────────────────────────────
	for (const step of s.steps) {
		const dur = step.endedAt != null ? `${((step.endedAt - step.startedAt) / 1000).toFixed(1)}s` : 'running';
		lines.push(`${'─'.repeat(60)}`);
		lines.push(`[${step.type.toUpperCase()}]  status=${step.status}  duration=${dur}`);

		if (step.type === 'classify') {
			lines.push(`  Dimensions (${step.dimensions.length}):`);
			for (const d of step.dimensions) {
				lines.push(`  ┌ [${d.axis}] ${d.id.replace(/_/g, ' ')}`);
				if (d.intent_description) lines.push(`  │  intent: ${d.intent_description}`);
				if (d.scope_constraint) {
					const sc = d.scope_constraint;
					if (sc.path) lines.push(`  │  scope path: ${sc.path}`);
					if (sc.tags?.length) lines.push(`  │  scope tags: ${sc.tags.join(', ')}`);
					if (sc.anchor_entity) lines.push(`  │  anchor entity: ${sc.anchor_entity}`);
				}
				lines.push(`  └`);
			}

		} else if (step.type === 'decompose') {
			lines.push(`  ${step.dimensionCount} dimensions → ${step.taskCount} tasks`);
			for (const t of step.taskDescriptions) {
				lines.push(`  ┌ Task [${t.id}] priority=${t.searchPriority}`);
				lines.push(`  │  description: ${t.description}`);
				if (t.targetAreas.length) lines.push(`  │  target areas: ${t.targetAreas.join(', ')}`);
				if (t.toolHints.length) lines.push(`  │  tool hints: ${t.toolHints.join(', ')}`);
				if (t.coveredDimensionIds.length) lines.push(`  │  covers dimensions: ${t.coveredDimensionIds.join(', ')}`);
				lines.push(`  └`);
			}

		} else if (step.type === 'recon') {
			const doneCnt = step.tasks.filter(t => t.done).length;
			lines.push(`  Tasks: ${doneCnt}/${step.total}`);
			for (const t of step.tasks) {
				lines.push(`  ┌ T${t.index + 1} ${t.done ? '[done]' : '[running]'}  ${t.label ?? '?'}`);
				const taskLog = step.progressLog.filter(e => e.taskIndex === t.index);
				for (const entry of taskLog) {
					const ts = new Date(entry.timestamp).toISOString().slice(11, 23);
					lines.push(`  │  [${ts}] ${entry.label}: ${entry.detail}`);
				}
				lines.push(`  └`);
			}

		} else if (step.type === 'plan') {
			const snap = step.snapshot;
			if (snap) {
				lines.push(`  Confidence: ${snap.confidence ?? '-'}`);
				lines.push(`  Proposed outline:`);
				for (const line of (snap.proposedOutline ?? '').split('\n')) {
					lines.push(`    ${line}`);
				}
				if (snap.suggestedSections?.length) {
					lines.push(`  Suggested sections: ${snap.suggestedSections.join(' | ')}`);
				}
				if (snap.discoveryGroups?.length) {
					lines.push(`  Discovery Groups (${snap.discoveryGroups.length}):`);
					for (const g of snap.discoveryGroups) {
						lines.push(`  ┌ "${g.topic}" — ${g.noteCount} notes, coverage=${g.coverage}`);
						const notes = (g as any).keyNotes as string[] | undefined;
						if (notes?.length) {
							for (const n of notes) lines.push(`  │  • ${n}`);
						}
						lines.push(`  └`);
					}
				}
			}
			if (step.userFeedback) {
				lines.push(`  User feedback: action=${(step.userFeedback as any).action}`);
				if ((step.userFeedback as any).text) lines.push(`    text: ${(step.userFeedback as any).text}`);
			}

		} else if (step.type === 'report') {
			lines.push(`  Blocks: ${step.blocks.length}`);
			for (const b of step.blocks) {
				lines.push(`  ┌ [${b.id}] ${b.title} (weight=${b.weight})`);
				if (b.markdown) {
					for (const line of b.markdown.split('\n').slice(0, 30)) {
						lines.push(`  │  ${line}`);
					}
					if (b.markdown.split('\n').length > 30) lines.push(`  │  ... (truncated)`);
				}
				lines.push(`  └`);
			}
			const summary = step.summary ?? step.streamingText;
			if (summary) {
				lines.push(`  Executive Summary:`);
				for (const line of summary.split('\n')) lines.push(`    ${line}`);
			}

		} else if (step.type === 'sources') {
			lines.push(`  Sources (${step.sources.length}):`);
			for (const src of step.sources) {
				const avg = typeof src.score === 'object' ? src.score.average : src.score;
				const phy = typeof src.score === 'object' ? src.score.physical : '-';
				const sem = typeof src.score === 'object' ? src.score.semantic : '-';
				lines.push(`  ┌ ${src.path}`);
				lines.push(`  │  score: avg=${Number(avg).toFixed(2)}  physical=${Number(phy).toFixed(2)}  semantic=${Number(sem).toFixed(2)}`);
				if (src.badges?.length) lines.push(`  │  badges: ${src.badges.join(', ')}`);
				if (src.reasoning) lines.push(`  │  reasoning: ${src.reasoning}`);
				lines.push(`  └`);
			}
		}
		lines.push('');
	}

	// ── Agent raw event log ────────────────────────────────────────────────
	if (s.agentDebugLog.length > 0) {
		lines.push(`${'═'.repeat(60)}`);
		lines.push(`AGENT EVENT LOG (${s.agentDebugLog.length} entries)`);
		lines.push(`${'═'.repeat(60)}`);

		// Group consecutive reasoning deltas into one block
		let reasoningBuf = '';
		let reasoningTaskIdx: number | undefined;
		const flushReasoning = () => {
			if (!reasoningBuf) return;
			const tLabel = reasoningTaskIdx != null ? `T${reasoningTaskIdx + 1}` : 'global';
			lines.push(`[${tLabel}] REASONING:`);
			for (const line of reasoningBuf.split('\n')) lines.push(`  ${line}`);
			reasoningBuf = '';
			reasoningTaskIdx = undefined;
		};

		for (const entry of s.agentDebugLog) {
			const ts = new Date(entry.ts).toISOString().slice(11, 23);
			const tLabel = entry.taskIndex != null ? `T${entry.taskIndex + 1}` : 'global';

			if (entry.type === 'reasoning') {
				if (entry.taskIndex !== reasoningTaskIdx && reasoningBuf) flushReasoning();
				reasoningTaskIdx = entry.taskIndex;
				reasoningBuf += (entry.data.text as string) ?? '';
			} else {
				flushReasoning();
				if (entry.type === 'tool-call') {
					const d = entry.data as any;
					lines.push(`[${ts}] [${tLabel}] TOOL CALL: ${d.tool}`);
					try {
						const argsStr = JSON.stringify(d.args, null, 2);
						for (const line of argsStr.split('\n')) lines.push(`  args: ${line}`);
					} catch { lines.push(`  args: ${String(d.args)}`); }
				} else if (entry.type === 'tool-result') {
					const d = entry.data as any;
					lines.push(`[${ts}] [${tLabel}] TOOL RESULT: ${d.tool}`);
					if (d.output != null) {
						const outStr = typeof d.output === 'string' ? d.output : JSON.stringify(d.output, null, 2);
						const outLines = outStr.split('\n');
						for (const line of outLines.slice(0, 80)) lines.push(`  ${line}`);
						if (outLines.length > 80) lines.push(`  ... (${outLines.length - 80} more lines)`);
					}
				}
			}
		}
		flushReasoning();
	}

	// ── Token usage ───────────────────────────────────────────────────────
	if (s.phaseUsages.length) {
		lines.push(`${'═'.repeat(60)}`);
		lines.push('TOKEN USAGE BY PHASE');
		for (const pu of s.phaseUsages) {
			lines.push(`  ${pu.phase} (${pu.modelId}): ${pu.inputTokens}in + ${pu.outputTokens}out = ${pu.inputTokens + pu.outputTokens} total`);
		}
		const totalIn = s.phaseUsages.reduce((a, p) => a + p.inputTokens, 0);
		const totalOut = s.phaseUsages.reduce((a, p) => a + p.outputTokens, 0);
		lines.push(`  TOTAL: ${totalIn}in + ${totalOut}out = ${totalIn + totalOut}`);
	}

	lines.push('');
	lines.push('=== End of Debug Export ===');

	return lines.join('\n');
}
