import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Save, Copy, MessageSquare, Check, ExternalLink, Sparkles, Activity, Eye, FileText, List, FileSearch, Network, Download, Bug } from 'lucide-react';
import { V2TableOfContents } from './V2TableOfContents';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useDebugTraceCopy } from '@/ui/hooks/useDebugTraceCopy';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { exportGraphJson, useAIGraphStore } from '../store/aiGraphStore';
import { useQuickSearchHost } from '../hooks/useQuickSearchHost';
import type { Round, V2Section } from '@/core/search/v2SessionTypes';
import { isReportReadyForFollowup } from './reportState';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { usePeakEscapeLayer } from '@/ui/keyboard/usePeakKeyboardSurface';
import {
	PEAK_KEYBOARD_A11Y_STRINGS,
	PEAK_KEYBOARD_ZONE_LABELS,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';

type CopyTarget = 'process' | 'report' | 'graph';

function formatProcessSteps(steps: Round['steps']): string {
	const lines: string[] = [];
	for (const step of steps) {
		if (step.status !== 'done') continue;
		const dur = step.endedAt && step.startedAt
			? `${((step.endedAt - step.startedAt) / 1000).toFixed(1)}s`
			: '';
		lines.push(`${step.icon} ${step.displayName}${step.summary ? ' — ' + step.summary : ''} ${dur ? '— ' + dur : ''}`.trim());
	}
	return lines.join('\n');
}

function buildProcessText(): string {
	const s = useSearchSessionStore.getState();
	const blocks = s.rounds.map((round) => {
		const body = formatProcessSteps(round.steps);
		return body ? `## Round ${round.index + 1}: ${round.query}\n\n${body}` : '';
	});
	const current = formatProcessSteps(s.v2Steps);
	if (current) {
		blocks.push(s.rounds.length > 0
			? `## Round ${s.currentRoundIndex + 1}: ${s.query}\n\n${current}`
			: current);
	}
	return blocks.filter(Boolean).join('\n\n');
}

function formatReportSections(sections: V2Section[]): string {
	return sections
		.filter((sec) => sec.content)
		.map((sec) => '## ' + sec.title + '\n\n' + sec.content)
		.join('\n\n');
}

function buildReportTextFromParts(rounds: Round[], sections: V2Section[], summary: string): string {
	const blocks = rounds.map((round) => {
		const parts = [
			`# Round ${round.index + 1}: ${round.query}`,
			round.summary ? `## Executive Summary\n\n${round.summary}` : '',
			formatReportSections(round.sections),
		].filter(Boolean);
		return parts.join('\n\n');
	});
	const currentParts = [
		rounds.length > 0 ? `# Round ${rounds.length + 1}` : '',
		summary ? `## Executive Summary\n\n${summary}` : '',
		formatReportSections(sections),
	].filter(Boolean);
	if (currentParts.length > 0) blocks.push(currentParts.join('\n\n'));
	return blocks.join('\n\n');
}

function buildReportText(): string {
	const state = useSearchSessionStore.getState();
	return buildReportTextFromParts(state.rounds, state.v2PlanSections, state.v2Summary);
}

function buildGraphText(): string {
	return exportGraphJson() ?? '';
}

const COPY_TARGETS: Array<{ id: CopyTarget; icon: React.ElementType; label: string }> = [
	{ id: 'process', icon: Activity, label: 'Activity' },
	{ id: 'report', icon: Eye, label: 'Report' },
	{ id: 'graph', icon: Network, label: 'Graph' },
];

/** V2 Footer — rendered by tab-AISearch at modal bottom when V2 is active */
export const V2Footer: React.FC<{
	onContinue: () => void;
	onSynthesize: () => void;
	onSave: () => void;
	onSaveGraph?: () => void;
	onOpenInChat: () => void;
}> = ({ onContinue, onSynthesize, onSave, onSaveGraph, onOpenInChat }) => {
	const host = useQuickSearchHost();
	const { debugTracePort } = useServiceContext();
	const copyDebugTrace = useDebugTraceCopy();
	const v2View = useSearchSessionStore((s) => s.v2View);
	const usage = useSearchSessionStore((s) => s.usage);
	const duration = useSearchSessionStore((s) => s.duration);
	const setV2View = useSearchSessionStore((s) => s.setV2View);
	const rounds = useSearchSessionStore((s) => s.rounds);
	const v2PlanSections = useSearchSessionStore((s) => s.v2PlanSections);
	const v2Summary = useSearchSessionStore((s) => s.v2Summary);
	const v2SummaryStreaming = useSearchSessionStore((s) => s.v2SummaryStreaming);
	const reportDebugRunId = useSearchSessionStore((s) => s.reportDebugRunId);
	const lastSavedPath = useSearchSessionStore((s) => s.autoSaveState.lastSavedPath);
	const hasGraphData = useAIGraphStore((s) => s.graphData !== null);
	const [showToc, setShowToc] = useState(false);
	const [showCopyMenu, setShowCopyMenu] = useState(false);
	const [copied, setCopied] = useState<CopyTarget | 'debug' | null>(null);
	const copyMenuRef = useRef<HTMLDivElement>(null);
	const copyBtnRef = useRef<HTMLButtonElement>(null);
	const copyKeyboardOpenRef = useRef(false);
	const tocLayerRef = useRef<HTMLDivElement>(null);
	const tocBtnRef = useRef<HTMLButtonElement>(null);
	const tocKeyboardOpenRef = useRef(false);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lifecycleRef = useRef<HTMLDivElement>(null);
	const actionsRef = useRef<HTMLDivElement>(null);
	useRovingComposite(lifecycleRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => {
			const nextView = item.dataset.aiLifecycleView as 'process' | 'report' | 'sources' | undefined;
			if (nextView) setV2View(nextView);
		},
	});
	useRovingComposite(actionsRef, {
		itemSelector: ':scope > button:not([disabled]), :scope > div > button:not([disabled])',
		orientation: 'horizontal',
	});
	useRovingComposite(copyMenuRef, {
		itemSelector: '[role="menuitem"]',
		enabled: showCopyMenu,
		orientation: 'vertical',
	});
	const closeToc = useCallback(() => {
		setShowToc(false);
		const trigger = tocBtnRef.current;
		trigger?.ownerDocument.defaultView?.requestAnimationFrame(() => {
			trigger.focus({ preventScroll: true });
		});
	}, []);
	usePeakEscapeLayer(
		showCopyMenu,
		copyMenuRef,
		'ai-search-copy-menu',
		() => setShowCopyMenu(false),
		copyBtnRef.current,
	);
	usePeakEscapeLayer(
		showToc,
		tocLayerRef,
		'ai-search-table-of-contents',
		closeToc,
		tocBtnRef.current,
	);
	useEffect(() => {
		if (!showCopyMenu || !copyKeyboardOpenRef.current) return;
		const menu = copyMenuRef.current;
		menu?.ownerDocument.defaultView?.requestAnimationFrame(() => {
			menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
		});
		copyKeyboardOpenRef.current = false;
	}, [showCopyMenu]);
	useEffect(() => {
		if (!showToc || !tocKeyboardOpenRef.current) return;
		const layer = tocLayerRef.current;
		layer?.ownerDocument.defaultView?.requestAnimationFrame(() => {
			layer?.querySelector<HTMLElement>('[data-peak-toc-close]')?.focus({
				preventScroll: true,
			});
		});
		tocKeyboardOpenRef.current = false;
	}, [showToc]);

	const reportMarkdown = buildReportTextFromParts(rounds, v2PlanSections, v2Summary);
	const reportReady = isReportReadyForFollowup(
		v2PlanSections,
		v2Summary,
		v2SummaryStreaming,
	);
	const canCopyDebugTrace = Boolean(
		debugTracePort?.isEnabled()
		&& reportDebugRunId
		&& debugTracePort.getRun(reportDebugRunId),
	);

	const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
	const durationStr = duration ? `${(duration / 1000).toFixed(0)}s` : '';

	const views = [
		{ id: 'process' as const, icon: Activity, label: 'Activity' },
		{ id: 'report' as const, icon: Eye, label: 'Report' },
		{ id: 'sources' as const, icon: FileText, label: 'Sources' },
	];

	// Map active view to default copy target
	const defaultCopyTarget: CopyTarget = v2View === 'process' ? 'process' : v2View === 'sources' ? 'graph' : 'report';

	const doCopy = useCallback(async (target: CopyTarget) => {
		const text = target === 'process' ? buildProcessText()
			: target === 'report' ? buildReportText()
			: buildGraphText();
		if (!text) return;
		await navigator.clipboard.writeText(text);
		setCopied(target);
		setTimeout(() => setCopied(null), 1200);
	}, []);

	const handleDefaultCopy = useCallback(() => {
		void doCopy(defaultCopyTarget);
	}, [doCopy, defaultCopyTarget]);

	const handleDebugTraceCopy = useCallback(async () => {
		if (!reportDebugRunId) return;
		await copyDebugTrace(reportDebugRunId);
		setCopied('debug');
		setShowCopyMenu(false);
		setTimeout(() => setCopied(null), 1200);
	}, [copyDebugTrace, reportDebugRunId]);

	// Close menu when clicking outside
	useEffect(() => {
		if (!showCopyMenu) return;
		const ownerDocument = copyBtnRef.current?.ownerDocument;
		const NodeCtor = ownerDocument?.defaultView?.Node;
		if (!ownerDocument || !NodeCtor) return;
		const handler = (e: MouseEvent) => {
			if (e.target instanceof NodeCtor && copyMenuRef.current?.contains(e.target)) return;
			if (e.target instanceof NodeCtor && copyBtnRef.current?.contains(e.target)) return;
			setShowCopyMenu(false);
		};
		ownerDocument.addEventListener('mousedown', handler);
		return () => ownerDocument.removeEventListener('mousedown', handler);
	}, [showCopyMenu]);

	const startHoverTimer = () => {
		copyKeyboardOpenRef.current = false;
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		hideTimerRef.current = setTimeout(() => setShowCopyMenu(true), 400);
	};
	const cancelHoverTimer = () => {
		if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
	};
	const startHideTimer = () => {
		cancelHoverTimer();
		hideTimerRef.current = setTimeout(() => setShowCopyMenu(false), 200);
	};
	const cancelHideTimer = () => {
		if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
	};

	const copyLabel = defaultCopyTarget === 'process' ? 'Copy Activity' : defaultCopyTarget === 'graph' ? 'Copy Graph' : 'Copy Report';

	return (
		<div className="pktw-relative pktw-border-t pktw-border-pk-border pktw-bg-pk-background pktw-px-3 pktw-py-2 pktw-flex pktw-items-center pktw-justify-between pktw-flex-shrink-0 pktw-min-w-0 pktw-gap-2 pktw-flex-wrap">
			{/* TOC popover — rendered above the footer, anchored bottom-left of this container */}
			{showToc && reportMarkdown.length > 0 && (
				<div
					ref={tocLayerRef}
					className="pktw-absolute pktw-bottom-full pktw-left-3 pktw-mb-1 pktw-z-50"
				>
					<V2TableOfContents
						markdown={reportMarkdown}
						initialCollapsed={false}
						className="pktw-relative"
						onNavigate={closeToc}
						onClose={closeToc}
					/>
				</div>
			)}
			{/* Left: View tabs */}
			<div
				ref={lifecycleRef}
				className="pktw-flex pktw-items-center pktw-gap-1 pktw-flex-shrink-0"
				role="tablist"
				aria-label={PEAK_KEYBOARD_A11Y_STRINGS.aiSearchLifecycle}
				data-peak-keyboard-zone="as-lifecycle"
				data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['as-lifecycle']}
				data-peak-keyboard-order="2"
			>
				{views.slice(0, 2).map(({ id, icon: Icon, label }) => (
					<Button
						key={id}
						variant={v2View === id ? 'default' : 'ghost'}
						size="sm"
						geometry="toolbar"
						role="tab"
						aria-selected={v2View === id}
						tabIndex={v2View === id ? 0 : -1}
							data-peak-focus-id={`ai-lifecycle-${id}`}
							data-ai-lifecycle-view={id}
						onClick={() => setV2View(id)}
						className="pktw-gap-1.5 pktw-rounded-lg pktw-text-sm"
					>
						<Icon className="pktw-h-4 pktw-w-4" />
						{label}
					</Button>
				))}
				{/* TOC toggle — icon only, visually grouped with Report button */}
				{reportMarkdown.length > 0 && (
					<Button
						ref={tocBtnRef}
						variant={showToc ? 'secondary' : 'ghost'}
						size="icon"
						geometry="toolbar-icon"
						onClick={(event) => {
							if (!showToc && event.detail === 0) tocKeyboardOpenRef.current = true;
							setShowToc((prev) => !prev);
						}}
						onKeyDown={(event) => {
							if (event.key !== 'ArrowUp') return;
							event.preventDefault();
							tocKeyboardOpenRef.current = true;
							setShowToc(true);
						}}
						title="Table of Contents"
						aria-haspopup="dialog"
						aria-expanded={showToc}
					>
						<List className="pktw-h-4 pktw-w-4" />
					</Button>
				)}
				{views.slice(2).map(({ id, icon: Icon, label }) => (
					<Button
						key={id}
						variant={v2View === id ? 'default' : 'ghost'}
						size="sm"
						geometry="toolbar"
						role="tab"
						aria-selected={v2View === id}
						tabIndex={v2View === id ? 0 : -1}
							data-peak-focus-id={`ai-lifecycle-${id}`}
							data-ai-lifecycle-view={id}
						onClick={() => setV2View(id)}
						className="pktw-gap-1.5 pktw-rounded-lg pktw-text-sm"
					>
						<Icon className="pktw-h-4 pktw-w-4" />
						{label}
					</Button>
				))}
			</div>

			{/* Center: Stats */}
			{usage && (
				<span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-tabular-nums">
					{fmt(usage.inputTokens ?? 0)} in / {fmt(usage.outputTokens ?? 0)} out{durationStr ? ` · ${durationStr}` : ''}
				</span>
			)}

			{/* Right: Actions */}
			<div
				ref={actionsRef}
				className="pktw-flex pktw-items-center pktw-gap-1 pktw-flex-shrink-0"
				role="toolbar"
				aria-label={PEAK_KEYBOARD_A11Y_STRINGS.aiSearchActions}
				data-peak-keyboard-zone="as-actions"
				data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['as-actions']}
				data-peak-keyboard-order="5"
			>
				{/* Copy button with hover menu */}
				<div className="pktw-relative">
					<Button
						ref={copyBtnRef}
						variant="ghost"
						size="icon"
						geometry="toolbar-icon"
						onClick={handleDefaultCopy}
						onKeyDown={(event) => {
							if (event.key !== 'ArrowUp' && !(event.shiftKey && event.key === 'F10')) return;
							event.preventDefault();
							copyKeyboardOpenRef.current = true;
							setShowCopyMenu(true);
						}}
						onContextMenu={(event) => {
							event.preventDefault();
							copyKeyboardOpenRef.current = true;
							setShowCopyMenu(true);
						}}
						onMouseEnter={startHoverTimer}
						onMouseLeave={startHideTimer}
						aria-haspopup="menu"
						aria-expanded={showCopyMenu}
						className="pktw-text-pk-text-secondary"
						title={copied ? 'Copied!' : copyLabel}
					>
						{copied ? <Check className="pktw-h-4 pktw-w-4 pktw-text-pk-success" /> : <Copy className="pktw-h-4 pktw-w-4" />}
					</Button>
					{showCopyMenu && (
						<div
							ref={copyMenuRef}
							role="menu"
							aria-label={PEAK_KEYBOARD_A11Y_STRINGS.copyAnalysis}
							onMouseEnter={cancelHideTimer}
							onMouseLeave={startHideTimer}
							className="pktw-absolute pktw-bottom-full pktw-right-0 pktw-mb-1 pktw-bg-popover pktw-border pktw-border-pk-border pktw-rounded-lg pktw-shadow-lg pktw-py-1 pktw-z-50 pktw-min-w-[140px]"
						>
							{COPY_TARGETS.map(({ id, icon: Icon, label }) => (
								<Button
									key={id}
									variant="ghost"
									size="sm"
									geometry="toolbar-full"
									role="menuitem"
									tabIndex={id === defaultCopyTarget ? 0 : -1}
									onClick={() => { void doCopy(id); setShowCopyMenu(false); }}
									className={`pktw-w-full pktw-justify-start pktw-gap-2 pktw-rounded-none pktw-text-sm ${
										id === defaultCopyTarget
											? 'pktw-text-pk-accent pktw-font-medium pktw-bg-pk-accent/5'
											: 'pktw-text-pk-foreground'
									}`}
								>
									<Icon className="pktw-h-4 pktw-w-4" />
									<span>{label}</span>
									{copied === id && <Check className="pktw-w-3 pktw-h-3 pktw-text-pk-success pktw-ml-auto" />}
								</Button>
							))}
							{canCopyDebugTrace && (
								<>
									<div className="pktw-my-1 pktw-border-t pktw-border-pk-border" />
									<Button
										variant="ghost"
										size="sm"
										geometry="toolbar-full"
										role="menuitem"
										tabIndex={-1}
										onClick={() => { void handleDebugTraceCopy(); }}
										className="pktw-w-full pktw-justify-start pktw-gap-2 pktw-rounded-none pktw-text-sm pktw-text-pk-foreground-muted"
										title="Copy report generation debug trace"
									>
										<Bug className="pktw-h-4 pktw-w-4" />
										<span>Debug trace</span>
										{copied === 'debug' && <Check className="pktw-w-3 pktw-h-3 pktw-text-pk-success pktw-ml-auto" />}
									</Button>
								</>
							)}
						</div>
					)}
				</div>
				<Button
					variant="ghost"
					size="icon"
					geometry="toolbar-icon"
					onClick={onSave}
					className="pktw-text-pk-text-secondary"
					title="Export analysis as Markdown note"
				>
					<Save className="pktw-h-4 pktw-w-4" />
				</Button>
				{hasGraphData && onSaveGraph && (
					<Button
						variant="ghost"
						size="icon"
						geometry="toolbar-icon"
						onClick={onSaveGraph}
						className="pktw-text-pk-text-secondary"
						title="Save Graph to Vault"
					>
						<Download className="pktw-h-4 pktw-w-4" />
					</Button>
				)}
				{lastSavedPath && (
					<Button
						variant="ghost"
						size="icon"
						geometry="toolbar-icon"
						onClick={() => {
							host.openVaultPath(lastSavedPath, { newLeaf: false });
						}}
						className="pktw-text-pk-text-secondary"
						title="Open saved analysis note"
					>
						<FileSearch className="pktw-h-4 pktw-w-4" />
					</Button>
				)}
				{rounds.length >= 2 && (
					<Button
						variant="outline"
						size="sm"
						geometry="action"
						onClick={onSynthesize}
						className="pktw-text-xs"
					>
						<Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
						Synthesize All
					</Button>
				)}
				{reportReady && v2View !== 'report' && (
					<Button
						variant="outline"
						size="sm"
						geometry="action"
						onClick={onContinue}
						className="pktw-gap-1.5 pktw-rounded-lg pktw-text-sm"
					>
						<MessageSquare className="pktw-h-4 pktw-w-4" />
						Ask follow-up
					</Button>
				)}
				<Button
					variant="default"
					size="sm"
					geometry="action"
					onClick={onOpenInChat}
					className="pktw-gap-1.5 pktw-rounded-lg pktw-text-sm"
				>
					Open in Chat
					<ExternalLink className="pktw-h-4 pktw-w-4" />
				</Button>
			</div>
		</div>
	);
};
