import type { V2Section } from '@/core/search/v2SessionTypes';
import type { V2Source, V2ToolStep } from '@/core/search/v2ToolTypes';

export interface AnalysisActivityMetrics {
	durationMs: number | null;
	foldersScanned: number | null;
	filesConsidered: number | null;
	filesRead: number | null;
	charactersRead: number | null;
	sourcesCited: number | null;
}

function numberFromSummary(summary: string | undefined, pattern: RegExp): number | null {
	if (!summary) return null;
	const match = summary.match(pattern);
	if (!match) return null;
	const value = Number(match[1].replace(/,/g, ''));
	return Number.isFinite(value) ? value : null;
}

function durationFromSteps(steps: V2ToolStep[]): number | null {
	const timed = steps.filter((step) => Number.isFinite(step.startedAt));
	if (timed.length === 0) return null;
	const start = Math.min(...timed.map((step) => step.startedAt));
	const ended = timed
		.map((step) => step.endedAt)
		.filter((value): value is number => Number.isFinite(value));
	if (ended.length === 0) return null;
	return Math.max(0, Math.max(...ended) - start);
}

/**
 * Derive review metrics from the real tool receipts rather than inventing
 * counters in the UI. `null` means the run has not produced that measurement;
 * a real zero is preserved.
 */
export function deriveAnalysisActivityMetrics(
	steps: V2ToolStep[],
	sections: V2Section[],
	sources: V2Source[],
	sessionDurationMs?: number | null,
): AnalysisActivityMetrics {
	let foldersScanned: number | null = null;
	let filesConsidered: number | null = null;
	let charactersRead: number | null = null;
	const readPaths = new Set<string>();

	for (const step of steps) {
		if (step.status !== 'done') continue;
		const tool = step.toolName.replace(/^mcp__vault__/, '');
		if (tool === 'vault_list_folders') {
			const folderCount = numberFromSummary(step.summary, /([\d,]+)\s+folders?/i);
			const fileCount = numberFromSummary(step.summary, /([\d,]+)\s+files?/i);
			if (folderCount !== null) foldersScanned = Math.max(foldersScanned ?? 0, folderCount);
			if (fileCount !== null) filesConsidered = Math.max(filesConsidered ?? 0, fileCount);
			continue;
		}
		if (tool === 'vault_read_folder') {
			const folderPath = String(step.input.folder ?? '').trim();
			if (folderPath) foldersScanned = Math.max(foldersScanned ?? 0, 1);
			const count = numberFromSummary(step.summary, /([\d,]+)\s+files?/i);
			if (count !== null) filesConsidered = Math.max(filesConsidered ?? 0, count);
			continue;
		}
		if (tool !== 'vault_read_note' || step.summary?.startsWith('⚠')) continue;
		const path = String(step.input.path ?? '').trim();
		if (path) readPaths.add(path);
		const chars = numberFromSummary(step.summary, /([\d,]+)\s+chars?/i);
		if (chars !== null) charactersRead = (charactersRead ?? 0) + chars;
	}

	const citedPaths = new Set(
		sections.flatMap((section) => section.evidencePaths).filter(Boolean),
	);
	const sourcesCited = sections.length > 0
		? citedPaths.size
		: sources.length > 0
			? sources.length
			: null;

	return {
		durationMs: sessionDurationMs ?? durationFromSteps(steps),
		foldersScanned,
		filesConsidered,
		filesRead: steps.some((step) => step.toolName.endsWith('vault_read_note'))
			? readPaths.size
			: null,
		charactersRead,
		sourcesCited,
	};
}
