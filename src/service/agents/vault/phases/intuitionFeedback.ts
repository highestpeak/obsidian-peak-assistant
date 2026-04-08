/**
 * Intuition Feedback phase (2.5): compare query against current intuition map.
 *
 * Checks whether the intuition map covers the candidate areas identified during
 * classify. Logs gaps for future intuition map improvement. Does NOT modify
 * the intuition map — that is an indexing concern.
 *
 * V2 TODO (incremental update): When gaps are detected, write them to a
 * structured gap log (e.g. index_state key 'intuition_gap_log'). After a
 * search completes, a background job should re-run KnowledgeIntuitionAgent
 * with the gap log as context and verify that coverage improves before
 * persisting the updated map. Design reference: AI-peakAssistant-最终AI搜索设计方案.
 */

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { type LLMStreamEvent } from '@/core/providers/types';
import type { ClassifyResult, IntuitionFeedbackResult } from '../types';

/**
 * Run the Intuition Feedback phase: compare classify result against current intuition map.
 * Purely deterministic — no LLM call, just reads SQLite and compares.
 */
export async function* runIntuitionFeedbackPhase(options: {
	classify: ClassifyResult;
	stepId: string;
}): AsyncGenerator<LLMStreamEvent, IntuitionFeedbackResult> {
	const { classify } = options;

	// Load the current intuition map
	let intuitionJson: string | undefined;
	try {
		if (sqliteStoreManager.isInitialized()) {
			const stateRepo = sqliteStoreManager.getIndexStateRepo();
			intuitionJson = (await stateRepo.get('knowledge_intuition_json')) ?? undefined;
		}
	} catch {
		// Ignore — intuition map may not exist yet
	}

	const gaps: string[] = [];
	const logLines: string[] = [`Intuition Feedback for query dimensions`];

	if (!intuitionJson) {
		gaps.push('No global intuition map found — run "Analyze Vault" to generate one.');
		logLines.push('  ⚠ No intuition map available');
	} else {
		// Check if candidate areas are represented in the intuition map
		let intuitionData: any;
		try {
			intuitionData = JSON.parse(intuitionJson);
		} catch {
			gaps.push('Intuition map JSON is malformed.');
			logLines.push('  ⚠ Intuition map could not be parsed');
		}

		if (intuitionData) {
			const entryPoints: string[] = (intuitionData.entryPoints ?? []).map((ep: any) =>
				(ep.startPaths ?? []).join(', ')
			);
			const partitionPaths: string[] = (intuitionData.partitions ?? []).flatMap((p: any) =>
				p.entryPaths ?? []
			);
			const coveredPaths = new Set([...entryPoints, ...partitionPaths].map((p) => p.toLowerCase()));

			// Extract candidate areas from semantic dimensions
			const candidateAreas = classify.semantic_dimensions
				.flatMap((d) => d.scope_constraint?.path ? [d.scope_constraint.path] : [])
				.filter((v, i, a) => a.indexOf(v) === i);

			for (const area of candidateAreas) {
				const areaLower = area.toLowerCase();
				const isCovered = Array.from(coveredPaths).some(
					(p) => p.includes(areaLower) || areaLower.includes(p)
				);
				if (!isCovered) {
					gaps.push(`Area not in intuition map: ${area}`);
					logLines.push(`  ✗ Not covered: ${area}`);
				} else {
					logLines.push(`  ✓ Covered: ${area}`);
				}
			}
		}
	}

	if (gaps.length === 0) {
		logLines.push('  ✓ All candidate areas are represented in the intuition map.');
	} else {
		logLines.push(`\n  ${gaps.length} gap(s) identified. Consider re-running "Analyze Vault" after this search.`);
	}

	const logEntry = logLines.join('\n');

	yield {
		type: 'pk-debug',
		debugName: 'IntuitionFeedback: complete',
		extra: {
			gapCount: gaps.length,
			hasIntuitionMap: !!intuitionJson,
			logEntry,
		},
	};

	return { gaps, logEntry };
}
