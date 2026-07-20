import React, { useEffect, useMemo, useState } from 'react';
import {
	BookOpen,
	Eye,
	FileText,
	Layers,
	MessageSquare,
	PanelRight,
	ShieldCheck,
	Sparkles,
	X,
} from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import type { CopilotReviewTab, CopilotRunArtifacts } from '@/service/copilot/CopilotRunArtifacts';
import { buildCopilotReviewModel } from './CopilotReviewModel';
import { ChangesArtifactPanel } from './ChangesArtifactPanel';
import { InsightsArtifactPanel } from './InsightsArtifactPanel';
import { SourcesArtifactPanel } from './SourcesArtifactPanel';
import { TraceArtifactPanel, type TraceSummary } from './TraceArtifactPanel';
import { buildInsightSectionTrees, insightAnchorId, insightSectionAnchorId } from './insightSections';

interface CopilotReviewShellProps {
	title: string;
	subtitle?: string;
	artifacts: CopilotRunArtifacts;
	running?: boolean;
	showTraceRail?: boolean;
	footerNote?: string;
	/** Label for the cancel/abort button shown while running. Hidden when not running. */
	cancelLabel?: string;
	onClose: () => void;
	/** Called when the user clicks the cancel button while running. */
	onCancelRun?: () => void;
	/** Apply user-accepted blocks (respects deselectedBlockIds). Shown only on the Changes tab. */
	onApplySelected?: () => void;
	onCreateProposal?: () => void;
	deselectedBlockIds?: Set<string>;
	onToggleChangeBlock?: (blockId: string) => void;
	/** Full original document content. When present, the Changes tab shows a whole-document diff. */
	originalContent?: string;
	/** Chat follow-ups proposed by the agent (rendered in the Insights tab tail). */
	chatFollowups?: Array<{ id: string; question: string; rationale: string }>;
	/** Subject document path + basename. Forwarded to InsightsArtifactPanel for inline chat context. */
	subjectPath?: string;
	subjectBasename?: string;
	/** Per-insight chat histories (key = `${insightId}::${mode}`). */
	insightChatHistories?: Record<string, Array<{ role: 'user' | 'assistant'; text: string; at: number }>>;
	onInsightChatChange?: (key: string, turns: Array<{ role: 'user' | 'assistant'; text: string; at: number }>) => void;
	/** When true, insight chats render their history but disallow new turns. */
	insightChatReadOnly?: boolean;
	/** Summary of total elapsed / rounds / turns shown at the top of the Trace tab. */
	traceSummary?: TraceSummary;
}

function TabIcon({ tab }: { tab: CopilotReviewTab }) {
	if (tab === 'changes') return <FileText className="pktw-h-3.5 pktw-w-3.5" />;
	if (tab === 'insights') return <Sparkles className="pktw-h-3.5 pktw-w-3.5" />;
	if (tab === 'sources') return <BookOpen className="pktw-h-3.5 pktw-w-3.5" />;
	if (tab === 'chat') return <MessageSquare className="pktw-h-3.5 pktw-w-3.5" />;
	return <PanelRight className="pktw-h-3.5 pktw-w-3.5" />;
}

const TabButton: React.FC<{
	tab: { id: CopilotReviewTab; label: string; count: number; disabled: boolean };
	isActive: boolean;
	onSelect: () => void;
	insightsToc: React.ReactNode;
}> = ({ tab, isActive, onSelect, insightsToc }) => {
	const [hovered, setHovered] = useState(false);
	const closeTimerRef = React.useRef<number | null>(null);

	const open = () => {
		if (closeTimerRef.current !== null) {
			window.clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
		setHovered(true);
	};
	const scheduleClose = () => {
		if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
		closeTimerRef.current = window.setTimeout(() => {
			setHovered(false);
			closeTimerRef.current = null;
		}, 160);
	};

	return (
		<div className="pktw-relative" onMouseEnter={open} onMouseLeave={scheduleClose}>
			<Button
				variant={isActive ? 'secondary' : 'ghost'}
				size="sm"
				disabled={tab.disabled}
				onClick={onSelect}
				className={cn('pktw-h-8 pktw-gap-1.5 pktw-text-xs', isActive && 'pktw-text-pk-accent')}
			>
				<TabIcon tab={tab.id} />
				{tab.label}
				<span className="pktw-rounded-full pktw-bg-muted pktw-px-1.5 pktw-py-0.5 pktw-text-pk-xs pktw-text-muted-foreground">
					{tab.count}
				</span>
			</Button>
			{insightsToc && hovered && (
				<div
					className="pktw-absolute pktw-left-0 pktw-top-full pktw-z-50 pktw-mt-1 pktw-w-[320px]"
					onMouseEnter={open}
					onMouseLeave={scheduleClose}
				>
					{insightsToc}
				</div>
			)}
		</div>
	);
};

const InsightsTocPopover: React.FC<{
	insights: CopilotRunArtifacts['insights'];
	followupCount: number;
	onSelect: () => void;
}> = ({ insights, followupCount, onSelect }) => {
	const trees = useMemo(() => buildInsightSectionTrees(insights), [insights]);

	const jumpTo = (anchorId: string) => {
		onSelect();
		// Defer so the activeTab switch + DOM update lands first.
		requestAnimationFrame(() => {
			const el = document.getElementById(anchorId);
			if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	};

	if (trees.length === 0) {
		return (
			<div className="pktw-rounded-md pktw-border pktw-border-border pktw-bg-popover pktw-p-3 pktw-text-xs pktw-text-muted-foreground pktw-shadow-lg">
				No insights yet.
			</div>
		);
	}

	const totalSections = trees.reduce((sum, t) => sum + t.sections.length, 0);

	return (
		<div className="pktw-max-h-[420px] pktw-overflow-y-auto pktw-rounded-md pktw-border pktw-border-border pktw-bg-popover pktw-p-2 pktw-shadow-lg">
			<div className="pktw-px-2 pktw-py-1 pktw-text-pk-xs pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
				Insights · {trees.length} · {totalSections} section{totalSections === 1 ? '' : 's'}
			</div>
			{trees.map((tree, treeIdx) => (
				<div key={tree.insightId} className={cn('pktw-flex pktw-flex-col', treeIdx > 0 && 'pktw-mt-1.5 pktw-pt-1.5 pktw-border-t pktw-border-border/40')}>
					<div
						role="button"
						tabIndex={0}
						onClick={() => jumpTo(insightAnchorId(tree.insightId))}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								jumpTo(insightAnchorId(tree.insightId));
							}
						}}
						className="pktw-flex pktw-cursor-pointer pktw-items-start pktw-gap-1.5 pktw-rounded pktw-px-2 pktw-py-1 pktw-text-left pktw-text-xs pktw-font-semibold pktw-text-foreground transition-colors hover:pktw-bg-pk-accent/10 hover:pktw-text-pk-accent"
					>
						<Sparkles className="pktw-mt-0.5 pktw-h-3 pktw-w-3 pktw-shrink-0 pktw-text-pk-accent" />
						<span className="pktw-min-w-0 pktw-flex-1 pktw-truncate">{tree.insightTitle}</span>
					</div>
					{tree.sections.length > 0 && (
						<div className="pktw-mt-0.5 pktw-ml-3 pktw-flex pktw-flex-col pktw-border-l pktw-border-border/50">
							{tree.sections.map(section => (
								<div
									key={section.slug}
									role="button"
									tabIndex={0}
									onClick={() => jumpTo(insightSectionAnchorId(tree.insightId, section.slug))}
									onKeyDown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											jumpTo(insightSectionAnchorId(tree.insightId, section.slug));
										}
									}}
									className={cn(
										'pktw-cursor-pointer pktw-truncate pktw-rounded-r pktw-py-0.5 pktw-pr-2 pktw-text-left pktw-text-pk-sm pktw-text-muted-foreground transition-colors hover:pktw-text-pk-accent hover:pktw-bg-pk-accent/8',
										section.level === 1 && 'pktw-pl-2 pktw-font-medium pktw-text-foreground/90',
										section.level === 2 && 'pktw-pl-3',
										section.level === 3 && 'pktw-pl-5',
									)}
								>
									{section.headingText}
								</div>
							))}
						</div>
					)}
				</div>
			))}
			{followupCount > 0 && (
				<div
					role="button"
					tabIndex={0}
					onClick={() => jumpTo('peak-insight-followups')}
					onKeyDown={e => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							jumpTo('peak-insight-followups');
						}
					}}
					className="pktw-mt-1.5 pktw-flex pktw-cursor-pointer pktw-items-start pktw-gap-1.5 pktw-rounded pktw-border-t pktw-border-border/40 pktw-px-2 pktw-py-1.5 pktw-pt-2 pktw-text-left pktw-text-xs pktw-font-semibold pktw-text-foreground transition-colors hover:pktw-bg-pk-accent/10 hover:pktw-text-pk-accent"
				>
					<MessageSquare className="pktw-mt-0.5 pktw-h-3 pktw-w-3 pktw-shrink-0 pktw-text-pk-accent" />
					<span className="pktw-min-w-0 pktw-flex-1 pktw-truncate">Suggested follow-ups · {followupCount}</span>
				</div>
			)}
		</div>
	);
};

export const CopilotReviewShell: React.FC<CopilotReviewShellProps> = ({
	title,
	subtitle,
	artifacts,
	running,
	showTraceRail,
	footerNote,
	cancelLabel = 'Cancel run',
	onClose,
	onCancelRun,
	onApplySelected,
	onCreateProposal,
	deselectedBlockIds,
	onToggleChangeBlock,
	originalContent,
	chatFollowups,
	subjectPath,
	subjectBasename,
	insightChatHistories,
	onInsightChatChange,
	insightChatReadOnly,
	traceSummary,
}) => {
	const model = useMemo(() => buildCopilotReviewModel(artifacts), [artifacts]);
	const preferredTab = useMemo<CopilotReviewTab>(() => {
		if (!showTraceRail) return model.activeTab;
		if (artifacts.changes.length > 0) return 'changes';
		if (artifacts.insights.length > 0) return 'insights';
		if (artifacts.sources.length > 0) return 'sources';
		return 'insights';
	}, [artifacts.changes.length, artifacts.insights.length, artifacts.sources.length, model.activeTab, showTraceRail]);
	const [activeTab, setActiveTab] = useState<CopilotReviewTab>(preferredTab);
	const [userPickedTab, setUserPickedTab] = useState(false);
	const selectTab = (tab: CopilotReviewTab) => {
		setUserPickedTab(true);
		setActiveTab(tab);
	};
	const canApplySelected = model.canApply && Boolean(onApplySelected);
	const totalBlockCount = useMemo(
		() => artifacts.changes.reduce((s, c) => s + c.blocks.length, 0),
		[artifacts.changes],
	);
	const rejectedBlockCount = useMemo(() => {
		const deselected = deselectedBlockIds ?? new Set<string>();
		return artifacts.changes.reduce(
			(s, c) => s + c.blocks.filter(b => deselected.has(b.id)).length,
			0,
		);
	}, [artifacts.changes, deselectedBlockIds]);
	const selectedBlockCount = totalBlockCount - rejectedBlockCount;
	const showApply = activeTab === 'changes' && canApplySelected && artifacts.changes.length > 0;
	const showCancel = Boolean(running && onCancelRun);
	const showFooter = showApply || showCancel;
	const hasOriginalContent = typeof originalContent === 'string' && originalContent.length > 0;
	const [changesViewMode, setChangesViewMode] = useState<'whole-doc' | 'blocks'>('blocks');

	const hasRightContent =
		artifacts.changes.length > 0 || artifacts.insights.length > 0 || artifacts.sources.length > 0;
	// Hide the trace rail when the user is viewing the trace tab (avoid duplicate)
	// or when no artifacts exist yet (let trace take full width).
	const traceRailVisible = showTraceRail && activeTab !== 'trace';
	const traceFullWidth = traceRailVisible && !hasRightContent;
	const gridColumns = traceRailVisible
		? (traceFullWidth ? 'minmax(0,1fr) 0px' : '280px minmax(0,1fr)')
		: 'minmax(0,1fr)';

	useEffect(() => {
		// Don't override the user's tab choice; only auto-pick if current tab disabled.
		const current = model.tabs.find(tab => tab.id === activeTab);
		if (current && !current.disabled) return;
		if (userPickedTab) return;
		setActiveTab(preferredTab);
	}, [activeTab, model.tabs, preferredTab, userPickedTab]);

	return (
		<div className="pktw-flex pktw-h-full pktw-flex-col pktw-bg-background">
			<div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-4 pktw-border-b pktw-border-border pktw-p-4">
				<div className="pktw-flex pktw-min-w-0 pktw-items-start pktw-gap-3">
					<div className="pktw-flex pktw-h-9 pktw-w-9 pktw-items-center pktw-justify-center pktw-rounded-lg pktw-bg-pk-accent/10">
						<Sparkles className="pktw-h-5 pktw-w-5 pktw-text-pk-accent" />
					</div>
					<div className="pktw-flex pktw-min-w-0 pktw-flex-col pktw-gap-1">
						<span className="pktw-text-base pktw-font-semibold">{title}</span>
						{subtitle && (
							<span className="pktw-text-xs pktw-leading-relaxed pktw-text-muted-foreground">{subtitle}</span>
						)}
					</div>
				</div>
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					{running && (
						<span className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-rounded-full pktw-bg-pk-success-bg pktw-px-2 pktw-py-1 pktw-text-pk-sm pktw-text-pk-success-text">
							<span className="pktw-h-1.5 pktw-w-1.5 pktw-rounded-full pktw-bg-pk-success" />
							Running
						</span>
					)}
					<Button variant="ghost" size="icon" onClick={onClose}>
						<X className="pktw-h-4 pktw-w-4" />
					</Button>
				</div>
			</div>

			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-border-b pktw-border-border pktw-px-4 pktw-py-2">
				{model.tabs.map(tab => {
					const isInsightsTab = tab.id === 'insights';
					return (
						<TabButton
							key={tab.id}
							tab={tab}
							isActive={activeTab === tab.id}
							onSelect={() => selectTab(tab.id)}
							insightsToc={isInsightsTab && !tab.disabled ? (
								<InsightsTocPopover
									insights={artifacts.insights}
									followupCount={chatFollowups?.length ?? 0}
									onSelect={() => selectTab(tab.id)}
								/>
							) : null}
						/>
					);
				})}
				<span className="pktw-flex-1" />
				{activeTab === 'changes' && artifacts.changes.length > 0 && (
					<div className="pktw-flex pktw-items-center pktw-gap-3">
						<span className="pktw-text-pk-sm pktw-text-muted-foreground">
							{totalBlockCount} block{totalBlockCount === 1 ? '' : 's'} · {selectedBlockCount} accepted · {rejectedBlockCount} rejected
						</span>
						{hasOriginalContent && (
							<div className="pktw-flex pktw-items-center pktw-rounded-md pktw-border pktw-border-border pktw-bg-background pktw-p-0.5">
								<Button
									size="sm"
									variant={changesViewMode === 'whole-doc' ? 'secondary' : 'ghost'}
									className="pktw-h-7 pktw-gap-1 pktw-px-2 pktw-text-pk-sm"
									onClick={() => setChangesViewMode('whole-doc')}
									title="See the full document with proposed changes overlaid"
								>
									<Eye className="pktw-h-3.5 pktw-w-3.5" />
									Whole document
								</Button>
								<Button
									size="sm"
									variant={changesViewMode === 'blocks' ? 'secondary' : 'ghost'}
									className="pktw-h-7 pktw-gap-1 pktw-px-2 pktw-text-pk-sm"
									onClick={() => setChangesViewMode('blocks')}
									title="See only the changed blocks"
								>
									<Layers className="pktw-h-3.5 pktw-w-3.5" />
									Blocks only
								</Button>
							</div>
						)}
					</div>
				)}
			</div>

			<div
				className="pktw-grid pktw-min-h-0 pktw-flex-1 pktw-overflow-hidden pktw-transition-[grid-template-columns] pktw-duration-500 pktw-ease-out"
				style={{ gridTemplateColumns: gridColumns }}
			>
				{traceRailVisible && (
					<div className={cn(
						'pktw-min-h-0 pktw-overflow-y-auto pktw-bg-muted/10',
						traceFullWidth ? 'pktw-border-none' : 'pktw-border-r pktw-border-border',
					)}>
						<div className="pktw-border-b pktw-border-border pktw-px-4 pktw-py-3">
							<span className="pktw-block pktw-text-xs pktw-font-semibold">Agent trace</span>
							<span className="pktw-mt-0.5 pktw-block pktw-text-pk-sm pktw-text-muted-foreground">Live ReAct steps and tool calls</span>
						</div>
						<TraceArtifactPanel trace={artifacts.trace} summary={traceSummary} />
					</div>
				)}
				<div className={cn(
					'pktw-min-h-0 pktw-min-w-0 pktw-overflow-hidden pktw-transition-opacity pktw-duration-300',
					traceFullWidth ? 'pktw-pointer-events-none pktw-opacity-0' : 'pktw-overflow-y-auto pktw-opacity-100',
				)}>
					{activeTab === 'changes' && (
						<ChangesArtifactPanel
							changes={artifacts.changes}
							deselectedBlockIds={deselectedBlockIds}
							onToggleBlock={onToggleChangeBlock}
							originalContent={originalContent}
							viewMode={changesViewMode}
						/>
					)}
					{activeTab === 'insights' && (
						<InsightsArtifactPanel
							insights={artifacts.insights}
							chatFollowups={chatFollowups}
							subjectPath={subjectPath}
							subjectBasename={subjectBasename}
							chatHistories={insightChatHistories as Parameters<typeof InsightsArtifactPanel>[0]['chatHistories']}
							onChatHistoryChange={onInsightChatChange as Parameters<typeof InsightsArtifactPanel>[0]['onChatHistoryChange']}
							readOnly={insightChatReadOnly}
						/>
					)}
					{activeTab === 'sources' && <SourcesArtifactPanel sources={artifacts.sources} />}
					{activeTab === 'trace' && <TraceArtifactPanel trace={artifacts.trace} expanded summary={traceSummary} />}
				</div>
			</div>

			{showFooter && (
				<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-border-t pktw-border-border pktw-p-4">
					<ShieldCheck className="pktw-h-4 pktw-w-4 pktw-text-muted-foreground" />
					<span className="pktw-text-xs pktw-text-muted-foreground">
						{footerNote ?? 'No changes applied automatically. Review the full artifact before applying.'}
					</span>
					<span className="pktw-flex-1" />
					{showCancel && (
						<Button variant="outline" onClick={onCancelRun}>{cancelLabel}</Button>
					)}
					{showApply && (
						<Button disabled={selectedBlockCount === 0} onClick={onApplySelected}>
							{selectedBlockCount === 0
								? 'Apply (none selected)'
								: `Apply ${selectedBlockCount} change${selectedBlockCount === 1 ? '' : 's'}`}
						</Button>
					)}
				</div>
			)}
		</div>
	);
};
