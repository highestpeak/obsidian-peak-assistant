import React, { useEffect, useMemo, useState } from 'react';
import {
	AlertTriangle, Check, ChevronDown, ChevronUp, Clock3, Database, FileSearch,
	Files, Gauge, ListOrdered, Pause, Play, RefreshCw, RotateCcw, Search, Square,
} from 'lucide-react';
import type { IndexLevel } from '@/core/search/indexTypes';
import type { IndexRunOutputs, KnowledgeIndexWorkspacePort, KnowledgeIndexWorkspaceSnapshot } from '@/core/ports/KnowledgeIndexWorkspacePort';
import { Button, Toggle } from '@/ui/components/primitives';

const EMPTY_SNAPSHOT: KnowledgeIndexWorkspaceSnapshot = {
	status: 'idle', message: '', startedAt: null, updatedAt: null,
	indexReady: false, indexedDocuments: 0, totalDocuments: 0, lastBuiltAt: null,
	fileTypes: [], queue: [], failures: [],
};

const DEFAULT_OUTPUTS: IndexRunOutputs = {
	fullText: true,
	embeddings: false,
	markdownSummaries: false,
	aiTags: false,
	localKeywords: true,
	existingRelations: true,
	searchRankingSignals: true,
};

export function KnowledgeIndexWorkspace({ runtime }: { runtime: KnowledgeIndexWorkspacePort }) {
	const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
	const [setupOpen, setSetupOpen] = useState(true);
	const [outputs, setOutputs] = useState(DEFAULT_OUTPUTS);
	const [showDetails, setShowDetails] = useState(true);
	const [showFileTypes, setShowFileTypes] = useState(false);
	const [starting, setStarting] = useState(false);

	async function refresh() {
		setSnapshot(await runtime.getSnapshot());
	}

	useEffect(() => {
		let alive = true;
		const load = async () => { const next = await runtime.getSnapshot(); if (alive) { setSnapshot(next); setSetupOpen(!next.indexReady && next.status !== 'running'); } };
		void load();
		const off = runtime.subscribe(() => { void load(); });
		const timer = window.setInterval(() => { void load(); }, 1000);
		return () => { alive = false; off(); window.clearInterval(timer); };
	}, [runtime]);

	const level: IndexLevel = outputs.markdownSummaries || outputs.aiTags ? 'full' : outputs.embeddings ? 'semantic' : 'fast';
	const progress = useMemo(() => parseProgress(snapshot), [snapshot]);
	const active = snapshot.status === 'running' || snapshot.status === 'paused';
	const completedWithFailures = snapshot.status === 'error' || snapshot.failures.length > 0;

	async function start() {
		setStarting(true);
		setSetupOpen(false);
		try { await runtime.start({ level, outputs }); } finally { setStarting(false); await refresh(); }
	}

	return <main className="pk-index-workspace">
		<header className="pk-index-workspace__header"><span><Database size={23} /><span><small>Knowledge index</small><strong>{snapshot.indexReady && !active ? 'Your knowledge index is ready' : active ? 'Building your knowledge index' : 'Build your knowledge index'}</strong></span></span><Button variant="ghost" onClick={() => setSetupOpen((value) => !value)}>{setupOpen ? 'Collapse setup' : 'Configure next run'} {setupOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</Button></header>

		<section className="pk-index-setup" data-open={setupOpen ? 'true' : 'false'}>
			<Button variant="ghost" className="pk-index-setup__summary" onClick={() => setSetupOpen((value) => !value)}><span><FileSearch size={18} /><span><strong>{snapshot.indexReady ? `Next run · ${labelLevel(level)}` : 'Set up your first index'}</strong><small>{selectedOutputCount(outputs)} outputs · {snapshot.totalDocuments} supported documents</small></span></span>{setupOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</Button>
			{setupOpen && <div className="pk-index-setup__body">
				<div className="pk-index-setup__intro"><span><strong>Choose what this run builds</strong><small>Start with full-text search. Add semantic or generated knowledge only when you need it.</small></span><span className="pk-index-level">{labelLevel(level)}</span></div>
				<div className="pk-index-output-matrix">
					<OutputGroup title="Search layers"><OutputRow label="Full-text index" meta="Local · fastest" checked={outputs.fullText} locked onChange={() => {}} /><OutputRow label="Embeddings" meta="Semantic search" checked={outputs.embeddings} onChange={(embeddings) => setOutputs((value) => ({ ...value, embeddings }))} /></OutputGroup>
					<OutputGroup title="Generated knowledge"><OutputRow label="Markdown summaries" meta="Available · uses AI" checked={outputs.markdownSummaries} onChange={(markdownSummaries) => setOutputs((value) => ({ ...value, markdownSummaries }))} /><LaterRow label="PDF summaries" /><LaterRow label="Image summaries" /><LaterRow label="Canvas & Excalidraw summaries" /></OutputGroup>
					<OutputGroup title="Tags & entities"><OutputRow label="Local keywords & key sentences" meta="Always built locally" checked={outputs.localKeywords} locked onChange={() => {}} /><OutputRow label="AI topic & functional tags" meta="Available · uses AI" checked={outputs.aiTags} onChange={(aiTags) => setOutputs((value) => ({ ...value, aiTags }))} /><LaterRow label="People, places & dates" /></OutputGroup>
					<OutputGroup title="Relationships"><OutputRow label="Links, tags & folder relations" meta="Always preserved" checked={outputs.existingRelations} locked onChange={() => {}} /><OutputRow label="Graph ranking & hub signals" meta="Optional maintenance pass" checked={outputs.searchRankingSignals} onChange={(searchRankingSignals) => setOutputs((value) => ({ ...value, searchRankingSignals }))} /><LaterRow label="Semantic similarities" /></OutputGroup>
					<OutputGroup title="Content understanding"><OutputRow label="PDF text extraction" meta="Automatic" checked onChange={() => {}} locked /><OutputRow label="Canvas & Excalidraw text" meta="Automatic" checked onChange={() => {}} locked /><LaterRow label="Scanned PDF OCR" /><LaterRow label="Image OCR" /><LaterRow label="Visual description" /></OutputGroup>
				</div>
				<div className="pk-index-setup__footer"><span><strong>Ready to start · {labelLevel(level)}</strong><small>Uses your saved content scope from Settings</small></span><Button onClick={() => void start()} disabled={starting || active}>{starting ? 'Starting…' : 'Start indexing'}</Button></div>
			</div>}
		</section>

		{(active || snapshot.status === 'complete' || snapshot.indexReady || completedWithFailures || snapshot.status === 'cancelled') && <>
			<section className={`pk-index-progress pk-index-progress--${snapshot.status}`}>
				<div className="pk-index-progress__headline"><span><StatusIcon status={snapshot.status} /><span><strong>{statusLabel(snapshot.status)}</strong><small>{progress.stage}</small></span></span><strong>{progress.percent.toFixed(1)}%</strong></div>
				<div className="pk-index-progress__count"><strong>{progress.processed.toLocaleString()}</strong><span>of {progress.total.toLocaleString()} documents</span><Button variant="ghost" onClick={() => setShowFileTypes((value) => !value)} aria-expanded={showFileTypes}><Files size={16} /> {snapshot.fileTypes.length} file types {showFileTypes ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</Button></div>
				{showFileTypes && <FileTypeBreakdown items={snapshot.fileTypes} total={snapshot.totalDocuments} />}
				<div className="pk-index-progress__bar"><span style={{ width: `${progress.percent}%` }} /></div>
				<div className="pk-index-progress__stats"><Metric icon={Clock3} value={progress.eta} label="estimated remaining" /><Metric icon={Gauge} value={progress.speed} label="current speed" /><Metric icon={RefreshCw} value={progress.elapsed} label="elapsed" /><Metric icon={ListOrdered} value={String(Math.max(0, progress.total - progress.processed))} label="documents left" /></div>
				<div className="pk-index-progress__actions">{snapshot.status === 'running' && <Button variant="secondary" onClick={() => runtime.pause()}><Pause size={16} /> Pause</Button>}{snapshot.status === 'paused' && <Button onClick={() => runtime.resume()}><Play size={16} /> Resume</Button>}{active && <Button variant="ghost" onClick={() => runtime.cancel()}><Square size={15} /> Cancel</Button>}{snapshot.status === 'complete' && <Button onClick={() => void runtime.openVaultSearch()}><Search size={16} /> Search the Vault</Button>}{(snapshot.status === 'error' || snapshot.status === 'cancelled') && <Button onClick={() => void runtime.retry()}><RotateCcw size={16} /> Retry run</Button>}</div>
			</section>

			<section className="pk-index-details"><Button variant="ghost" className="pk-index-details__toggle" onClick={() => setShowDetails((value) => !value)}><span><ListOrdered size={18} /><strong>Document order & run details</strong></span>{showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</Button>{showDetails && <div className="pk-index-details__body"><div className="pk-index-stage-row"><span data-state="complete"><Check size={15} /> Discover files</span><span data-state={progress.percent >= 100 ? 'complete' : 'active'}>{progress.percent >= 100 ? <Check size={15} /> : <RefreshCw size={15} />} Process documents</span><span data-state={progress.percent >= 100 ? 'complete' : 'future'}>{progress.percent >= 100 ? <Check size={15} /> : <Clock3 size={15} />} Finalize</span></div><div className="pk-index-current"><strong>{progress.currentDocument || snapshot.queue[0]?.path || 'Waiting for the next document'}</strong><small>{progress.percent >= 100 ? 'Complete' : 'Current document'}</small></div><div className="pk-index-queue">{snapshot.queue.map((item) => <div key={`${item.position}:${item.path}`}><span>{item.position}</span><strong>{item.path}</strong><small>{item.position <= progress.processed ? 'Complete' : item.position === progress.processed + 1 ? 'Processing' : 'Queued'}</small></div>)}</div>{completedWithFailures && <div className="pk-index-failures"><AlertTriangle size={18} /><span><strong>{snapshot.failures.length} item{snapshot.failures.length === 1 ? '' : 's'} need attention</strong><small>Completed documents remain searchable. Retry after reviewing the failed stage.</small></span><Button variant="secondary" onClick={() => void runtime.retry()}>Retry failed work</Button><div className="pk-index-failure-list">{snapshot.failures.map((failure, index) => <div key={`${failure.stage}:${failure.path ?? index}`}><strong>{failure.path ?? failure.stage}</strong><span>{failure.stage} · {failure.message}</span></div>)}</div></div>}</div>}</section>
		</>}
	</main>;
}

function OutputGroup({ title, children }: { title: string; children: React.ReactNode }) { return <section className="pk-index-output-group"><strong>{title}</strong><div>{children}</div></section>; }
function OutputRow({ label, meta, checked, onChange, locked = false }: { label: string; meta: string; checked: boolean; onChange: (value: boolean) => void; locked?: boolean }) { return <div className="pk-index-output-row"><span><strong>{label}</strong><small>{meta}</small></span><Toggle checked={checked} disabled={locked} onCheckedChange={onChange} label={label} /></div>; }
function LaterRow({ label }: { label: string }) { return <div className="pk-index-output-row is-later"><span><strong>{label}</strong><small>In development</small></span><Toggle checked={false} disabled onCheckedChange={() => {}} label={`${label} in development`} /></div>; }
function Metric({ icon: Icon, value, label }: { icon: React.ComponentType<{ size?: number }>; value: string; label: string }) { return <span><Icon size={16} /><span><strong>{value}</strong><small>{label}</small></span></span>; }
function FileTypeBreakdown({ items, total }: { items: KnowledgeIndexWorkspaceSnapshot['fileTypes']; total: number }) {
	const colors = ['#5d5bd6', '#2f80c9', '#2e9b74', '#b77a31', '#8c5db8', '#68717c', '#b34f68', '#438d91', '#6f7750'];
	let cursor = 0;
	const stops = items.map((item, index) => {
		const start = cursor;
		cursor += total > 0 ? (item.count / total) * 100 : 0;
		return `${colors[index % colors.length]} ${start}% ${cursor}%`;
	}).join(', ');
	return <div className="pk-index-file-types"><span className="pk-index-file-types__pie" style={{ background: stops ? `conic-gradient(${stops})` : 'var(--background-modifier-border)' }} aria-hidden="true" /><div>{items.map((item, index) => <span key={item.type}><i style={{ background: colors[index % colors.length] }} /><strong>{item.label}</strong><span>{item.count.toLocaleString()}</span></span>)}</div></div>;
}
function StatusIcon({ status }: { status: KnowledgeIndexWorkspaceSnapshot['status'] }) { if (status === 'complete') return <Check size={18} />; if (status === 'error') return <AlertTriangle size={18} />; if (status === 'paused') return <Pause size={18} />; if (status === 'cancelled') return <Square size={18} />; return <RefreshCw size={18} />; }
function labelLevel(level: IndexLevel) { return level === 'fast' ? 'Full text' : level === 'semantic' ? 'Full text + embeddings' : 'Full knowledge'; }
function selectedOutputCount(outputs: IndexRunOutputs) { return Object.values(outputs).filter(Boolean).length; }
function statusLabel(status: KnowledgeIndexWorkspaceSnapshot['status']) { if (status === 'complete') return 'Complete'; if (status === 'paused') return 'Paused'; if (status === 'error') return 'Completed with failures'; if (status === 'cancelled') return 'Cancelled'; if (status === 'idle') return 'Not started'; return 'Indexing'; }

function parseProgress(snapshot: KnowledgeIndexWorkspaceSnapshot) {
	const countMatch = snapshot.message.match(/(?:Indexing:|Vector(?: \(retry\))?)\s*(\d+)\/(\d+)/i);
	const percentMatch = snapshot.message.match(/\((\d+)%\)/);
	const processed = countMatch ? Number(countMatch[1]) : snapshot.status === 'complete' ? snapshot.totalDocuments : Math.min(snapshot.indexedDocuments, snapshot.totalDocuments);
	const total = countMatch ? Number(countMatch[2]) : Math.max(snapshot.totalDocuments, processed, 1);
	const percent = percentMatch ? Number(percentMatch[1]) : snapshot.status === 'complete' ? 100 : Math.min(99.9, (processed / total) * 100);
	const elapsedMs = snapshot.startedAt ? Math.max(0, Date.now() - snapshot.startedAt) : 0;
	const rate = processed > 0 && elapsedMs > 0 ? processed / (elapsedMs / 60000) : 0;
	const remainingMs = rate > 0 ? ((total - processed) / rate) * 60000 : 0;
	const lines = snapshot.message.split('\n');
	return { processed, total, percent, elapsed: formatDuration(elapsedMs), eta: remainingMs > 0 ? formatDuration(remainingMs) : '—', speed: rate > 0 ? `${Math.round(rate)} docs/min` : '—', stage: lines[0] || 'Preparing run', currentDocument: lines[1] ?? '' };
}

function formatDuration(ms: number) { const seconds = Math.floor(ms / 1000); if (seconds < 60) return `${seconds}s`; const minutes = Math.floor(seconds / 60); const rest = seconds % 60; return `${minutes}m ${rest}s`; }
