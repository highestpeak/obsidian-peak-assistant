import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Save, Copy, MessageSquare, Check, ExternalLink, Sparkles, Activity, Eye, FileText, List, FileSearch, Network } from 'lucide-react';
import { V2TableOfContents } from './V2TableOfContents';
import { Button } from '@/ui/component/shared-ui/button';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { useAIAnalysisRuntimeStore } from '../store/aiAnalysisStore';
import { exportGraphJson } from '../store/aiGraphStore';

type CopyTarget = 'process' | 'report' | 'graph';

function buildProcessText(): string {
	const s = useSearchSessionStore.getState();
	const lines: string[] = [];
	for (const step of s.v2Steps) {
		if (step.status !== 'done') continue;
		const dur = step.endedAt && step.startedAt
			? `${((step.endedAt - step.startedAt) / 1000).toFixed(1)}s`
			: '';
		lines.push(`${step.icon} ${step.displayName}${step.summary ? ' — ' + step.summary : ''} ${dur ? '— ' + dur : ''}`.trim());
	}
	return lines.join('\n');
}

function buildReportText(): string {
	const s = useSearchSessionStore.getState();
	return s.v2PlanSections
		.filter((sec) => sec.content)
		.map((sec) => '## ' + sec.title + '\n\n' + sec.content)
		.join('\n\n');
}

function buildGraphText(): string {
	return exportGraphJson() ?? '';
}

const COPY_TARGETS: Array<{ id: CopyTarget; icon: React.ElementType; label: string }> = [
	{ id: 'process', icon: Activity, label: 'Process' },
	{ id: 'report', icon: Eye, label: 'Report' },
	{ id: 'graph', icon: Network, label: 'Graph' },
];

/** V2 Footer — rendered by tab-AISearch at modal bottom when V2 is active */
export const V2Footer: React.FC<{
	onContinue: () => void;
	onSynthesize: () => void;
	showContinueAnalysis: boolean;
	onCopy: () => void;
	copied: boolean;
	onSave: () => void;
	onOpenInChat: () => void;
}> = ({ onContinue, onSynthesize, showContinueAnalysis, onCopy: _legacyOnCopy, copied: _legacyCopied, onSave, onOpenInChat }) => {
	const v2View = useSearchSessionStore((s) => s.v2View);
	const usage = useSearchSessionStore((s) => s.usage);
	const duration = useSearchSessionStore((s) => s.duration);
	const setV2View = useSearchSessionStore((s) => s.setV2View);
	const rounds = useSearchSessionStore((s) => s.rounds);
	const v2PlanSections = useSearchSessionStore((s) => s.v2PlanSections);
	// Read from the same store that handleAutoSave writes to (useAIAnalysisRuntimeStore)
	const lastSavedPath = useAIAnalysisRuntimeStore((s) => s.autoSaveState.lastSavedPath);
	const [showToc, setShowToc] = useState(false);
	const [showCopyMenu, setShowCopyMenu] = useState(false);
	const [copied, setCopied] = useState<CopyTarget | 'default' | null>(null);
	const copyMenuRef = useRef<HTMLDivElement>(null);
	const copyBtnRef = useRef<HTMLDivElement>(null);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const reportMarkdown = v2PlanSections
		.filter((sec) => sec.content)
		.map((sec) => '## ' + sec.title + '\n\n' + sec.content)
		.join('\n\n');

	const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
	const durationStr = duration ? `${(duration / 1000).toFixed(0)}s` : '';

	const views = [
		{ id: 'process' as const, icon: Activity, label: 'Process' },
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

	// Close menu when clicking outside
	useEffect(() => {
		if (!showCopyMenu) return;
		const handler = (e: MouseEvent) => {
			if (copyMenuRef.current?.contains(e.target as Node)) return;
			if (copyBtnRef.current?.contains(e.target as Node)) return;
			setShowCopyMenu(false);
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [showCopyMenu]);

	const startHoverTimer = () => {
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

	const copyLabel = defaultCopyTarget === 'process' ? 'Copy Process' : defaultCopyTarget === 'graph' ? 'Copy Graph' : 'Copy Report';

	return (
		<div className="pktw-relative pktw-border-t pktw-border-pk-border pktw-bg-pk-background pktw-px-3 pktw-py-2 pktw-flex pktw-items-center pktw-justify-between pktw-flex-shrink-0">
			{/* TOC popover — rendered above the footer, anchored bottom-left of this container */}
			{showToc && reportMarkdown.length > 0 && (
				<V2TableOfContents
					markdown={reportMarkdown}
					initialCollapsed={false}
					className="pktw-absolute pktw-bottom-full pktw-left-3 pktw-mb-1 pktw-z-50"
					onNavigate={() => setShowToc(false)}
				/>
			)}
			{/* Left: View tabs */}
			<div className="pktw-flex pktw-items-center pktw-gap-1">
				{views.slice(0, 2).map(({ id, icon: Icon, label }) => (
					<div
						key={id}
						onClick={() => setV2View(id)}
						className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-transition-all pktw-cursor-pointer ${
							id === 'report' ? 'pktw-rounded-l-lg' : 'pktw-rounded-lg'
						} ${
							v2View === id
								? 'pktw-bg-pk-accent pktw-text-white'
								: 'pktw-text-pk-foreground-muted hover:pktw-bg-gray-100'
						}`}
					>
						<Icon className="pktw-w-3.5 pktw-h-3.5" />
						{label}
					</div>
				))}
				{/* TOC toggle — icon only, visually grouped with Report button */}
				{reportMarkdown.length > 0 && (
					<div
						onClick={() => setShowToc((prev) => !prev)}
						className={`pktw-flex pktw-items-center pktw-px-1.5 pktw-py-1.5 pktw-rounded-r-lg pktw-transition-all pktw-cursor-pointer pktw-border-l pktw-border-pk-border ${
							showToc
								? 'pktw-bg-pk-accent/10 pktw-text-pk-accent'
								: 'pktw-text-pk-foreground-muted hover:pktw-bg-gray-100'
						}`}
						title="Table of Contents"
					>
						<List className="pktw-w-3.5 pktw-h-3.5" />
					</div>
				)}
				{views.slice(2).map(({ id, icon: Icon, label }) => (
					<div
						key={id}
						onClick={() => setV2View(id)}
						className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-rounded-lg pktw-transition-all pktw-cursor-pointer ${
							v2View === id
								? 'pktw-bg-pk-accent pktw-text-white'
								: 'pktw-text-pk-foreground-muted hover:pktw-bg-gray-100'
						}`}
					>
						<Icon className="pktw-w-3.5 pktw-h-3.5" />
						{label}
					</div>
				))}
			</div>

			{/* Center: Stats */}
			{usage && (
				<span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-tabular-nums">
					{fmt(usage.inputTokens ?? 0)} in / {fmt(usage.outputTokens ?? 0)} out{durationStr ? ` · ${durationStr}` : ''}
				</span>
			)}

			{/* Right: Actions */}
			<div className="pktw-flex pktw-items-center pktw-gap-1">
				{/* Copy button with hover menu */}
				<div className="pktw-relative">
					<div
						ref={copyBtnRef}
						onClick={handleDefaultCopy}
						onMouseEnter={startHoverTimer}
						onMouseLeave={startHideTimer}
						className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-gray-100 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors"
						title={copied ? 'Copied!' : copyLabel}
					>
						{copied ? <Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-green-600" /> : <Copy className="pktw-w-3.5 pktw-h-3.5" />}
					</div>
					{showCopyMenu && (
						<div
							ref={copyMenuRef}
							onMouseEnter={cancelHideTimer}
							onMouseLeave={startHideTimer}
							className="pktw-absolute pktw-bottom-full pktw-right-0 pktw-mb-1 pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-lg pktw-shadow-lg pktw-py-1 pktw-z-50 pktw-min-w-[140px]"
						>
							{COPY_TARGETS.map(({ id, icon: Icon, label }) => (
								<div
									key={id}
									onClick={() => { void doCopy(id); setShowCopyMenu(false); }}
									className={`pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-cursor-pointer pktw-transition-colors ${
										id === defaultCopyTarget
											? 'pktw-text-pk-accent pktw-font-medium pktw-bg-pk-accent/5'
											: 'pktw-text-pk-foreground hover:pktw-bg-gray-50'
									}`}
								>
									<Icon className="pktw-w-3.5 pktw-h-3.5" />
									<span>{label}</span>
									{copied === id && <Check className="pktw-w-3 pktw-h-3 pktw-text-green-600 pktw-ml-auto" />}
								</div>
							))}
						</div>
					)}
				</div>
				<div
					onClick={onSave}
					className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-gray-100 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors"
					title="Save to Vault"
				>
					<Save className="pktw-w-3.5 pktw-h-3.5" />
				</div>
				{lastSavedPath && (
					<div
						onClick={async () => {
							const { AppContext } = await import('@/app/context/AppContext');
							const { openFile } = await import('@/core/utils/obsidian-utils');
							const app = AppContext.getInstance().app;
							await openFile(lastSavedPath, false, app);
						}}
						className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-gray-100 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors"
						title="Open saved analysis note"
					>
						<FileSearch className="pktw-w-3.5 pktw-h-3.5" />
					</div>
				)}
				{rounds.length >= 2 && (
					<Button
						variant="outline"
						size="sm"
						onClick={onSynthesize}
						className="pktw-text-xs"
					>
						<Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
						Synthesize All
					</Button>
				)}
				<div
					onClick={onContinue}
					className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-rounded-lg pktw-transition-all pktw-cursor-pointer ${
						showContinueAnalysis
							? 'pktw-bg-pk-accent/10 pktw-text-pk-accent'
							: 'pktw-text-pk-foreground-muted hover:pktw-bg-gray-100'
					}`}
				>
					<MessageSquare className="pktw-w-3.5 pktw-h-3.5" />
					Continue
				</div>
				<div
					onClick={onOpenInChat}
					className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-text-white pktw-bg-pk-accent hover:pktw-bg-[#6d28d9] pktw-rounded-lg pktw-transition-colors pktw-cursor-pointer"
				>
					Open in Chat
					<ExternalLink className="pktw-w-3.5 pktw-h-3.5" />
				</div>
			</div>
		</div>
	);
};
