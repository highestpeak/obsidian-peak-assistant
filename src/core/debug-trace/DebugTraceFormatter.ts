// Debug Trace Formatter — DebugRun → Markdown / JSON receipt.
//
// The formatter is pure: it takes a DebugRun (already redacted per the
// recorder's mode) and produces text. It does not fetch anything, does not
// read from disk, and has no notion of clipboard. UI wires that up.

import type { DebugDecision, DebugPayload, DebugRun, DebugSpan } from './types';

export interface DebugFormatterOptions {
	readonly format: 'markdown' | 'json' | 'both';
	/**
	 * When true and the span has `raw`, render it verbatim in a fenced code
	 * block. When false, only the excerpt is rendered even if raw is present.
	 * The recorder is the ultimate gate — this flag only turns *available*
	 * raw on/off in the rendered receipt.
	 */
	readonly includeRawIfAvailable: boolean;
}

export function formatDebugRun(
	run: DebugRun,
	opts: DebugFormatterOptions,
): { markdown?: string; json?: string } {
	const out: { markdown?: string; json?: string } = {};
	if (opts.format === 'markdown' || opts.format === 'both') {
		out.markdown = renderMarkdown(run, opts);
	}
	if (opts.format === 'json' || opts.format === 'both') {
		out.json = JSON.stringify(run, null, 2);
	}
	return out;
}

function renderMarkdown(run: DebugRun, opts: DebugFormatterOptions): string {
	const lines: string[] = [];
	lines.push(`# Debug receipt — ${run.surface}${run.capabilityId ? ` · ${run.capabilityId}` : ''}`);
	lines.push('');
	if (run.redactionMode === 'raw') {
		lines.push('> **MODE: FULL LOCAL** — this receipt contains raw prompt / context / tool payloads. Do not share verbatim.');
		lines.push('');
	}
	lines.push(`- runId: \`${run.runId}\``);
	lines.push(`- traceId: \`${run.traceId}\``);
	lines.push(`- status: ${run.status}`);
	lines.push(`- started: ${run.startedAt}`);
	if (run.endedAt !== undefined) {
		lines.push(`- ended: ${run.endedAt}`);
		lines.push(`- duration: ${run.endedAt - run.startedAt} ms`);
	}
	lines.push(`- mode: ${run.redactionMode}`);

	const totalHits = countRedactionHits(run);
	if (totalHits > 0) {
		lines.push(`- redaction hits: ${totalHits}`);
	}
	lines.push('');

	if (run.summary && Object.keys(run.summary).length > 0) {
		lines.push('## Summary');
		lines.push('');
		for (const [k, v] of Object.entries(run.summary)) {
			lines.push(`- ${k}: ${formatValue(v)}`);
		}
		lines.push('');
	}

	if (run.spans.length === 0) {
		lines.push('## Spans');
		lines.push('');
		lines.push('_no spans recorded_');
	} else {
		lines.push('## Spans');
		lines.push('');
		const roots = run.spans.filter((s) => !s.parentSpanId);
		const byParent = groupByParent(run.spans);
		let counter = { n: 0 };
		for (const root of roots) {
			renderSpan(lines, root, byParent, 0, counter, opts);
		}
	}

	if (totalHits > 0) {
		lines.push('');
		lines.push('## Redaction');
		lines.push('');
		const summary = summarizeRedaction(run);
		for (const line of summary) lines.push(`- ${line}`);
	}

	if (opts.format === 'both') {
		lines.push('');
		lines.push('<details><summary>JSON appendix</summary>');
		lines.push('');
		lines.push('```json');
		lines.push(JSON.stringify(run, null, 2));
		lines.push('```');
		lines.push('');
		lines.push('</details>');
	}

	return lines.join('\n');
}

function renderSpan(
	lines: string[],
	span: DebugSpan,
	byParent: Map<string, DebugSpan[]>,
	depth: number,
	counter: { n: number },
	opts: DebugFormatterOptions,
): void {
	counter.n += 1;
	const heading = depth === 0 ? '###' : '####';
	lines.push(`${heading} ${counter.n}. ${span.kind} — ${span.name}`);
	lines.push('');
	lines.push(`- spanId: \`${span.spanId}\``);
	if (span.parentSpanId) lines.push(`- parent: \`${span.parentSpanId}\``);
	lines.push(`- durationMs: ${span.durationMs}`);
	if (span.params && Object.keys(span.params).length > 0) {
		lines.push(`- params: ${formatValue(span.params)}`);
	}
	if (span.metrics && Object.keys(span.metrics).length > 0) {
		lines.push(`- metrics: ${formatValue(span.metrics)}`);
	}
	if (span.input) renderPayload(lines, 'input', span.input, opts);
	if (span.output) renderPayload(lines, 'output', span.output, opts);
	if (span.decisions && span.decisions.length > 0) {
		lines.push(`- decisions:`);
		for (const d of span.decisions) lines.push(`  - ${formatDecision(d)}`);
	}
	if (span.error) {
		lines.push(`- error: ${span.error.message}`);
	}
	lines.push('');
	const children = byParent.get(span.spanId) ?? [];
	for (const child of children) {
		renderSpan(lines, child, byParent, depth + 1, counter, opts);
	}
}

function renderPayload(
	lines: string[],
	label: 'input' | 'output',
	payload: DebugPayload,
	opts: DebugFormatterOptions,
): void {
	lines.push(`- ${label}.excerpt: ${JSON.stringify(payload.excerpt)}`);
	lines.push(`- ${label}.length: ${payload.length}`);
	lines.push(`- ${label}.hash: ${payload.contentHash}`);
	if (payload.contentType) lines.push(`- ${label}.contentType: ${payload.contentType}`);
	if (opts.includeRawIfAvailable && payload.raw !== undefined) {
		lines.push(`- ${label}.raw:`);
		lines.push('');
		lines.push('```');
		lines.push(payload.raw);
		lines.push('```');
	}
}

function formatDecision(d: DebugDecision): string {
	const parts: string[] = [];
	parts.push(`**${d.decision}**`);
	if (d.target) parts.push(`\`${d.target}\``);
	parts.push(`— ${d.reason}`);
	if (d.score !== undefined) parts.push(`(score: ${d.score})`);
	if (d.meta && Object.keys(d.meta).length > 0) parts.push(`meta: ${formatValue(d.meta)}`);
	return parts.join(' ');
}

function formatValue(v: unknown): string {
	if (v === null || v === undefined) return String(v);
	if (typeof v === 'string') return JSON.stringify(v);
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	try {
		return '`' + JSON.stringify(v) + '`';
	} catch {
		return '`<unserializable>`';
	}
}

function groupByParent(spans: readonly DebugSpan[]): Map<string, DebugSpan[]> {
	const m = new Map<string, DebugSpan[]>();
	for (const s of spans) {
		if (!s.parentSpanId) continue;
		let arr = m.get(s.parentSpanId);
		if (!arr) {
			arr = [];
			m.set(s.parentSpanId, arr);
		}
		arr.push(s);
	}
	return m;
}

function countRedactionHits(run: DebugRun): number {
	let n = 0;
	for (const span of run.spans) {
		for (const p of [span.input, span.output]) {
			if (!p?.redactionHits) continue;
			for (const h of p.redactionHits) n += h.count;
		}
	}
	return n;
}

function summarizeRedaction(run: DebugRun): string[] {
	const totals = new Map<string, number>();
	for (const span of run.spans) {
		for (const p of [span.input, span.output]) {
			if (!p?.redactionHits) continue;
			for (const h of p.redactionHits) {
				totals.set(h.pattern, (totals.get(h.pattern) ?? 0) + h.count);
			}
		}
	}
	const out: string[] = [];
	const keys = [...totals.keys()].sort();
	for (const k of keys) out.push(`${totals.get(k)}× pattern \`${k}\` redacted`);
	return out;
}
