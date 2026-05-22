/**
 * Pre-flight document health check for the meta-agent.
 *
 * Pure JavaScript: no LLM calls. Runs in <50ms. Output is fed verbatim into
 * the meta-agent system prompt as "Signal Report" so the agent doesn't have
 * to spend its first turn reading basic stats it could compute itself.
 *
 * Decision J1 (2026-05-17): rule-based only; no Haiku semantic summary layer.
 */

import type { DocumentContext } from './CopilotActionRegistry';

export type DocLanguage = 'zh' | 'en' | 'mixed';

export interface DocumentSignalReport {
	basename: string;
	scope: 'full' | 'selection';
	selectionLength?: number;
	wordCount: number;
	outgoingLinks: number;
	backlinkCount: number;
	tagCount: number;
	tags: string[];
	headingCount: number;
	isOrphan: boolean;
	hasTaskList: boolean;
	openTaskCount: number;
	completedTaskCount: number;
	recentlyModified?: string;
	/** Dominant language of the analyzed text. CJK-heavy → 'zh', latin-heavy → 'en', otherwise 'mixed'. */
	language: DocLanguage;
	signals: string[];
}

const CJK_RE = /[㐀-鿿豈-﫿]/g;
const LATIN_LETTER_RE = /[A-Za-z]/g;

/**
 * Heuristic language detection: ratio of CJK to Latin characters.
 *   ≥ 0.6 CJK   → 'zh'
 *   ≥ 0.6 Latin → 'en'
 *   otherwise   → 'mixed'
 * Comparable to wc-based detection in other parts of the plugin (cheap, no LLM).
 */
function detectLanguage(text: string): DocLanguage {
	const cjk = (text.match(CJK_RE) ?? []).length;
	const latin = (text.match(LATIN_LETTER_RE) ?? []).length;
	const total = cjk + latin;
	if (total === 0) return 'mixed';
	const cjkRatio = cjk / total;
	const latinRatio = latin / total;
	if (cjkRatio >= 0.6) return 'zh';
	if (latinRatio >= 0.6) return 'en';
	return 'mixed';
}

const OPEN_TASK_RE = /^\s*-\s*\[\s\]/gm;
const COMPLETED_TASK_RE = /^\s*-\s*\[[xX/-]\]/gm;

function countMatches(text: string, regex: RegExp): number {
	return (text.match(regex) ?? []).length;
}

function deriveSignals(report: Omit<DocumentSignalReport, 'signals'>): string[] {
	const out: string[] = [];
	if (report.scope === 'selection') out.push('selection active');
	if (report.isOrphan) out.push('orphan note');
	if (report.outgoingLinks < 3) out.push('few outgoing links');
	if (report.backlinkCount === 0) out.push('no backlinks');
	if (report.tagCount === 0) out.push('no tags');
	if (report.wordCount > 600) out.push('substantial length');
	if (report.headingCount > 3) out.push('structured note');
	if (report.openTaskCount > 0) out.push(`${report.openTaskCount} open task${report.openTaskCount === 1 ? '' : 's'}`);
	if (report.openTaskCount === 0 && report.completedTaskCount > 0) out.push('all tasks completed');
	return out;
}

/**
 * Build a structured signal report from a DocumentContext.
 */
export function buildSignalReport(ctx: DocumentContext): DocumentSignalReport {
	const scope: 'full' | 'selection' = ctx.scope === 'selection' || ctx.selection ? 'selection' : 'full';
	const selectionLength = ctx.selection?.length;
	const body = scope === 'selection' && ctx.selection ? ctx.selection : ctx.content;

	const openTaskCount = countMatches(body, OPEN_TASK_RE);
	const completedTaskCount = countMatches(body, COMPLETED_TASK_RE);

	const recentlyModified = (() => {
		const mtime = (ctx.file as unknown as { stat?: { mtime?: number } }).stat?.mtime;
		if (!mtime) return undefined;
		const diffMs = Date.now() - mtime;
		const days = Math.floor(diffMs / 86400000);
		if (days <= 0) return 'today';
		if (days === 1) return '1 day ago';
		if (days < 30) return `${days} days ago`;
		if (days < 365) return `${Math.floor(days / 30)} months ago`;
		return `${Math.floor(days / 365)} years ago`;
	})();

	const base: Omit<DocumentSignalReport, 'signals'> = {
		basename: ctx.file.basename,
		scope,
		selectionLength,
		wordCount: ctx.wordCount,
		outgoingLinks: ctx.links.length,
		backlinkCount: ctx.backlinks,
		tagCount: ctx.tags.length,
		tags: ctx.tags,
		headingCount: ctx.headingCount,
		isOrphan: ctx.isOrphan,
		hasTaskList: openTaskCount + completedTaskCount > 0,
		openTaskCount,
		completedTaskCount,
		recentlyModified,
		language: detectLanguage(body),
	};

	return { ...base, signals: deriveSignals(base) };
}

/**
 * Format the report as plain text for inclusion in a system prompt.
 * Compact (~10 lines) so it doesn't drown the prompt's mode-specific section.
 */
export function formatSignalReportForPrompt(report: DocumentSignalReport): string {
	const lines: string[] = [];
	lines.push(`Note: ${report.basename}`);
	lines.push(`Scope: ${report.scope}${report.selectionLength ? ` (${report.selectionLength} chars)` : ''}`);
	lines.push(`Word count: ${report.wordCount}`);
	lines.push(`Language: ${report.language}`);
	lines.push(`Outgoing links: ${report.outgoingLinks} · Incoming links: ${report.backlinkCount}`);
	lines.push(`Tags: ${report.tagCount === 0 ? '(none)' : report.tags.map(t => `#${t}`).join(' ')}`);
	lines.push(`Headings: ${report.headingCount}`);
	lines.push(`Orphan: ${report.isOrphan ? 'yes' : 'no'}`);
	if (report.hasTaskList) {
		lines.push(`Tasks: ${report.openTaskCount} open · ${report.completedTaskCount} done`);
	} else {
		lines.push('Tasks: none');
	}
	if (report.recentlyModified) {
		lines.push(`Last modified: ${report.recentlyModified}`);
	}
	if (report.signals.length > 0) {
		lines.push(`Signals: ${report.signals.join(', ')}`);
	}
	return lines.join('\n');
}

/**
 * Build a short human-readable subtitle for the review modal header.
 */
export function describeReport(report: DocumentSignalReport): string {
	const focus = report.scope === 'selection' ? 'the active selection' : 'the current note';
	const tail = report.signals.length === 0 ? 'no notable signals' : report.signals.join(', ');
	return `Auto inspected ${focus}: ${tail}.`;
}
