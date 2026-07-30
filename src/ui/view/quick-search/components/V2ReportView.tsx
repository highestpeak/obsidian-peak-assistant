import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Copy, Check, Sparkles, Loader2, CheckCircle, Clock, ChevronRight, MessageSquareText, Send } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import type { V2Section } from '../store/searchSessionStore';
import { StreamdownIsolated } from '@/ui/component/mine/StreamdownIsolated';
import { Button } from '@/ui/component/shared-ui/button';
import { V2ReportContinueComposer } from './V2ContinueAnalysisInput';
import { isReportReadyForFollowup } from './reportState';

interface V2ReportViewProps {
	onRegenerateSection?: (id: string, prompt?: string) => void;
	onAskSection?: (id: string, question: string, onDelta?: (answer: string) => void) => Promise<string>;
}

const ANNOTATION_TYPE_SYMBOL: Record<string, string> = {
	question: '?',
	disagree: '!',
	expand: '+',
	note: '#',
};

/** Single section block card — matches V1's DashboardBlocksSection visual */
const SectionBlock: React.FC<{
	section: V2Section;
	index: number;
	onRegenerate?: (id: string, prompt?: string) => void;
	onAsk?: (id: string, question: string, onDelta?: (answer: string) => void) => Promise<string>;
}> = ({ section, index, onRegenerate, onAsk }) => {
	const [showPrompt, setShowPrompt] = useState(false);
	const [prompt, setPrompt] = useState('');
	const [copied, setCopied] = useState(false);
	const [showAsk, setShowAsk] = useState(false);
	const [question, setQuestion] = useState('');
	const [asking, setAsking] = useState(false);
	const [streamingAnswer, setStreamingAnswer] = useState('');
	const [askError, setAskError] = useState('');

	// Annotation state
	const [showAnnotationBar, setShowAnnotationBar] = useState(false);
	const [selectedText, setSelectedText] = useState('');
	const [annotationPos, setAnnotationPos] = useState({ x: 0, y: 0 });
	const [annotationType, setAnnotationType] = useState<'question' | 'disagree' | 'expand' | 'note'>('question');
	const [annotationComment, setAnnotationComment] = useState('');

	const annotations = useSearchSessionStore((s) => {
		for (const round of s.rounds) {
			const matching = round.annotations.filter(
				(a) => round.sections[a.sectionIndex]?.id === section.id
			);
			if (matching.length > 0) return matching;
		}
		return [];
	});
	const followups = useSearchSessionStore((state) => state.v2SectionFollowups[section.id] ?? []);

	const content = section.status === 'generating'
		? section.streamingText
		: section.content;

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(`## ${section.title}\n\n${section.content}`);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	}, [section]);

	const handleRegenerate = useCallback(() => {
		if (showPrompt && prompt.trim()) {
			onRegenerate?.(section.id, prompt.trim());
			setPrompt('');
			setShowPrompt(false);
		} else {
			setShowPrompt(!showPrompt);
		}
	}, [showPrompt, prompt, section.id, onRegenerate]);

	const handleAsk = useCallback(async () => {
		const value = question.trim();
		if (!value || !onAsk || asking) return;
		setAsking(true);
		setAskError('');
		setStreamingAnswer('');
		try {
			await onAsk(section.id, value, setStreamingAnswer);
			setQuestion('');
			setStreamingAnswer('');
		} catch (error) {
			setAskError(error instanceof Error ? error.message : 'Follow-up failed');
		} finally {
			setAsking(false);
		}
	}, [asking, onAsk, question, section.id]);

	const handleTextSelect = useCallback(() => {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || !sel.toString().trim()) {
			setShowAnnotationBar(false);
			return;
		}
		const range = sel.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		setSelectedText(sel.toString().trim().slice(0, 200));
		setAnnotationPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
		setShowAnnotationBar(true);
	}, []);

	const handleSubmitAnnotation = useCallback(() => {
		if (!annotationComment.trim()) return;
		const store = useSearchSessionStore.getState();
		const roundIdx = store.rounds.findIndex((r) => r.sections.some((s) => s.id === section.id));
		const effectiveRoundIdx = roundIdx >= 0 ? roundIdx : Math.max(0, store.currentRoundIndex - 1);
		store.addAnnotation({
			id: `ann-${Date.now()}`,
			roundIndex: effectiveRoundIdx,
			sectionIndex: index,
			selectedText: selectedText || undefined,
			comment: annotationComment.trim(),
			type: annotationType,
			createdAt: Date.now(),
		});
		setShowAnnotationBar(false);
		setAnnotationComment('');
		setSelectedText('');
	}, [section.id, index, selectedText, annotationComment, annotationType]);

	return (
		<motion.div
			data-section-id={section.id}
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
			className={`pktw-bg-pk-background pktw-rounded-xl pktw-border pktw-border-pk-border pktw-flex pktw-flex-col pktw-group pktw-w-full ${
				section.status === 'pending' ? 'pktw-p-4' : 'pktw-p-5'
			}`}
		>
			{/* Header */}
			<div className={`pktw-flex pktw-items-center pktw-gap-2 ${
				section.status === 'pending' ? '' : 'pktw-mb-3'
			}`}>
				{/* Status indicator */}
				{section.status === 'done' && <CheckCircle className="pktw-w-4 pktw-h-4 pktw-text-pk-success pktw-shrink-0" />}
				{section.status === 'generating' && <Loader2 className="pktw-w-4 pktw-h-4 pktw-text-pk-accent pktw-animate-spin pktw-shrink-0" />}
				{section.status === 'pending' && <Clock className="pktw-w-4 pktw-h-4 pktw-text-pk-border-light pktw-shrink-0" />}
				<span className="pktw-text-sm pktw-font-semibold pktw-text-pk-foreground pktw-flex-1 pktw-line-clamp-2" title={section.title}>
					{section.title}
				</span>
				{annotations.length > 0 && (
					<div className="pktw-flex pktw-gap-0.5 pktw-shrink-0">
						{annotations.map((a) => (
							<span
								key={a.id}
								className="pktw-text-pk-xs pktw-px-1 pktw-py-0.5 pktw-rounded pktw-bg-[--interactive-accent] pktw-text-[--text-on-accent] pktw-cursor-default"
								title={`[${a.type}] ${a.comment}`}
							>
								{ANNOTATION_TYPE_SYMBOL[a.type]}
							</span>
						))}
					</div>
				)}
				{section.status === 'done' && (
					<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-shrink-0">
						<Button variant="ghost" size="sm" geometry="toolbar" className="pktw-text-xs" onClick={() => setShowAsk((value) => !value)}>
							<MessageSquareText className="pktw-w-4 pktw-h-4 pktw-mr-1" />
							Ask
						</Button>
						{onRegenerate && (
							<Button variant="ghost" size="sm" geometry="toolbar" className="pktw-text-xs" onClick={handleRegenerate}>
								<RefreshCw className="pktw-w-4 pktw-h-4 pktw-mr-1" />
								Revise
							</Button>
						)}
						<Button variant="ghost" size="sm" geometry="toolbar" className="pktw-text-xs" onClick={handleCopy}>
							{copied ? <Check className="pktw-w-4 pktw-h-4 pktw-mr-1 pktw-text-pk-success" /> : <Copy className="pktw-w-4 pktw-h-4 pktw-mr-1" />}
							{copied ? 'Copied' : 'Copy'}
						</Button>
					</div>
				)}
			</div>

			{/* Regeneration prompt input */}
			<AnimatePresence>
				{showPrompt && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						className="pktw-mb-3 pktw-overflow-hidden"
					>
						<div className="pktw-flex pktw-gap-2">
							<input
								value={prompt}
								onChange={(e) => setPrompt(e.target.value)}
								onKeyDown={(e) => {
									if (e.nativeEvent.isComposing) return;
									if (e.key !== 'Enter') return;
									e.preventDefault();
									handleRegenerate();
								}}
								placeholder="Describe what to change..."
								className="pktw-flex-1 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-border pktw-border-pk-border pktw-rounded-lg pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-pk-accent/50"
								autoFocus
							/>
							<Button
								size="sm"
								geometry="action"
								onClick={() => { onRegenerate?.(section.id, prompt.trim() || undefined); setPrompt(''); setShowPrompt(false); }}
							>
								Revise
							</Button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Skeleton when generating but no content yet */}
			{section.status === 'generating' && !content && (
				<div className="pktw-space-y-3 pktw-animate-pulse">
					<div className="pktw-h-3 pktw-bg-pk-skeleton pktw-rounded pktw-w-full" />
					<div className="pktw-h-3 pktw-bg-pk-skeleton pktw-rounded pktw-w-5/6" />
					<div className="pktw-h-3 pktw-bg-pk-skeleton pktw-rounded pktw-w-4/6" />
					<div className="pktw-h-8 pktw-bg-pk-skeleton pktw-rounded pktw-w-full pktw-mt-2" />
					<div className="pktw-h-3 pktw-bg-pk-skeleton pktw-rounded pktw-w-full" />
					<div className="pktw-h-3 pktw-bg-pk-skeleton pktw-rounded pktw-w-3/4" />
				</div>
			)}

			{/* Content — only show when we have text */}
			<div onMouseUp={handleTextSelect}>
				{content && (
					<StreamdownIsolated isAnimating={section.status === 'generating'} className="pktw-select-text pktw-break-words">
						{content}
					</StreamdownIsolated>
				)}
			</div>

			<AnimatePresence initial={false}>
				{showAsk && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						className="pktw-overflow-hidden"
					>
						<div className="pktw-mt-4 pktw-pt-3 pktw-border-t pktw-border-pk-border">
							{followups.length > 0 && (
								<div className="pktw-space-y-2 pktw-mb-3">
									{followups.map((turn, turnIndex) => (
										<div key={`${turn.question}-${turnIndex}`} className="pktw-rounded-lg pktw-bg-pk-surface-raised pktw-border pktw-border-pk-border pktw-p-3">
											<span className="pktw-block pktw-text-xs pktw-font-semibold pktw-text-pk-text-primary pktw-mb-1">
												{turn.question}
											</span>
											<StreamdownIsolated isAnimating={false} className="pktw-text-sm">
												{turn.answer}
											</StreamdownIsolated>
										</div>
									))}
								</div>
							)}
							{streamingAnswer && (
								<div className="pktw-rounded-lg pktw-bg-pk-surface-raised pktw-border pktw-border-pk-accent/20 pktw-p-3 pktw-mb-3">
									<StreamdownIsolated isAnimating={asking} className="pktw-text-sm">
										{streamingAnswer}
									</StreamdownIsolated>
								</div>
							)}
							<div className="pktw-flex pktw-items-end pktw-gap-2">
								<textarea
									value={question}
									onChange={(event) => setQuestion(event.target.value)}
									onKeyDown={(event) => {
										if (event.nativeEvent.isComposing) return;
										if (event.key !== 'Enter' || event.shiftKey) return;
										event.preventDefault();
										void handleAsk();
									}}
									placeholder="Ask about this section without changing it..."
									className="pktw-flex-1 pktw-min-h-[52px] pktw-resize-y pktw-px-3 pktw-py-2 pktw-text-xs pktw-border pktw-border-pk-border pktw-rounded-lg pktw-bg-pk-background pktw-outline-none focus:pktw-border-pk-accent"
								/>
								<Button
									size="icon"
									geometry="toolbar-icon"
									disabled={!question.trim() || asking || !onAsk}
									className="!pktw-rounded-full"
									title="Ask about this section"
									onClick={() => void handleAsk()}
								>
									{asking ? <Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-animate-spin" /> : <Send className="pktw-w-3.5 pktw-h-3.5" />}
								</Button>
							</div>
							{askError && <span className="pktw-block pktw-text-xs pktw-text-pk-error pktw-mt-1.5">{askError}</span>}
						</div>
					</motion.div>
				)}
			</AnimatePresence>

{/* Error */}
			{section.status === 'error' && section.error && (
				<div className="pktw-text-xs pktw-text-pk-error pktw-mt-2">{section.error}</div>
			)}

			{/* Annotation toolbar */}
			{showAnnotationBar && (
				<div
					className="pktw-fixed pktw-z-50 pktw-bg-[--background-primary] pktw-border pktw-border-[--background-modifier-border] pktw-rounded-lg pktw-shadow-lg pktw-p-2 pktw-flex pktw-flex-col pktw-gap-1.5"
					style={{ left: annotationPos.x, top: annotationPos.y, transform: 'translate(-50%, -100%)' }}
				>
					<div className="pktw-flex pktw-gap-1">
						{(['question', 'disagree', 'expand', 'note'] as const).map((t) => (
							<Button
								key={t}
								variant={annotationType === t ? 'default' : 'outline'}
								size="sm"
								geometry="toolbar"
								className="pktw-text-pk-xs"
								onClick={() => setAnnotationType(t)}
							>
								{ANNOTATION_TYPE_SYMBOL[t]} {t}
							</Button>
						))}
					</div>
					<div className="pktw-flex pktw-gap-1">
						<input
							type="text"
							className="pktw-flex-1 pktw-text-xs pktw-px-2 pktw-py-1 pktw-border pktw-border-[--background-modifier-border] pktw-rounded pktw-bg-transparent pktw-text-[--text-normal] pktw-outline-none"
							placeholder="Your comment..."
							value={annotationComment}
							onChange={(e) => setAnnotationComment(e.target.value)}
							onKeyDown={(e) => {
								if (e.nativeEvent.isComposing) return;
								if (e.key === 'Enter') handleSubmitAnnotation();
								if (e.key === 'Escape') setShowAnnotationBar(false);
							}}
							autoFocus
						/>
						<Button size="sm" geometry="toolbar" className="pktw-text-xs" onClick={handleSubmitAnnotation}>
							Add
						</Button>
					</div>
				</div>
			)}
		</motion.div>
	);
};

/** Collapsible Executive Summary */
const CollapsibleSummary: React.FC<{ summary: string; summaryStreaming: boolean }> = ({ summary, summaryStreaming }) => {
	const [expanded, setExpanded] = useState(true);
	return (
		<div className="pktw-bg-pk-background pktw-rounded-xl pktw-border pktw-border-pk-border pktw-mb-4">
			<div
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-4 pktw-pb-0 pktw-cursor-pointer"
				onClick={() => !summaryStreaming && setExpanded(!expanded)}
			>
				<ChevronRight className={`pktw-w-3.5 pktw-h-3.5 pktw-text-pk-foreground-muted pktw-transition-transform ${expanded ? 'pktw-rotate-90' : ''}`} />
				<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-pk-accent" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-pk-text-primary">Executive Summary</span>
				{summaryStreaming && <Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent pktw-animate-spin" />}
			</div>
			{expanded && (
				<div className="pktw-px-5 pktw-pb-5 pktw-pt-3">
					<StreamdownIsolated isAnimating={summaryStreaming} className="pktw-select-text pktw-break-words">
						{summary}
					</StreamdownIsolated>
				</div>
			)}
		</div>
	);
};

export const V2ReportView: React.FC<V2ReportViewProps> = ({ onRegenerateSection, onAskSection }) => {
	const { rounds, v2PlanSections: sections, v2Summary: summary, v2SummaryStreaming: summaryStreaming } = useSearchSessionStore(
		(s) => ({
			rounds: s.rounds,
			v2PlanSections: s.v2PlanSections,
			v2Summary: s.v2Summary,
			v2SummaryStreaming: s.v2SummaryStreaming,
		})
	);
	const progress = useMemo(() => {
		const doneCount = sections.filter((s) => s.status === 'done').length;
		const total = sections.length + 1; // +1 for executive summary
		const summaryDone = !summaryStreaming && !!summary;
		const completed = doneCount + (summaryDone ? 1 : 0);
		return { completed, total, pct: Math.round((completed / total) * 100) };
	}, [sections, summary, summaryStreaming]);

	const isGenerating = sections.some((s) => s.status === 'generating') || summaryStreaming;
	const reportReadyForFollowup = useMemo(
		() => isReportReadyForFollowup(sections, summary, summaryStreaming),
		[sections, summary, summaryStreaming],
	);

	// No content yet — show loading state instead of blank page
	if (sections.length === 0 && !summary && rounds.length === 0) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-h-32 pktw-text-sm pktw-text-pk-foreground-muted pktw-gap-2">
				<Loader2 className="pktw-w-5 pktw-h-5 pktw-animate-spin" />
				<span>Preparing report...</span>
			</div>
		);
	}

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pktw-px-1 pktw-py-2">
			{/* Previous completed rounds */}
			{rounds.map((round, ri) => (
				<React.Fragment key={`round-${ri}`}>
					{ri > 0 && (
						<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-3 pktw-px-4">
							<div className="pktw-flex-1 pktw-h-px pktw-bg-[--background-modifier-border]" />
							<span className="pktw-text-xs pktw-text-[--text-muted] pktw-whitespace-nowrap">
								Round {ri + 1}: {round.query.length > 50 ? round.query.slice(0, 50) + '...' : round.query}
							</span>
							<div className="pktw-flex-1 pktw-h-px pktw-bg-[--background-modifier-border]" />
						</div>
					)}
					{round.summary && (
						<div className="pktw-rounded-lg pktw-border pktw-border-[--background-modifier-border] pktw-p-4 pktw-mb-3">
							<span className="pktw-text-xs pktw-font-medium pktw-text-[--text-muted] pktw-mb-2 pktw-block">
								Executive Summary
							</span>
							<StreamdownIsolated isAnimating={false}>
								{round.summary}
							</StreamdownIsolated>
						</div>
					)}
					<div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-mb-4">
						{round.sections.map((sec, si) => (
							<SectionBlock
								key={sec.id}
								section={sec}
								index={si}
								onAsk={onAskSection}
							/>
						))}
					</div>
				</React.Fragment>
			))}

			{/* Current round separator — only when there are past rounds AND current sections */}
			{rounds.length > 0 && sections.length > 0 && (
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-3 pktw-px-4">
					<div className="pktw-flex-1 pktw-h-px pktw-bg-[--background-modifier-border]" />
					<span className="pktw-text-xs pktw-text-[--text-muted]">
						Round {rounds.length + 1} (current)
					</span>
					<div className="pktw-flex-1 pktw-h-px pktw-bg-[--background-modifier-border]" />
				</div>
			)}

			{/* Progress bar — show during generation */}
			{isGenerating && (
				<div className="pktw-mb-4">
					<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-1.5">
						<span className="pktw-text-xs pktw-text-pk-foreground-muted">
							{progress.completed}/{progress.total} sections
						</span>
						<span className="pktw-text-xs pktw-font-medium pktw-text-pk-accent">
							{progress.pct}%
						</span>
					</div>
					<div className="pktw-h-1.5 pktw-bg-pk-skeleton pktw-rounded-full pktw-overflow-hidden">
						<motion.div
							className="pktw-h-full pktw-bg-pk-accent pktw-rounded-full"
							initial={{ width: 0 }}
							animate={{ width: `${progress.pct}%` }}
							transition={{ duration: 0.5, ease: 'easeOut' }}
						/>
					</div>
				</div>
			)}

			{/* When no sections: show summary as the full report content */}
			{sections.length === 0 && summary && (
				<div className="pktw-px-1 pktw-pb-4">
					<StreamdownIsolated isAnimating={summaryStreaming} className="pktw-select-text pktw-break-words">
						{summary}
					</StreamdownIsolated>
				</div>
			)}

			{/* When sections exist: show executive summary + sections */}
			{sections.length > 0 && (
				<>
					{(summary || summaryStreaming) && (
						<CollapsibleSummary summary={summary} summaryStreaming={summaryStreaming} />
					)}
					<div className="pktw-flex pktw-flex-col pktw-gap-3">
						{sections.map((sec, i) => (
							<SectionBlock
								key={sec.id}
								section={sec}
								index={i}
								onRegenerate={onRegenerateSection}
								onAsk={onAskSection}
							/>
						))}
					</div>
				</>
			)}
			{reportReadyForFollowup && <V2ReportContinueComposer />}
		</motion.div>
	);
};
