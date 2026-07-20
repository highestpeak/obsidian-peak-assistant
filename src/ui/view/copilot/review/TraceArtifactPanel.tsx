import React, { useEffect, useMemo, useState } from 'react';
import {
	AlertTriangle,
	Brain,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Circle,
	ClipboardList,
	Clock,
	FileSearch,
	FileText,
	Flag,
	Loader2,
	NotebookPen,
	RefreshCw,
	Sparkles,
	Wrench,
	XCircle,
} from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { TraceArtifact } from '@/service/copilot/CopilotRunArtifacts';

export interface TraceSummary {
	totalMs: number;
	roundCount: number;
	turnCount: number;
	/** When false, the review is still running and totalMs is elapsed-so-far. */
	finished: boolean;
}

function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return '0s';
	const totalSeconds = Math.round(ms / 1000);
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	if (h > 0) return `${h}h ${m}m ${s}s`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

function TraceIcon({ item }: { item: TraceArtifact }) {
	if (item.status === 'running') return <Loader2 className="pktw-h-3.5 pktw-w-3.5 pktw-animate-spin pktw-text-pk-accent" />;
	if (item.status === 'error') return <XCircle className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-error" />;
	if (item.kind === 'observe') return <CheckCircle2 className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-success" />;
	if (item.kind === 'plan') return <ClipboardList className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-indigo" />;
	if (item.kind === 'finding') return <NotebookPen className="pktw-h-3.5 pktw-w-3.5 pktw-text-muted-foreground" />;
	if (item.kind === 'round-header') return <Flag className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-accent" />;
	if (item.kind === 'budget-warning') return <AlertTriangle className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-warning" />;
	if (item.kind === 'propose-insight') return <Brain className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-warning" />;
	if (item.kind === 'propose-change') return <RefreshCw className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-success" />;
	if (item.kind === 'propose-source') return <FileText className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-accent" />;
	if (item.kind === 'propose-chat-followup') return <Sparkles className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-accent" />;
	if (item.kind === 'submit-review') return <CheckCircle2 className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-success" />;
	if (item.kind === 'call') return <Wrench className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-accent" />;
	if (item.kind === 'read') return <FileSearch className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-success" />;
	if (item.kind === 'insight') return <Brain className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-warning" />;
	if (item.kind === 'revise') return <RefreshCw className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-success" />;
	if (item.kind === 'prepare') return <FileText className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-accent" />;
	if (item.status === 'done') return <CheckCircle2 className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-success" />;
	return <Circle className="pktw-h-3.5 pktw-w-3.5 pktw-text-muted-foreground" />;
}

function formatTraceTime(timestamp: number | undefined): string {
	if (!timestamp) return '';
	return new Date(timestamp).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	});
}

function statusClass(status: TraceArtifact['status']): string {
	if (status === 'running') return 'pktw-bg-pk-accent/10 pktw-text-pk-accent';
	if (status === 'error') return 'pktw-bg-pk-error-bg pktw-text-pk-error-text';
	if (status === 'done') return 'pktw-bg-pk-success-bg pktw-text-pk-success-text';
	if (status === 'cancelled') return 'pktw-bg-muted pktw-text-muted-foreground';
	return 'pktw-bg-muted pktw-text-muted-foreground';
}

function shouldShowStatus(status: TraceArtifact['status']): boolean {
	return status === 'running' || status === 'error' || status === 'cancelled';
}

type RenderEntry =
	| { kind: 'standalone'; item: TraceArtifact }
	| { kind: 'group'; anchor: TraceArtifact; children: TraceArtifact[] };

function buildRenderEntries(trace: TraceArtifact[]): RenderEntry[] {
	const childrenByRoot = new Map<string, TraceArtifact[]>();
	for (const item of trace) {
		if (item.groupOf) {
			const arr = childrenByRoot.get(item.groupOf) ?? [];
			arr.push(item);
			childrenByRoot.set(item.groupOf, arr);
		}
	}
	const out: RenderEntry[] = [];
	for (const item of trace) {
		if (item.groupOf) continue;
		if (item.groupRoot) {
			out.push({ kind: 'group', anchor: item, children: childrenByRoot.get(item.id) ?? [] });
		} else {
			out.push({ kind: 'standalone', item });
		}
	}
	return out;
}

interface TraceRowProps {
	item: TraceArtifact;
	expanded?: boolean;
	hasConnector: boolean;
	indented?: boolean;
}

const TraceRow: React.FC<TraceRowProps> = ({ item, expanded, hasConnector, indented }) => (
	<div className={cn(
		'pktw-trace-enter pktw-grid pktw-grid-cols-[52px_18px_minmax(0,1fr)] pktw-gap-2',
		indented && 'pktw-pl-6',
		item.kind === 'finding' && 'pktw-italic pktw-opacity-80',
	)}>
		<span className="pktw-pt-0.5 pktw-text-pk-xs pktw-font-mono pktw-tabular-nums pktw-text-muted-foreground">
			{formatTraceTime(item.timestamp)}
		</span>
		<div className="pktw-relative pktw-flex pktw-justify-center">
			{hasConnector && (
				<span className="pktw-absolute pktw-left-1/2 pktw-top-5 pktw-bottom-[-10px] pktw-w-px -pktw-translate-x-1/2 pktw-bg-border" />
			)}
			<span className={cn(
				'pktw-z-10 pktw-flex pktw-h-5 pktw-w-5 pktw-items-center pktw-justify-center pktw-rounded-full pktw-border pktw-border-border pktw-bg-background',
				item.status === 'running' && 'pktw-border-pk-accent/40 pktw-bg-pk-accent/10',
				item.status === 'error' && 'pktw-border-pk-error pktw-bg-pk-error-bg',
				item.kind === 'round-header' && 'pktw-border-pk-accent pktw-bg-pk-accent/15',
			)}>
				<TraceIcon item={item} />
			</span>
		</div>
		<div className={cn(
			'pktw-min-w-0 pktw-pb-3',
			item.status === 'error' && 'pktw-rounded-md pktw-bg-pk-error-bg pktw-p-2',
			item.kind === 'round-header' && 'pktw-font-semibold',
		)}>
			<div className="pktw-flex pktw-min-w-0 pktw-flex-wrap pktw-items-center pktw-gap-1.5">
				<span className={cn(
					'pktw-text-xs pktw-font-semibold pktw-text-foreground',
					item.kind === 'round-header' && 'pktw-text-pk-md pktw-text-pk-accent',
				)}>{item.label}</span>
				{item.badge && (
					<span className={cn(
						'pktw-inline-flex pktw-items-center pktw-gap-1 pktw-rounded-full pktw-bg-pk-accent/10 pktw-px-2 pktw-py-0.5 pktw-text-pk-xs pktw-font-medium pktw-text-pk-accent',
						expanded ? 'pktw-break-all' : 'pktw-max-w-[160px] pktw-truncate',
					)}>
						<Sparkles className="pktw-h-3 pktw-w-3 pktw-shrink-0" />
						<span className={expanded ? '' : 'pktw-truncate'}>{item.badge}</span>
					</span>
				)}
				{shouldShowStatus(item.status) && item.kind !== 'round-header' && (
					<span className={cn('pktw-rounded-full pktw-px-1.5 pktw-py-0.5 pktw-text-[9px] pktw-font-medium', statusClass(item.status))}>
						{item.status}
					</span>
				)}
			</div>
			{(item.detail || item.summary) && (
				<span className="pktw-mt-1 pktw-block pktw-text-pk-sm pktw-leading-relaxed pktw-text-muted-foreground">
					{item.detail ?? item.summary}
				</span>
			)}
		</div>
	</div>
);

interface GroupBlockProps {
	anchor: TraceArtifact;
	children: TraceArtifact[];
	expanded: boolean;
	expandedDetails?: boolean;
	onToggle: () => void;
	hasConnector: boolean;
}

const GroupBlock: React.FC<GroupBlockProps> = ({ anchor, children, expanded, expandedDetails, onToggle, hasConnector }) => {
	const childSummary = useMemo(() => {
		const counts = new Map<string, number>();
		for (const c of children) {
			const key = c.kind === 'finding' ? 'finding' : (c.toolName?.includes('grep') ? 'grep' : 'read');
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		const parts: string[] = [];
		const readCount = counts.get('read') ?? 0;
		const grepCount = counts.get('grep') ?? 0;
		const findingCount = counts.get('finding') ?? 0;
		if (readCount > 0) parts.push(`${readCount} read${readCount === 1 ? '' : 's'}`);
		if (grepCount > 0) parts.push(`${grepCount} grep${grepCount === 1 ? '' : 's'}`);
		if (findingCount > 0) parts.push(`${findingCount} finding${findingCount === 1 ? '' : 's'}`);
		return parts.join(' · ');
	}, [children]);

	return (
		<div className="pktw-trace-enter pktw-grid pktw-grid-cols-[52px_18px_minmax(0,1fr)] pktw-gap-2">
			<span className="pktw-pt-0.5 pktw-text-pk-xs pktw-font-mono pktw-tabular-nums pktw-text-muted-foreground">
				{formatTraceTime(anchor.timestamp)}
			</span>
			<div className="pktw-relative pktw-flex pktw-justify-center">
				{hasConnector && (
					<span className="pktw-absolute pktw-left-1/2 pktw-top-5 pktw-bottom-[-10px] pktw-w-px -pktw-translate-x-1/2 pktw-bg-border" />
				)}
				<span className={cn(
					'pktw-z-10 pktw-flex pktw-h-5 pktw-w-5 pktw-items-center pktw-justify-center pktw-rounded-full pktw-border pktw-border-border pktw-bg-background',
					anchor.status === 'running' && 'pktw-border-pk-accent/40 pktw-bg-pk-accent/10',
				)}>
					<TraceIcon item={anchor} />
				</span>
			</div>
			<div className="pktw-min-w-0 pktw-pb-3">
				<div
					role={children.length === 0 ? undefined : 'button'}
					tabIndex={children.length === 0 ? undefined : 0}
					onClick={children.length === 0 ? undefined : onToggle}
					onKeyDown={children.length === 0 ? undefined : (e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onToggle();
						}
					}}
					className={cn(
						'pktw-flex pktw-w-full pktw-min-w-0 pktw-items-start pktw-gap-1.5 pktw-rounded-md pktw-p-1 pktw-text-left',
						children.length > 0 && 'pktw-cursor-pointer hover:pktw-bg-muted/30',
					)}
				>
					{children.length > 0 && (
						<span className="pktw-mt-0.5 pktw-flex pktw-h-3 pktw-w-3 pktw-shrink-0 pktw-items-center pktw-justify-center pktw-text-muted-foreground">
							{expanded ? <ChevronDown className="pktw-h-3 pktw-w-3" /> : <ChevronRight className="pktw-h-3 pktw-w-3" />}
						</span>
					)}
					<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col">
						<div className="pktw-flex pktw-min-w-0 pktw-flex-wrap pktw-items-center pktw-gap-1.5">
							<span className="pktw-text-xs pktw-font-semibold pktw-text-foreground">{anchor.label}</span>
							{anchor.badge && (
								<span className={cn(
									'pktw-inline-flex pktw-items-center pktw-gap-1 pktw-rounded-full pktw-bg-pk-accent/10 pktw-px-2 pktw-py-0.5 pktw-text-pk-xs pktw-font-medium pktw-text-pk-accent',
									expandedDetails ? 'pktw-break-all' : 'pktw-max-w-[220px] pktw-truncate',
								)}>
									<Sparkles className="pktw-h-3 pktw-w-3 pktw-shrink-0" />
									<span className={expandedDetails ? '' : 'pktw-truncate'}>{anchor.badge}</span>
								</span>
							)}
							{childSummary && !expanded && (
								<span className="pktw-rounded-full pktw-bg-muted pktw-px-1.5 pktw-py-0.5 pktw-text-pk-xs pktw-text-muted-foreground">
									{childSummary}
								</span>
							)}
							{shouldShowStatus(anchor.status) && (
								<span className={cn('pktw-rounded-full pktw-px-1.5 pktw-py-0.5 pktw-text-[9px] pktw-font-medium', statusClass(anchor.status))}>
									{anchor.status}
								</span>
							)}
						</div>
						{(anchor.detail || anchor.summary) && (
							<span className="pktw-mt-1 pktw-block pktw-text-pk-sm pktw-leading-relaxed pktw-text-muted-foreground">
								{anchor.detail ?? anchor.summary}
							</span>
						)}
					</div>
				</div>
				{expanded && children.length > 0 && (
					<div className="pktw-mt-1 pktw-flex pktw-flex-col pktw-border-l pktw-border-muted-foreground/20 pktw-pl-3">
						{children.map(child => (
							<TraceRow key={child.id} item={child} hasConnector={false} expanded={expandedDetails} indented />
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export const TraceArtifactPanel: React.FC<{
	trace: TraceArtifact[];
	/** When true, removes truncation so long tool names and details show in full. */
	expanded?: boolean;
	summary?: TraceSummary;
}> = ({ trace, expanded, summary }) => {
	const entries = useMemo(() => buildRenderEntries(trace), [trace]);
	const [manualToggles, setManualToggles] = useState<Map<string, boolean>>(new Map());

	// Auto-expand groups whose anchor is still running.
	const autoExpandedIds = useMemo(() => {
		const out = new Set<string>();
		for (const entry of entries) {
			if (entry.kind === 'group' && entry.anchor.status === 'running') {
				out.add(entry.anchor.id);
			}
		}
		return out;
	}, [entries]);

	if (trace.length === 0) {
		return (
			<div className="pktw-flex pktw-h-full pktw-items-center pktw-justify-center pktw-text-sm pktw-text-muted-foreground">
				No agent trace is available for this run.
			</div>
		);
	}

	const toggleGroup = (id: string, currentlyExpanded: boolean) => {
		setManualToggles(prev => {
			const next = new Map(prev);
			next.set(id, !currentlyExpanded);
			return next;
		});
	};

	const isExpanded = (id: string): boolean => {
		if (manualToggles.has(id)) return manualToggles.get(id) === true;
		return autoExpandedIds.has(id);
	};

	const summaryLabel = (() => {
		if (!summary || summary.roundCount === 0) return null;
		const duration = formatDuration(summary.totalMs);
		const rounds = `${summary.roundCount} round${summary.roundCount === 1 ? '' : 's'}`;
		const turns = `${summary.turnCount} turn${summary.turnCount === 1 ? '' : 's'}`;
		const head = summary.finished ? `Total ${duration}` : `Running · ${duration} elapsed`;
		return `${head} · ${rounds} · ${turns}`;
	})();

	return (
		<div className="pktw-flex pktw-flex-col pktw-px-4 pktw-py-3">
			{summaryLabel && (
				<div className="pktw-mb-3 pktw-flex pktw-items-center pktw-gap-2 pktw-rounded-md pktw-bg-muted/40 pktw-px-3 pktw-py-2 pktw-text-pk-sm pktw-text-foreground">
					<Clock className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-accent" />
					<span>{summaryLabel}</span>
				</div>
			)}
			{entries.map((entry, index) => {
				const hasConnector = index < entries.length - 1;
				if (entry.kind === 'standalone') {
					return (
						<TraceRow
							key={entry.item.id}
							item={entry.item}
							expanded={expanded}
							hasConnector={hasConnector}
						/>
					);
				}
				const groupExpanded = isExpanded(entry.anchor.id);
				return (
					<GroupBlock
						key={entry.anchor.id}
						anchor={entry.anchor}
						children={entry.children}
						expanded={groupExpanded}
						expandedDetails={expanded}
						onToggle={() => toggleGroup(entry.anchor.id, groupExpanded)}
						hasConnector={hasConnector}
					/>
				);
			})}
		</div>
	);
};
