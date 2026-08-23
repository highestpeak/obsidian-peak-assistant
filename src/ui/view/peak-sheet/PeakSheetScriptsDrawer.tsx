import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, History, Play, Plus, Save, X } from 'lucide-react';

import type { PeakSheetUiPort } from '@/core/ports/PeakSheetToolPort';
import type { PeakSheetDatasetSnapshot, PeakSheetPatchOperation, PeakSheetScriptDefinition } from '@/core/sheet';
import { Button } from '@/ui/component/shared-ui/button';

export function PeakSheetScriptsDrawer({ runtime, snapshot, selectedCellCount, selectedRowIds, viewRowIds, onClose, onMutate }: {
	readonly runtime: PeakSheetUiPort;
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly selectedCellCount: number;
	readonly selectedRowIds: readonly string[];
	readonly viewRowIds: readonly string[];
	onClose(): void;
	onMutate(operations: readonly PeakSheetPatchOperation[]): void;
}): React.ReactElement {
	const scripts = snapshot.scripts ?? [];
	const [activeId, setActiveId] = useState(scripts[0]?.id ?? '');
	const active = scripts.find((script) => script.id === activeId) ?? scripts[0];
	const [scope, setScope] = useState<'selection' | 'view' | 'all'>('all');
	const [editing, setEditing] = useState(false);
	const [summary, setSummary] = useState(active?.summary ?? '');
	const [preview, setPreview] = useState<{ changed: number; unchanged: number; failed: number } | null>(null);
	const [progress, setProgress] = useState<number | null>(null);
	const timer = useRef<number | null>(null);
	const runs = useMemo(() => [...(snapshot.scriptRuns ?? [])].reverse().slice(0, 8), [snapshot.scriptRuns]);
	useEffect(() => { setSummary(active?.summary ?? ''); setPreview(null); }, [active?.id]);
	useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

	const evaluate = () => {
		if (!active) return null;
		const result = runtime.analyze({ planId: active.id, datasetId: snapshot.datasetId, baseRevision: snapshot.revision, steps: active.steps });
		const scopedIds = new Set(scope === 'selection' ? selectedRowIds : scope === 'view' ? viewRowIds : snapshot.rows.map((row) => row.id));
		const scopedRows = result.rows.filter((row) => scopedIds.has(row.id));
		const operations = diffRows(snapshot, scopedRows);
		const changed = new Set(operations.filter((operation) => operation.type === 'setCell').map((operation) => operation.type === 'setCell' ? operation.rowId : '')).size;
		return { result, operations, rowCount: scopedIds.size, counts: { changed, unchanged: Math.max(0, scopedIds.size - changed), failed: result.diagnostics.filter((item) => /could not|failed/i.test(item)).length } };
	};
	const run = () => {
		const evaluated = evaluate();
		if (!active || !evaluated) return;
		setPreview(null);
		setProgress(0);
		if (timer.current) window.clearInterval(timer.current);
		timer.current = window.setInterval(() => setProgress((current) => {
			const next = Math.min(100, (current ?? 0) + 10);
			if (next < 100) return next;
			if (timer.current) window.clearInterval(timer.current);
			timer.current = null;
			const runOperation: PeakSheetPatchOperation = { type: 'appendScriptRun', run: { id: `run-${crypto.randomUUID()}`, scriptId: active.id, scope, baseRevision: snapshot.revision, resultRevision: snapshot.revision + 1, changedRows: evaluated.counts.changed, unchangedRows: evaluated.counts.unchanged, failedRows: evaluated.counts.failed, diagnostics: evaluated.result.diagnostics, completedAt: new Date().toISOString() } };
			onMutate([...evaluated.operations, runOperation]);
			return 100;
		}), 70);
	};

	return <aside className="peak-sheet-scripts-drawer" aria-label="Local scripts">
		<div className="peak-sheet-scripts-head"><span><Code2 size={15} /></span><span><strong>Scripts</strong><small>Saved locally in this .peaksheet file</small></span><Button variant="unstyled" aria-label="Close Scripts" onClick={onClose}><X size={14} /></Button></div>
		<div className="peak-sheet-scripts-local"><i /><strong>Local execution</strong><small>No upload, schedule, or background cloud run</small></div>
		<div className="peak-sheet-scripts-body">
			<div className="peak-sheet-saved-scripts"><div><strong>Saved scripts</strong><Button variant="unstyled" onClick={() => { const script = newScript(snapshot); onMutate([{ type: 'upsertScript', script }]); setActiveId(script.id); }}><Plus size={11} />New</Button></div>{scripts.length ? scripts.map((script) => <Button key={script.id} variant="unstyled" className={script.id === active?.id ? 'is-active' : ''} onClick={() => setActiveId(script.id)}><span><strong>{script.name}</strong><small>{script.summary}</small></span><em>{script.id === active?.id ? 'Selected' : 'Saved'}</em></Button>) : <span className="peak-sheet-script-empty"><strong>No saved scripts yet</strong><small>Create a bounded local analysis script without JavaScript or Python.</small></span>}</div>
			<div className="peak-sheet-script-config"><div><span><strong>{active?.name ?? 'No script selected'}</strong><small>{active ? 'Saved locally' : 'Create a script to preview and run it'}</small></span><span><Button variant="unstyled" disabled={!active} onClick={() => setEditing((value) => !value)}>Edit</Button><Button variant="unstyled" disabled={!active} onClick={() => { if (!active) return; onMutate([{ type: 'upsertScript', script: { ...active, summary: summary.trim() || active.summary, updatedAt: new Date().toISOString() } }]); setEditing(false); }}><Save size={11} />Save</Button></span></div>{editing ? <input className="peak-sheet-script-summary-input" value={summary} onChange={(event) => setSummary(event.target.value)} /> : <code>{active?.summary ?? 'No declarative steps available'}</code>}
				<fieldset><legend>Run on</legend>{(['selection', 'view', 'all'] as const).map((value) => <label key={value}><input type="radio" name="peak-sheet-script-scope" value={value} checked={scope === value} onChange={() => setScope(value)} /><span>{value[0].toUpperCase()}{value.slice(1)}</span><small>{value === 'selection' ? `${selectedCellCount} cells` : `${snapshot.rows.length} rows`}</small></label>)}</fieldset>
				{preview && <div className="peak-sheet-script-preview"><div><strong>Preview</strong><small>No file changes yet</small></div><span><b>{preview.changed}</b><small>will change</small></span><span><b>{preview.unchanged}</b><small>unchanged</small></span><span><b>{preview.failed}</b><small>failed</small></span></div>}
			{progress !== null && <div className="peak-sheet-script-progress"><div><strong>{progress < 100 ? `Running ${Math.round((scope === 'selection' ? selectedRowIds.length : scope === 'view' ? viewRowIds.length : snapshot.rows.length) * progress / 100)} / ${scope === 'selection' ? selectedRowIds.length : scope === 'view' ? viewRowIds.length : snapshot.rows.length}` : 'Run complete'}</strong><small>{progress}%</small></div><span><i style={{ width: `${progress}%` }} /></span><small>{progress < 100 ? 'Checking local rows…' : 'History saved in this sheet'}</small></div>}
				<div className="peak-sheet-script-actions"><Button variant="unstyled" disabled={!active} onClick={() => { const evaluated = evaluate(); if (evaluated) setPreview(evaluated.counts); }}>Preview</Button><Button variant="unstyled" disabled={!active || progress !== null && progress < 100} onClick={run}><Play size={12} />Run locally</Button></div>
			</div>
			<div className="peak-sheet-script-history"><div><History size={12} /><strong>History</strong></div>{runs.length ? runs.map((run) => <span key={run.id}><i>✓</i><span><strong>{scripts.find((script) => script.id === run.scriptId)?.name ?? 'Deleted script'}</strong><small>{run.changedRows} changed · {run.unchangedRows} unchanged · {run.failedRows} failed</small></span><time>{new Date(run.completedAt).toLocaleString()}</time></span>) : <span className="peak-sheet-history-empty">No local runs yet</span>}</div>
		</div>
		<div className="peak-sheet-scripts-foot"><span>Need schedules or collaboration?</span><Button variant="unstyled" disabled>Open PeakShare</Button></div>
	</aside>;
}

function newScript(snapshot: PeakSheetDatasetSnapshot): PeakSheetScriptDefinition {
	const category = snapshot.fields.find((field) => field.type === 'singleSelect') ?? snapshot.fields[0];
	const now = new Date().toISOString();
	return { id: `script-${crypto.randomUUID()}`, name: `Local analysis ${(snapshot.scripts?.length ?? 0) + 1}`, summary: category ? `${category.name} → group → count records` : 'Materialize a field, then group and count records', steps: category ? [{ op: 'group', fieldId: category.id }, { op: 'aggregate', metrics: [{ id: 'count', operation: 'count' }] }] : [{ op: 'aggregate', metrics: [{ id: 'count', operation: 'count' }] }], createdAt: now, updatedAt: now };
}

function diffRows(snapshot: PeakSheetDatasetSnapshot, rows: readonly PeakSheetDatasetSnapshot['rows'][number][]): PeakSheetPatchOperation[] {
	const operations: PeakSheetPatchOperation[] = [];
	for (const row of rows) {
		const current = snapshot.rows.find((candidate) => candidate.id === row.id);
		if (!current) continue;
		for (const field of snapshot.fields) {
			if (field.formula) continue;
			const before = current.cells[field.id] ?? null;
			const after = row.cells[field.id] ?? null;
			if (JSON.stringify(before) !== JSON.stringify(after)) operations.push({ type: 'setCell', rowId: row.id, fieldId: field.id, value: after });
		}
	}
	return operations;
}
