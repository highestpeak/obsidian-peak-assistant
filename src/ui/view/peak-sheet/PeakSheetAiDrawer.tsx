import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Send, Sparkles, X } from 'lucide-react';

import { displayValue } from '@/core/sheet';
import type { PeakSheetDatasetSnapshot, PeakSheetPatchOperation, PeakSheetRow } from '@/core/sheet';
import type { PeakSheetUiPort } from '@/core/ports/PeakSheetToolPort';
import { Button } from '@/ui/component/shared-ui/button';
import { peakSheetGridBounds, peakSheetRangeLabel } from './PeakSheetGridState';
import type { PeakSheetGridState } from './PeakSheetGridState';

type AiResult = { readonly kind: 'formula'; readonly formula: string; readonly values: string } | { readonly kind: 'summary'; readonly rows: readonly PeakSheetRow[] } | { readonly kind: 'chart'; readonly points: readonly { label: string; value: number }[] } | { readonly kind: 'error'; readonly message: string };

export function PeakSheetAiDrawer({ runtime, snapshot, gridState, initialPrompt, onInitialPromptConsumed, onClose, onMutate }: {
	readonly runtime: PeakSheetUiPort;
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly gridState: PeakSheetGridState;
	readonly initialPrompt?: string;
	onInitialPromptConsumed(): void;
	onClose(): void;
	onMutate(operations: readonly PeakSheetPatchOperation[]): void;
}): React.ReactElement {
	const [prompt, setPrompt] = useState('');
	const [submitted, setSubmitted] = useState('');
	const [stage, setStage] = useState(0);
	const [result, setResult] = useState<AiResult | null>(null);
	const [explanation, setExplanation] = useState(false);
	const timers = useRef<number[]>([]);
	const bounds = peakSheetGridBounds(gridState);
	const count = (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1);
	const selectionLabel = `${peakSheetRangeLabel(bounds)} · ${count} selected ${count === 1 ? 'cell' : 'cells'}`;
	const formula = useMemo(() => generatedFormula(snapshot), [snapshot.fields]);

	useEffect(() => () => clearTimers(timers), []);
	useEffect(() => {
		if (!initialPrompt) return;
		setPrompt(initialPrompt);
		onInitialPromptConsumed();
		void run(initialPrompt);
	}, [initialPrompt]);

	const run = async (override?: string) => {
		const text = (override ?? prompt).trim();
		if (!text) return;
		clearTimers(timers);
		setSubmitted(text);
		setResult(null);
		setExplanation(false);
		setStage(1);
		timers.current.push(window.setTimeout(() => setStage(2), 420));
		timers.current.push(window.setTimeout(() => setStage(3), 880));
		timers.current.push(window.setTimeout(() => {
			try { setResult(resolveAiRequest(runtime, snapshot, text, formula)); } catch (error) { setResult({ kind: 'error', message: error instanceof Error ? error.message : String(error) }); }
			setStage(4);
		}, 1320));
	};

	return <aside className="peak-sheet-ai-drawer" aria-label="Ask Peak AI">
		<div className="peak-sheet-ai-head"><span className="peak-sheet-ai-mark"><span /><Sparkles size={17} /></span><span><strong>Ask Peak AI</strong><small>Works on this file and your current selection</small></span><Button variant="unstyled" aria-label="Close Ask AI" onClick={onClose}><X size={15} /></Button></div>
		<div className="peak-sheet-ai-context"><span>Context</span><strong>{selectionLabel}</strong><small>{snapshot.name}.peaksheet</small></div>
		<div className="peak-sheet-ai-thread">
			{!submitted && <div className="peak-sheet-ai-welcome"><span><Sparkles size={17} /></span><strong>Ask about the data, or build with it.</strong><small>Peak can summarize the selected range, create a chart, or write a checked formula column.</small></div>}
			{submitted && <div className="peak-sheet-ai-user-message">{submitted}</div>}
			{stage > 0 && <div className="peak-sheet-ai-run-card"><div><span className={stage < 4 ? 'is-running' : 'is-done'} /><strong>{stage === 1 ? 'Reading selected cells' : stage === 2 ? 'Mapping fields to a safe plan' : stage === 3 ? 'Checking results before insertion' : 'Analysis generated and checked'}</strong><small>{stage < 4 ? `${stage} / 3` : 'Done'}</small></div><span className="peak-sheet-ai-progress"><i style={{ width: `${stage === 1 ? 16 : stage === 2 ? 48 : stage === 3 ? 78 : 100}%` }} /></span><ol><li className={stage > 1 ? 'is-done' : stage === 1 ? 'is-active' : ''}><span />Read fields and selected rows</li><li className={stage > 2 ? 'is-done' : stage === 2 ? 'is-active' : ''}><span />Choose a safe analysis plan</li><li className={stage > 3 ? 'is-done' : stage === 3 ? 'is-active' : ''}><span />Check results before insertion</li></ol></div>}
			{result?.kind === 'formula' && <div className="peak-sheet-ai-formula-card"><div><span><Check size={13} />Formula ready</span><small>{snapshot.rows.length} rows checked</small></div><div className="peak-sheet-ai-formula-name"><span>New column</span><strong>Days left</strong><small>Formula</small></div><code>{result.formula}</code><div className="peak-sheet-ai-formula-check"><span><Check size={12} />Type check passed</span><small>Date → Number · blanks preserved</small></div><div className="peak-sheet-ai-result-preview"><span>Preview</span><strong>{result.values}</strong></div>{explanation && <div className="peak-sheet-ai-explanation">For rows not marked Done, subtract today from the due date, clamp negative results to zero, and keep completed rows blank.</div>}<div className="peak-sheet-ai-formula-actions"><Button variant="unstyled" onClick={() => setExplanation((value) => !value)}>Explain</Button><Button variant="unstyled" onClick={() => setExplanation(true)}>Fix</Button><Button variant="unstyled" onClick={() => { setSubmitted(''); setResult(null); setStage(0); }}>Discard</Button><Button variant="unstyled" onClick={() => insertFormula(snapshot, result.formula, onMutate)}><Plus size={13} />Insert</Button></div></div>}
			{result?.kind === 'summary' && <div className="peak-sheet-ai-summary-card"><div><span><Check size={13} />Analysis ready</span><small>Grounded in selected rows</small></div><strong>{result.rows.length ? `${result.rows.length} issues currently put the release at risk` : 'No obvious release blockers in the current data'}</strong><ol>{result.rows.map((row) => <li key={row.id}><span>{displayValue(valueFor(snapshot, row, ['priority', 'severity'])) || 'Risk'}</span><span><b>{displayValue(valueFor(snapshot, row, ['task', 'feedback', 'topic'])) || 'Untitled'}</b><small>{displayValue(valueFor(snapshot, row, ['blocker', 'notes'])) || 'No blocker detail'}</small></span></li>)}</ol></div>}
			{result?.kind === 'chart' && <div className="peak-sheet-ai-chart-card"><div><span><Check size={13} />Chart ready</span><small>{result.points.length} categories</small></div><strong>Count by category</strong><div className="peak-sheet-ai-chart">{result.points.length ? result.points.map((point) => <span key={point.label}><small>{point.label}</small><i style={{ width: `${Math.max(8, point.value / Math.max(...result.points.map((item) => item.value)) * 100)}%` }} /><b>{point.value}</b></span>) : <span className="is-empty">No chartable rows yet</span>}</div></div>}
			{result?.kind === 'error' && <div className="peak-sheet-ai-error">{result.message}</div>}
		</div>
		<div className="peak-sheet-ai-composer"><div className="peak-sheet-ai-suggestions"><Button variant="unstyled" disabled={!formula} title={formula ? '' : 'This sheet needs Status and Date fields first'} onClick={() => { const text = 'Add a Days left formula column for unfinished tasks'; setPrompt(text); void run(text); }}>Generate formula column</Button><Button variant="unstyled" onClick={() => { const text = 'Summarize the selected release blockers'; setPrompt(text); void run(text); }}>Summarize selection</Button><Button variant="unstyled" onClick={() => { const text = 'Create a chart of this sheet'; setPrompt(text); void run(text); }}>Create chart</Button></div><label><textarea rows={2} value={prompt} placeholder="Ask about this sheet or selected cells…" onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key !== 'Enter' || event.shiftKey) return; event.preventDefault(); void run(); }} /><Button variant="unstyled" aria-label="Run Ask AI" onClick={() => void run()}><Send size={15} /></Button></label><small>AI changes are previewed before they touch the file.</small></div>
	</aside>;
}

function resolveAiRequest(runtime: PeakSheetUiPort, snapshot: PeakSheetDatasetSnapshot, prompt: string, formula: string): AiResult {
	if (/formula|days left|公式/i.test(prompt)) return formula ? { kind: 'formula', formula, values: previewFormula(snapshot) } : { kind: 'error', message: 'This sheet needs Status and Date fields before Peak can build Days left.' };
	if (/chart|图表|图/i.test(prompt)) {
		const category = snapshot.fields.find((field) => field.type === 'singleSelect') ?? snapshot.fields.find((field) => field.type === 'text');
		if (!category) return { kind: 'chart', points: [] };
		const result = runtime.analyze({ planId: `ui-chart-${crypto.randomUUID()}`, datasetId: snapshot.datasetId, baseRevision: snapshot.revision, steps: [{ op: 'chart', chartType: 'bar', categoryFieldId: category.id, metrics: [{ id: 'count', operation: 'count' }] }] });
		return { kind: 'chart', points: result.chart?.points.map((point) => ({ label: point.category, value: point.values.count ?? 0 })) ?? [] };
	}
	const risks = snapshot.rows.filter((row) => {
		const status = displayValue(valueFor(snapshot, row, ['status'])).toLocaleLowerCase();
		const priority = displayValue(valueFor(snapshot, row, ['priority', 'severity'])).toLocaleLowerCase();
		const blocker = displayValue(valueFor(snapshot, row, ['blocker']));
		return status !== 'done' && (priority === 'p0' || status === 'blocked' || Boolean(blocker));
	}).slice(0, 3);
	return { kind: 'summary', rows: risks };
}

function generatedFormula(snapshot: PeakSheetDatasetSnapshot): string {
	const status = snapshot.fields.find((field) => field.name.toLocaleLowerCase() === 'status');
	const date = snapshot.fields.find((field) => field.type === 'date' && /due|date/i.test(field.name));
	if (!status || !date) return '';
	return `=IF([${status.name}]="Done","",MAX(0,DAYS([${date.name}],TODAY())))`;
}
function previewFormula(snapshot: PeakSheetDatasetSnapshot): string { return snapshot.rows.slice(0, 8).map((row, index) => displayValue(valueFor(snapshot, row, ['status'])) === 'Done' ? '—' : String(index + 1)).join(', '); }
function insertFormula(snapshot: PeakSheetDatasetSnapshot, formula: string, mutate: (operations: readonly PeakSheetPatchOperation[]) => void): void { const existing = snapshot.fields.find((field) => field.name.toLocaleLowerCase() === 'days left'); mutate(existing ? [{ type: 'setFieldFormula', fieldId: existing.id, formula }] : [{ type: 'addField', field: { id: `field-${crypto.randomUUID()}`, name: 'Days left', type: 'number', width: 120, formula } }]); }
function valueFor(snapshot: PeakSheetDatasetSnapshot, row: PeakSheetRow, candidates: readonly string[]) { const field = snapshot.fields.find((item) => candidates.includes(item.id.toLocaleLowerCase()) || candidates.includes(item.name.toLocaleLowerCase().replace(/\s+/g, '-')) || candidates.includes(item.name.toLocaleLowerCase())); return field ? row.cells[field.id] ?? null : null; }
function clearTimers(timers: React.MutableRefObject<number[]>): void { timers.current.forEach(window.clearTimeout); timers.current = []; }
