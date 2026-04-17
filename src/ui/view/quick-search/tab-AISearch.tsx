import { SLICE_CAPS } from '@/core/constant';
import React, { useState, useEffect, useRef } from 'react';
import { Save, MessageCircle, Copy, MessageSquare, ChevronDown, Maximize2, Check, ExternalLink, ClipboardList, Activity, Eye, FileText, MoreHorizontal, Sparkles } from 'lucide-react';
import { SaveDialog } from './components/ai-analysis-modal//ResultSaveDialog';
import { V2ContinueAnalysisInput } from './components/V2ContinueAnalysisInput';
import { KeyboardShortcut } from '../../component/mine/KeyboardShortcut';
import { Button } from '@/ui/component/shared-ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { useSharedStore, useGraphQueuePump } from './store';
import {
	useAIAnalysisSummaryStore,
	useAIAnalysisResultStore,
	useAIAnalysisTopicsStore,
	useAIAnalysisInteractionsStore,
	useAIAnalysisStepsStore,
	getHasGraphData,
	getHasCompletedContent,
	getHasSummarySection,
	getHasTopicsSection,
	getHasDashboardBlocksSection,
	getHasSourcesSection,
} from './store/aiAnalysisStore';
import { useSearchSessionStore } from './store/searchSessionStore';
import { useSearchSession } from './hooks/useSearchSession';
import { useTypewriterEffect } from '@/ui/component/mine/useTypewriterEffect';
import { RecentAIAnalysis } from './components/ai-analysis-sections/RecentAIAnalysis';
import { useAIAnalysisResult } from './hooks/useAIAnalysisResult';
import { AppContext } from '@/app/context/AppContext';
import { SearchResultView } from './components/SearchResultView';
import { UsageBadge } from './components/ai-analysis-sections/UsageBadge';
import { SectionExtraChatModal } from './components/ai-analysis-modal/SectionExtraChatModal';
import { InlineFollowupChat } from '../../component/mine/InlineFollowupChat';
import { useContinueAnalysisFollowupChatConfig } from './hooks/useAIAnalysisPostAIInteractions';
import { createOpenSourceCallback } from './callbacks/open-source-file';
import { useUIEventStore } from '@/ui/store/uiEventStore';

interface AISearchTabProps {
	onClose?: () => void;
	onCancel?: () => void;
	isCancelling?: boolean;
}

/**
 * Footer hints section for AI search tab
 */
const AISearchFooterHints: React.FC<{}> = ({ }) => (
	<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-[#999999]">
		<KeyboardShortcut keys="Esc" description="to close" prefix="Press" />
		<KeyboardShortcut keys="Enter" description="to analyze" prefix="Press" />
		<KeyboardShortcut warning="• Will consume AI tokens" />
	</div>
);

/** V2 Footer — rendered by tab-AISearch at modal bottom when V2 is active */
const V2Footer: React.FC<{
	onContinue: () => void;
	onSynthesize: () => void;
	showContinueAnalysis: boolean;
	onCopy: () => void;
	copied: boolean;
	onSave: () => void;
	onOpenInChat: () => void;
}> = ({ onContinue, onSynthesize, showContinueAnalysis, onCopy, copied, onSave, onOpenInChat }) => {
	const v2View = useSearchSessionStore((s) => s.v2View);
	const usage = useSearchSessionStore((s) => s.usage);
	const duration = useSearchSessionStore((s) => s.duration);
	const setV2View = useSearchSessionStore((s) => s.setV2View);
	const rounds = useSearchSessionStore((s) => s.rounds);

	const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
	const durationStr = duration ? `${(duration / 1000).toFixed(0)}s` : '';

	const views = [
		{ id: 'process' as const, icon: Activity, label: 'Process' },
		{ id: 'report' as const, icon: Eye, label: 'Report' },
		{ id: 'sources' as const, icon: FileText, label: 'Sources' },
	];

	return (
		<div className="pktw-border-t pktw-border-[#e5e7eb] pktw-bg-white pktw-px-3 pktw-py-2 pktw-flex pktw-items-center pktw-justify-between pktw-flex-shrink-0">
			{/* Left: View tabs */}
			<div className="pktw-flex pktw-items-center pktw-gap-1">
				{views.map(({ id, icon: Icon, label }) => (
					<div
						key={id}
						onClick={() => setV2View(id)}
						className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-rounded-lg pktw-transition-all pktw-cursor-pointer ${
							v2View === id
								? 'pktw-bg-[#7c3aed] pktw-text-white'
								: 'pktw-text-[#6b7280] hover:pktw-bg-gray-100'
						}`}
					>
						<Icon className="pktw-w-3.5 pktw-h-3.5" />
						{label}
					</div>
				))}
			</div>

			{/* Center: Stats */}
			{usage && (
				<span className="pktw-text-xs pktw-text-[#9ca3af] pktw-tabular-nums">
					{durationStr && `${durationStr} · `}{fmt(usage.inputTokens + usage.outputTokens)} tokens
				</span>
			)}

			{/* Right: Actions */}
			<div className="pktw-flex pktw-items-center pktw-gap-1">
				<div
					onClick={onCopy}
					className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-gray-100 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors"
					title={copied ? 'Copied!' : 'Copy Report'}
				>
					{copied ? <Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-green-600" /> : <Copy className="pktw-w-3.5 pktw-h-3.5" />}
				</div>
				<div
					onClick={onSave}
					className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-gray-100 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors"
					title="Save to Vault"
				>
					<Save className="pktw-w-3.5 pktw-h-3.5" />
				</div>
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
							? 'pktw-bg-[#7c3aed]/10 pktw-text-[#7c3aed]'
							: 'pktw-text-[#6b7280] hover:pktw-bg-gray-100'
					}`}
				>
					<MessageSquare className="pktw-w-3.5 pktw-h-3.5" />
					Continue
				</div>
				<div
					onClick={onOpenInChat}
					className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-text-white pktw-bg-[#7c3aed] hover:pktw-bg-[#6d28d9] pktw-rounded-lg pktw-transition-colors pktw-cursor-pointer"
				>
					Open in Chat
					<ExternalLink className="pktw-w-3.5 pktw-h-3.5" />
				</div>
			</div>
		</div>
	);
};

/**
 * AI search tab, showing analysis summary, sources, and insights.
 */
export const AISearchTab: React.FC<AISearchTabProps> = ({ onClose, onCancel }) => {
	// --- New session store reads ---
	const sessionStatus = useSearchSessionStore((s) => s.status);
	const sessionId = useSearchSessionStore((s) => s.id);
	const hasStartedStreaming = useSearchSessionStore((s) => s.hasStartedStreaming);
	const hasAnalyzed = useSearchSessionStore((s) => s.hasAnalyzed);
	const newPipelineSteps = useSearchSessionStore((s) => s.steps);
	const error = useSearchSessionStore((s) => s.error);
	const restoredFromHistory = useSearchSessionStore((s) => s.restoredFromHistory);
	const restoredFromVaultPath = useSearchSessionStore((s) => s.restoredFromVaultPath);
	const autoSaveState = useSearchSessionStore((s) => s.autoSaveState);
	const titleFromStore = useSearchSessionStore((s) => s.title);
	const triggerAnalysis = useSearchSessionStore((s) => s.triggerAnalysis);
	const isV2Active = useSearchSessionStore((s) => s.v2Active);

	const isAnalyzing = sessionStatus === 'starting' || sessionStatus === 'streaming';
	const analysisCompleted = sessionStatus === 'completed';

	// --- Old stores still needed (bridge keeps them populated) ---
	const summaryChunks = useAIAnalysisSummaryStore((s) => s.summaryChunks);

	const dashboardBlocks = useAIAnalysisResultStore((s) => s.dashboardBlocks);
	const getActiveOverviewMermaid = useAIAnalysisResultStore((s) => s.getActiveOverviewMermaid);

	const topicAnalyzeResults = useAIAnalysisTopicsStore((s) => s.topicAnalyzeResults);
	const topicInspectResults = useAIAnalysisTopicsStore((s) => s.topicInspectResults);
	const topicGraphResults = useAIAnalysisTopicsStore((s) => s.topicGraphResults);
	const topicModalOpen = useAIAnalysisTopicsStore((s) => s.topicModalOpen);
	const setTopicModalOpen = useAIAnalysisTopicsStore((s) => s.setTopicModalOpen);
	const topicAnalyzeStreaming = useAIAnalysisTopicsStore((s) => s.topicAnalyzeStreaming);
	const topicGraphLoading = useAIAnalysisTopicsStore((s) => s.topicGraphLoading);
	const topicInspectLoading = useAIAnalysisTopicsStore((s) => s.topicInspectLoading);

	const setFullAnalysisFollowUp = useAIAnalysisInteractionsStore((s) => s.setFullAnalysisFollowUp);
	const setFollowUpStreaming = useAIAnalysisInteractionsStore((s) => s.setFollowUpStreaming);
	const fullAnalysisFollowUp = useAIAnalysisInteractionsStore((s) => s.fullAnalysisFollowUp);
	const contextChatModal = useAIAnalysisInteractionsStore((s) => s.contextChatModal);
	const setContextChatModal = useAIAnalysisInteractionsStore((s) => s.setContextChatModal);

	const steps = useAIAnalysisStepsStore((s) => s.steps);
	const titleDisplay = useTypewriterEffect({
		text: titleFromStore ?? '',
		enabled: !!(titleFromStore?.trim()) && !restoredFromHistory,
	});
	const settings = AppContext.getInstance().settings;
	const v2ReportChunks = useSearchSessionStore((s) => s.v2ReportChunks);
	const continueAnalysisSummary = summaryChunks?.length ? summaryChunks.join('')
		: v2ReportChunks?.length ? v2ReportChunks.join('') : '';
	const continueAnalysisConfig = useContinueAnalysisFollowupChatConfig({ summary: continueAnalysisSummary });

	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const [copied, setCopied] = useState(false);
	const [showContinueAnalysis, setShowContinueAnalysis] = useState(false);
	const [showV2ContinueInput, setShowV2ContinueInput] = useState(false);
	const [continueAnalysisInitialText, setContinueAnalysisInitialText] = useState<string | undefined>(undefined);
	const contentContainerRef = useRef<HTMLDivElement>(null);
	const continueAnalysisBlockRef = useRef<HTMLDivElement>(null);

	/** Path to open "saved analysis file" (from history restore or last auto-save). */
	const openAnalysisPath = restoredFromVaultPath ?? autoSaveState?.lastSavedPath ?? null;

	// track refs for quick navigation ========================================================

	// Section refs for quick navigation (scroll within the AI tab content container).
	const summaryRef = useRef<HTMLDivElement>(null);
	const overviewRef = useRef<HTMLDivElement>(null);
	const topicsRef = useRef<HTMLDivElement>(null);
	const dashboardBlocksRef = useRef<HTMLDivElement>(null);
	const graphSectionRef = useRef<HTMLDivElement>(null);
	const sourcesRef = useRef<HTMLDivElement>(null);
	const continueAnalysisRef = useRef<HTMLDivElement>(null);
	const stepsRef = useRef<HTMLDivElement>(null);

	const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
		ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	// For the new step-based pipeline: scroll to the last step of a given type
	const scrollToStep = (stepType: string) => {
		const els = contentContainerRef.current?.querySelectorAll(`[data-step="${stepType}"]`);
		if (els?.length) (els[els.length - 1] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const isNewPipeline = newPipelineSteps.length > 0;
	const hasNewPipelineReport = newPipelineSteps.some((s) => s.type === 'report');
	const hasNewPipelineSources = newPipelineSteps.some((s) => s.type === 'sources');

	const scrollToBlock = (blockId: string) => {
		document.getElementById(`block-${blockId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const scrollToContinueSection = (index: number) => {
		document.getElementById(`continue-section-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	// Graph queue pump: process tool events so graph populates; must run even when graph panel is hidden
	useGraphQueuePump();

	// hooks for AI analysis ========================================================

	// Use custom hook for AI analysis (new unified hook)
	const sessionHook = useSearchSession() as ReturnType<typeof useSearchSession> & { handleApprovePlan?: () => void; handleRegenerateSection?: (id: string, prompt?: string) => void };
	const { performAnalysis, cancel, handleApprovePlan, handleRegenerateSection } = sessionHook;

	// Only trigger analysis when triggerAnalysis changes AND analysis is not completed
	// Do NOT trigger on searchQuery changes to avoid wasting resources
	// analysisCompleted flag prevents re-triggering when switching tabs
	const { searchQuery } = useSharedStore();
	const lastProcessedTriggerRef = useRef(0);
	useEffect(() => {
		if (triggerAnalysis > lastProcessedTriggerRef.current && searchQuery.trim() && !analysisCompleted) {
			lastProcessedTriggerRef.current = triggerAnalysis;
			performAnalysis();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [triggerAnalysis, analysisCompleted]); // Include analysisCompleted in deps

	// Retry also only triggers on retryTrigger change and analysis is not completed
	// analysisCompleted flag prevents re-triggering when switching tabs
	const [retryTrigger, setRetryTrigger] = useState(0);
	const lastProcessedRetryRef = useRef(0);
	useEffect(() => {
		if (retryTrigger > lastProcessedRetryRef.current && searchQuery.trim()) {
			lastProcessedRetryRef.current = retryTrigger;
			performAnalysis();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [retryTrigger]); // No need to include analysisCompleted for retry, as retry should always work

	const handleRetry = () => {
		useSearchSessionStore.getState().recordError('Retry analysis');
		useSearchSessionStore.getState().resetAll();
		setRetryTrigger(prev => prev + 1);
	};

	// Serialize full session state to plain text for debugging/sharing
	const [debugCopied, setDebugCopied] = useState(false);
	const handleCopyDebugInfo = () => {
		const s = useSearchSessionStore.getState();
		const lines: string[] = [];

		lines.push('=== AI Search Session Debug Export ===');
		lines.push(`Query: ${s.query}`);
		lines.push(`Status: ${s.status}  Duration: ${s.duration != null ? `${(s.duration / 1000).toFixed(1)}s` : '-'}`);
		if (s.startedAt) lines.push(`Started: ${new Date(s.startedAt).toISOString()}`);
		lines.push(`Analysis mode: ${s.runAnalysisMode ?? s.analysisMode}`);
		lines.push('');

		// ── Steps ──────────────────────────────────────────────────────────────
		for (const step of s.steps) {
			const dur = step.endedAt != null ? `${((step.endedAt - step.startedAt) / 1000).toFixed(1)}s` : 'running';
			lines.push(`${'─'.repeat(60)}`);
			lines.push(`[${step.type.toUpperCase()}]  status=${step.status}  duration=${dur}`);

			if (step.type === 'classify') {
				lines.push(`  Dimensions (${step.dimensions.length}):`);
				for (const d of step.dimensions) {
					lines.push(`  ┌ [${d.axis}] ${d.id.replace(/_/g, ' ')}`);
					if (d.intent_description) lines.push(`  │  intent: ${d.intent_description}`);
					if (d.scope_constraint) {
						const sc = d.scope_constraint;
						if (sc.path) lines.push(`  │  scope path: ${sc.path}`);
						if (sc.tags?.length) lines.push(`  │  scope tags: ${sc.tags.join(', ')}`);
						if (sc.anchor_entity) lines.push(`  │  anchor entity: ${sc.anchor_entity}`);
					}
					lines.push(`  └`);
				}

			} else if (step.type === 'decompose') {
				lines.push(`  ${step.dimensionCount} dimensions → ${step.taskCount} tasks`);
				for (const t of step.taskDescriptions) {
					lines.push(`  ┌ Task [${t.id}] priority=${t.searchPriority}`);
					lines.push(`  │  description: ${t.description}`);
					if (t.targetAreas.length) lines.push(`  │  target areas: ${t.targetAreas.join(', ')}`);
					if (t.toolHints.length) lines.push(`  │  tool hints: ${t.toolHints.join(', ')}`);
					if (t.coveredDimensionIds.length) lines.push(`  │  covers dimensions: ${t.coveredDimensionIds.join(', ')}`);
					lines.push(`  └`);
				}

			} else if (step.type === 'recon') {
				const doneCnt = step.tasks.filter(t => t.done).length;
				lines.push(`  Tasks: ${doneCnt}/${step.total}`);
				for (const t of step.tasks) {
					lines.push(`  ┌ T${t.index + 1} ${t.done ? '[done]' : '[running]'}  ${t.label ?? '?'}`);
					const taskLog = step.progressLog.filter(e => e.taskIndex === t.index);
					for (const entry of taskLog) {
						const ts = new Date(entry.timestamp).toISOString().slice(11, 23);
						lines.push(`  │  [${ts}] ${entry.label}: ${entry.detail}`);
					}
					lines.push(`  └`);
				}

			} else if (step.type === 'plan') {
				const snap = step.snapshot;
				if (snap) {
					lines.push(`  Confidence: ${snap.confidence ?? '-'}`);
					lines.push(`  Proposed outline:`);
					for (const line of (snap.proposedOutline ?? '').split('\n')) {
						lines.push(`    ${line}`);
					}
					if (snap.suggestedSections?.length) {
						lines.push(`  Suggested sections: ${snap.suggestedSections.join(' | ')}`);
					}
					if (snap.discoveryGroups?.length) {
						lines.push(`  Discovery Groups (${snap.discoveryGroups.length}):`);
						for (const g of snap.discoveryGroups) {
							lines.push(`  ┌ "${g.topic}" — ${g.noteCount} notes, coverage=${g.coverage}`);
							const notes = (g as any).keyNotes as string[] | undefined;
							if (notes?.length) {
								for (const n of notes) lines.push(`  │  • ${n}`);
							}
							lines.push(`  └`);
						}
					}
				}
				if (step.userFeedback) {
					lines.push(`  User feedback: action=${step.userFeedback.action}`);
					if ((step.userFeedback as any).text) lines.push(`    text: ${(step.userFeedback as any).text}`);
				}

			} else if (step.type === 'report') {
				lines.push(`  Blocks: ${step.blocks.length}`);
				for (const b of step.blocks) {
					lines.push(`  ┌ [${b.id}] ${b.title} (weight=${b.weight})`);
					if (b.markdown) {
						for (const line of b.markdown.split('\n').slice(0, 30)) {
							lines.push(`  │  ${line}`);
						}
						if (b.markdown.split('\n').length > 30) lines.push(`  │  ... (truncated)`);
					}
					lines.push(`  └`);
				}
				const summary = step.summary ?? step.streamingText;
				if (summary) {
					lines.push(`  Executive Summary:`);
					for (const line of summary.split('\n')) lines.push(`    ${line}`);
				}

			} else if (step.type === 'sources') {
				lines.push(`  Sources (${step.sources.length}):`);
				for (const src of step.sources) {
					const avg = typeof src.score === 'object' ? src.score.average : src.score;
					const phy = typeof src.score === 'object' ? src.score.physical : '-';
					const sem = typeof src.score === 'object' ? src.score.semantic : '-';
					lines.push(`  ┌ ${src.path}`);
					lines.push(`  │  score: avg=${Number(avg).toFixed(2)}  physical=${Number(phy).toFixed(2)}  semantic=${Number(sem).toFixed(2)}`);
					if (src.badges?.length) lines.push(`  │  badges: ${src.badges.join(', ')}`);
					if (src.reasoning) lines.push(`  │  reasoning: ${src.reasoning}`);
					lines.push(`  └`);
				}
			}
			lines.push('');
		}

		// ── Agent raw event log ────────────────────────────────────────────────
		if (s.agentDebugLog.length > 0) {
			lines.push(`${'═'.repeat(60)}`);
			lines.push(`AGENT EVENT LOG (${s.agentDebugLog.length} entries)`);
			lines.push(`${'═'.repeat(60)}`);

			// Group consecutive reasoning deltas into one block
			let reasoningBuf = '';
			let reasoningTaskIdx: number | undefined;
			const flushReasoning = () => {
				if (!reasoningBuf) return;
				const tLabel = reasoningTaskIdx != null ? `T${reasoningTaskIdx + 1}` : 'global';
				lines.push(`[${tLabel}] REASONING:`);
				for (const line of reasoningBuf.split('\n')) lines.push(`  ${line}`);
				reasoningBuf = '';
				reasoningTaskIdx = undefined;
			};

			for (const entry of s.agentDebugLog) {
				const ts = new Date(entry.ts).toISOString().slice(11, 23);
				const tLabel = entry.taskIndex != null ? `T${entry.taskIndex + 1}` : 'global';

				if (entry.type === 'reasoning') {
					if (entry.taskIndex !== reasoningTaskIdx && reasoningBuf) flushReasoning();
					reasoningTaskIdx = entry.taskIndex;
					reasoningBuf += (entry.data.text as string) ?? '';
				} else {
					flushReasoning();
					if (entry.type === 'tool-call') {
						const d = entry.data as any;
						lines.push(`[${ts}] [${tLabel}] TOOL CALL: ${d.tool}`);
						try {
							const argsStr = JSON.stringify(d.args, null, 2);
							for (const line of argsStr.split('\n')) lines.push(`  args: ${line}`);
						} catch { lines.push(`  args: ${String(d.args)}`); }
					} else if (entry.type === 'tool-result') {
						const d = entry.data as any;
						lines.push(`[${ts}] [${tLabel}] TOOL RESULT: ${d.tool}`);
						if (d.output != null) {
							const outStr = typeof d.output === 'string' ? d.output : JSON.stringify(d.output, null, 2);
							const outLines = outStr.split('\n');
							for (const line of outLines.slice(0, 80)) lines.push(`  ${line}`);
							if (outLines.length > 80) lines.push(`  ... (${outLines.length - 80} more lines)`);
						}
					}
				}
			}
			flushReasoning();
		}

		// ── Token usage ───────────────────────────────────────────────────────
		if (s.phaseUsages.length) {
			lines.push(`${'═'.repeat(60)}`);
			lines.push('TOKEN USAGE BY PHASE');
			for (const pu of s.phaseUsages) {
				lines.push(`  ${pu.phase} (${pu.modelId}): ${pu.inputTokens}in + ${pu.outputTokens}out = ${pu.inputTokens + pu.outputTokens} total`);
			}
			const totalIn = s.phaseUsages.reduce((a, p) => a + p.inputTokens, 0);
			const totalOut = s.phaseUsages.reduce((a, p) => a + p.outputTokens, 0);
			lines.push(`  TOTAL: ${totalIn}in + ${totalOut}out = ${totalIn + totalOut}`);
		}

		lines.push('');
		lines.push('=== End of Debug Export ===');

		navigator.clipboard.writeText(lines.join('\n')).then(() => {
			setDebugCopied(true);
			window.setTimeout(() => setDebugCopied(false), 1500);
		});
	};

	// Listen for continue-analysis events from ContinueAnalysisInput
	const lastUIEvent = useUIEventStore((s) => s.lastEvent);
	const incrementTriggerAnalysis = useSearchSessionStore((s) => s.incrementTriggerAnalysis);
	useEffect(() => {
		if (lastUIEvent?.type === 'continue-analysis') {
			const text = (lastUIEvent.payload as any)?.text as string | undefined;
			if (isV2Active && text?.trim()) {
				// V2: freeze current round and start continue round (append mode)
				const sessionStore = useSearchSessionStore.getState();
				sessionStore.freezeCurrentRound();
				sessionStore.startContinueRound(text.trim());
				// Set the search query for display
				useSharedStore.getState().setSearchQuery(text.trim());
				// Set continue mode flag so performAnalysis skips reset
				useSearchSessionStore.setState({ continueMode: true });
				// Trigger analysis in continue mode
				incrementTriggerAnalysis();
			} else {
				// V1: open InlineFollowupChat
				setContinueAnalysisInitialText(text);
				setShowContinueAnalysis(true);
				setTimeout(() => {
					continueAnalysisBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}, 100);
			}
		}
	}, [lastUIEvent]);

	// process analysis result ========================================================

	const { handleOpenInChat, handleCopyAll, handleAutoSave } = useAIAnalysisResult();

	// Auto-save when analysis completes (if enabled). Skip when state was restored from Recent (no duplicate save).
	useEffect(() => {
		if (!analysisCompleted) return;
		if (restoredFromHistory) return;
		const autoSaveEnabled = AppContext.getInstance().settings.search.aiAnalysisAutoSaveEnabled ?? true;
		if (!autoSaveEnabled) return;
		if (error) return;
		if (!sessionId) return;

		handleAutoSave();
	}, [analysisCompleted, restoredFromHistory, error, sessionId, handleAutoSave]);

	// Nav bar condition: show when steps have content OR is streaming (supports both old and new pipeline)
	const showNavBar = !isV2Active && (isNewPipeline || getHasCompletedContent() || (hasStartedStreaming && !analysisCompleted));

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Sub navigation (below input, outside frames) */}
			{showNavBar ? (
				<div className="pktw-flex-shrink-0 pktw-px-4">
					<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-3 pktw-p-2 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white">
						{/* Title on the left (typewriter when just completed, plain when restored from history) */}
						<div className="pktw-min-w-0 pktw-flex-1 pktw-pr-2">
							{titleDisplay ? (
								<span className="pktw-text-sm pktw-font-semibold pktw-text-[#1a1c1e] pktw-truncate pktw-block" title={titleFromStore ?? undefined}>
									{titleDisplay}
								</span>
							) : null}
						</div>
						{/* Nav buttons on the right */}
						<div className="pktw-flex pktw-flex-shrink-0 pktw-flex-wrap pktw-gap-2">
							{isNewPipeline ? (
								<>
									{hasNewPipelineReport ? (
										<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToStep('report')}>Summary</Button>
									) : null}
									{hasNewPipelineSources ? (
										<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToStep('sources')}>Sources</Button>
									) : null}
									{settings.enableDevTools ? (
										<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToStep('classify')}>Steps</Button>
									) : null}
								</>
							) : (
								<>
									{getHasSummarySection() ? (
										<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(summaryRef)}>Summary</Button>
									) : null}
									{getActiveOverviewMermaid?.()?.trim() ? (
										<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(overviewRef)}>Overview</Button>
									) : null}
									{getHasTopicsSection() ? (
										<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(topicsRef)}>Topics</Button>
									) : null}
									{getHasGraphData() ? (
										<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(graphSectionRef)}>Graph</Button>
									) : null}
									{getHasSourcesSection() ? (
										<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(sourcesRef)}>Sources</Button>
									) : null}
									{settings.enableDevTools && ((steps?.length ?? 0) > 0 || (hasStartedStreaming && !analysisCompleted)) ? (
										<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(stepsRef)}>Steps</Button>
									) : null}
								</>
							)}
							{getHasDashboardBlocksSection() ? (
								(dashboardBlocks?.length ?? 0) > 1 ? (
									<HoverCard openDelay={150} closeDelay={100}>
										<HoverCardTrigger asChild>
											<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(dashboardBlocksRef)}>Blocks</Button>
										</HoverCardTrigger>
										<HoverCardContent side="bottom" align="start" className="pktw-w-auto pktw-min-w-[160px] pktw-py-1 pktw-max-h-[min(60vh,420px)] pktw-overflow-y-auto">
											<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
												{(dashboardBlocks ?? []).map((b) => {
													const raw = b.title || 'Block';
													const label = raw.replace(/^#+\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').trim() || 'Block';
													return (
														<Button
															key={b.id}
															variant="ghost"
															style={{ cursor: 'pointer' }}
															className="pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-rounded pktw-truncate pktw-flex pktw-justify-start"
															onClick={() => scrollToBlock(b.id)}
														>
															{label}
														</Button>
													);
												})}
												{(fullAnalysisFollowUp?.length ?? 0) > 0 ? (
													<>
														<div className="pktw-border-t pktw-border-[#e5e7eb] pktw-mt-1 pktw-pt-2" />
														{(fullAnalysisFollowUp ?? []).map((s, i) => {
															const raw = s.title || 'Continue';
															const label = raw.replace(/^#+\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
															return (
																<Button
																	key={i}
																	variant="ghost"
																	style={{ cursor: 'pointer' }}
																	className="pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-rounded pktw-truncate pktw-flex pktw-justify-start"
																	onClick={() => scrollToContinueSection(i)}
																>
																	{label.slice(0, SLICE_CAPS.ui.tabSearchLabel)}{label.length > SLICE_CAPS.ui.tabSearchLabel ? '…' : ''}
																</Button>
															);
														})}
													</>
												) : null}
											</div>
										</HoverCardContent>
									</HoverCard>
								) : (
									<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(dashboardBlocksRef)}>Blocks</Button>
								)
							) : null}
							{(fullAnalysisFollowUp?.length ?? 0) > 0 ? (
								(fullAnalysisFollowUp?.length ?? 0) > 1 ? (
									<HoverCard openDelay={150} closeDelay={100}>
										<HoverCardTrigger asChild>
											<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(continueAnalysisRef)}>Continue</Button>
										</HoverCardTrigger>
										<HoverCardContent side="bottom" align="start" className="pktw-w-auto pktw-min-w-[180px] pktw-py-1 pktw-max-h-[min(60vh,420px)] pktw-overflow-y-auto">
											<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
												{(fullAnalysisFollowUp ?? []).map((s, i) => {
													const raw = s.title || 'Continue';
													const label = raw.replace(/^#+\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
													return (
														<Button
															key={i}
															variant="ghost"
															style={{ cursor: 'pointer' }}
															className="pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-rounded pktw-truncate pktw-flex pktw-justify-start"
															onClick={() => scrollToContinueSection(i)}
														>
															{label.slice(0, SLICE_CAPS.ui.tabSearchLabel)}{label.length > SLICE_CAPS.ui.tabSearchLabel ? '…' : ''}
														</Button>
													);
												})}
											</div>
										</HoverCardContent>
									</HoverCard>
								) : (
									<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToContinueSection(0)}>Continue</Button>
								)
							) : null}
						</div>
					</div>
				</div>
			) : null}

			{/* V2 title bar — shown when analysis is completed */}
			{isV2Active && analysisCompleted && titleFromStore && (
				<div className="pktw-px-4 pktw-py-2 pktw-flex-shrink-0">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-2 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white">
						<div className="pktw-min-w-0 pktw-flex-1">
							<span className="pktw-text-sm pktw-font-semibold pktw-text-[#1a1c1e] pktw-truncate pktw-block" title={titleFromStore}>
								{titleDisplay || titleFromStore}
							</span>
							<span className="pktw-text-xs pktw-text-[#9ca3af] pktw-truncate pktw-block">
								{useSearchSessionStore.getState().query}
							</span>
						</div>
					</div>
				</div>
			)}

			{/* Main Content - extra top/side padding for IntelligenceFrame glow to avoid clipping */}
			<div ref={contentContainerRef} className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-pt-6 pktw-px-4 pktw-pb-5">
				<SearchResultView onClose={onClose} onRetry={handleRetry} onApprove={handleApprovePlan} onRegenerateSection={handleRegenerateSection} />

				{/* Continue Analysis: inline at bottom of content area (V1 only — V2 has its own input) */}
				{!isV2Active && analysisCompleted && showContinueAnalysis ? (
					<div ref={continueAnalysisBlockRef} className="pktw-mt-6 pktw-scroll-mt-4">
						<InlineFollowupChat
							{...continueAnalysisConfig}
							initialQuestion={continueAnalysisInitialText}
							autoSubmit={!!continueAnalysisInitialText}
							outputPlace="parent"
							onStreamingReplace={(text, ctx) => setFollowUpStreaming(ctx?.question ? { question: ctx.question, content: text ?? '' } : null)}
							onApply={(answer, mode, question) => {
								setFollowUpStreaming(null);
								setFullAnalysisFollowUp(question ?? 'Continue', answer, mode);
							}}
						/>
					</div>
				) : null}
			</div>

			{/* Footer — V2 renders its own content, V1 renders original */}
			{isV2Active && analysisCompleted ? (
				<V2Footer onContinue={() => setShowV2ContinueInput(!showV2ContinueInput)} onSynthesize={() => { console.log('Synthesize clicked'); }} showContinueAnalysis={showV2ContinueInput} onCopy={() => { handleCopyAll(); setCopied(true); window.setTimeout(() => setCopied(false), 1000); }} copied={copied} onSave={() => setShowSaveDialog(true)} onOpenInChat={() => handleOpenInChat(onClose)} />
			) : null}
			<div className={`pktw-px-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-t pktw-border-[#e5e7eb] pktw-flex pktw-items-center pktw-justify-between pktw-flex-shrink-0 ${isV2Active ? 'pktw-hidden' : ''}`}>
				{!hasAnalyzed && !isAnalyzing ? <AISearchFooterHints /> : null}
				{hasAnalyzed ? <UsageBadge /> : null}
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					{/* Debug copy: always show when new pipeline has data, even mid-stream */}
					{isNewPipeline && isAnalyzing && (
						<Button
							onClick={handleCopyDebugInfo}
							size="sm"
							variant="ghost"
							className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
							title={debugCopied ? 'Copied!' : 'Copy session debug info'}
						>
							{debugCopied ? <Check className="pktw-w-3.5 pktw-h-3.5" /> : <ClipboardList className="pktw-w-3.5 pktw-h-3.5" />}
						</Button>
					)}
					{analysisCompleted && !isAnalyzing && (
						<>
							{/* Copy + Save: icon-only, no border; Copy shows Check for 1s after click then back to Copy */}
							<div className="pktw-flex pktw-items-center pktw-gap-1">
								{isNewPipeline && (
									<Button
										onClick={handleCopyDebugInfo}
										size="sm"
										variant="ghost"
										className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
										title={debugCopied ? 'Copied!' : 'Copy session debug info'}
									>
										{debugCopied ? <Check className="pktw-w-3.5 pktw-h-3.5" /> : <ClipboardList className="pktw-w-3.5 pktw-h-3.5" />}
									</Button>
								)}
								<Button
									onClick={() => {
										handleCopyAll();
										setCopied(true);
										window.setTimeout(() => setCopied(false), 1000);
									}}
									size="sm"
									variant="ghost"
									className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
									title={copied ? 'Copied' : 'Copy All'}
								>
									{copied ? <Check className="pktw-w-3.5 pktw-h-3.5" /> : <Copy className="pktw-w-3.5 pktw-h-3.5" />}
								</Button>
								<Button
									onClick={() => setShowSaveDialog(true)}
									size="sm"
									variant="ghost"
									className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
									title="Save to File"
								>
									<Save className="pktw-w-3.5 pktw-h-3.5" />
								</Button>
								{openAnalysisPath ? (
									<Button
										onClick={() => void createOpenSourceCallback(onClose)(openAnalysisPath)}
										size="sm"
										variant="ghost"
										className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
										title="Open saved analysis file in document"
									>
										<ExternalLink className="pktw-w-3.5 pktw-h-3.5" />
									</Button>
								) : null}
							</div>
							<Button
								onClick={() => {
									const next = !showContinueAnalysis;
									setShowContinueAnalysis(next);
									if (next) {
										setTimeout(() => {
											continueAnalysisBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
										}, 100);
									}
								}}
								size="sm"
								variant="outline"
								className={`pktw-px-4 pktw-py-1.5 pktw-gap-2 ${showContinueAnalysis ? 'pktw-bg-[#6d28d9]/10 pktw-border-[#6d28d9]/30' : 'pktw-border-[#e5e7eb] pktw-bg-white pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9]'}`}
								title={showContinueAnalysis ? 'Hide Continue Analysis' : 'Continue analysis with follow-up questions'}
							>
								<MessageSquare className="pktw-w-3.5 pktw-h-3.5" />
								<span>Continue Analysis</span>
							</Button>
							<HoverCard openDelay={150} closeDelay={300}>
								<HoverCardTrigger asChild>
									<Button
										size="sm"
										className="pktw-px-4 pktw-py-1.5 pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] pktw-gap-2"
										title="Open in chat or full analysis view"
									>
										<MessageCircle className="pktw-w-3.5 pktw-h-3.5" />
										<span>Open in Chat</span>
										<ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-opacity-80" />
									</Button>
								</HoverCardTrigger>
								<HoverCardContent align="end" side="bottom" sideOffset={4} className="pktw-w-[200px] pktw-p-1 pktw-z-[10000]">
									<Button
										variant="ghost"
										style={{ cursor: 'pointer' }}
										className="pktw-shadow-none pktw-w-full pktw-flex pktw-items-center pktw-gap-2 pktw-rounded-sm pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-text-left pktw-cursor-pointer"
										onClick={() => handleOpenInChat(onClose)}
									>
										<MessageCircle className="pktw-w-3.5 pktw-h-3.5" />
										<span>Open in Chat</span>
									</Button>
									<Button
										variant="ghost"
										style={{ cursor: 'pointer' }}
										className="pktw-shadow-none pktw-w-full pktw-flex pktw-items-center pktw-gap-2 pktw-rounded-sm pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-text-left pktw-cursor-pointer"
										title="Open this analysis in the main view for a larger view"
										onClick={() => {
											// TODO: open this analysis in main view (full analysis view)
										}}
									>
										<Maximize2 className="pktw-w-3.5 pktw-h-3.5" />
										<span>Full analysis view</span>
									</Button>
								</HoverCardContent>
							</HoverCard>
						</>
					)}
				</div>
			</div>

			{/* V2 floating continue analysis input */}
			{showV2ContinueInput && (
				<V2ContinueAnalysisInput onClose={() => setShowV2ContinueInput(false)} />
			)}

			{/* Save dialog */}
			{showSaveDialog && (
				<SaveDialog onClose={() => setShowSaveDialog(false)} />
			)}
			{/* Context follow-up modal (Graph/Blocks/Sources) – same TopicModal with converted messages */}
			{contextChatModal != null && (
				<SectionExtraChatModal
					title={contextChatModal.title}
					streaming={
						contextChatModal.streamingQuestion && contextChatModal.streamingText
							? { question: contextChatModal.streamingQuestion, answerSoFar: contextChatModal.streamingText }
							: null
					}
					activeQuestion={contextChatModal.activeQuestion}
					analyzeResults={contextChatModal.messages}
					isInspectLoading={false}
					inspectItems={[]}
					isGraphLoading={false}
					graph={null}
					onClose={() => setContextChatModal(null)}
				/>
			)}
			{/* Topic expansion modal */}
			{topicModalOpen != null && (
				<SectionExtraChatModal
					title={`Topic: ${topicModalOpen}`}
					streaming={
						topicAnalyzeStreaming?.topic === topicModalOpen
							? { question: topicAnalyzeStreaming.question, answerSoFar: topicAnalyzeStreaming.chunks.join('') }
							: null
					}
					analyzeResults={topicAnalyzeResults?.[topicModalOpen] ?? []}
					isInspectLoading={topicInspectLoading === topicModalOpen}
					inspectItems={topicInspectResults?.[topicModalOpen] ?? []}
					isGraphLoading={topicGraphLoading === topicModalOpen}
					graph={topicGraphResults?.[topicModalOpen] ?? null}
					onClose={() => setTopicModalOpen(null)}
				/>
			)}
		</div>
	);
};
