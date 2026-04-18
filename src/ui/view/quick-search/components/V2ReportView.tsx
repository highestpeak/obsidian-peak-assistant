import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Copy, Check, Sparkles, Loader2, CheckCircle, Clock, ChevronRight, ArrowLeft } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import type { V2Section } from '../store/searchSessionStore';
import { StreamdownIsolated } from '@/ui/component/mine/StreamdownIsolated';
import { VizRenderer } from './viz/VizRenderer';
import { Button } from '@/ui/component/shared-ui/button';
import { V2InlinePlanReview } from './V2InlinePlanReview';

interface V2ReportViewProps {
	onClose?: () => void;
	onApprove?: () => void;
	onRegenerateSection?: (id: string, prompt?: string) => void;
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
}> = ({ section, index, onRegenerate }) => {
	const [showPrompt, setShowPrompt] = useState(false);
	const [prompt, setPrompt] = useState('');
	const [copied, setCopied] = useState(false);

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

	const content = section.status === 'generating'
		? section.streamingChunks.join('')
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
			className="pktw-bg-[#f9fafb] pktw-rounded-xl pktw-p-5 pktw-border pktw-border-[#e5e7eb] pktw-flex pktw-flex-col pktw-group pktw-w-full"
		>
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				{/* Status indicator */}
				{section.status === 'done' && <CheckCircle className="pktw-w-4 pktw-h-4 pktw-text-green-500 pktw-shrink-0" />}
				{section.status === 'generating' && <Loader2 className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed] pktw-animate-spin pktw-shrink-0" />}
				{section.status === 'pending' && <Clock className="pktw-w-4 pktw-h-4 pktw-text-[#d1d5db] pktw-shrink-0" />}
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#374151] pktw-flex-1 pktw-line-clamp-2" title={section.title}>
					{section.title}
				</span>
				{annotations.length > 0 && (
					<div className="pktw-flex pktw-gap-0.5 pktw-shrink-0">
						{annotations.map((a) => (
							<span
								key={a.id}
								className="pktw-text-[10px] pktw-px-1 pktw-py-0.5 pktw-rounded pktw-bg-[--interactive-accent] pktw-text-[--text-on-accent] pktw-cursor-default"
								title={`[${a.type}] ${a.comment}`}
							>
								{ANNOTATION_TYPE_SYMBOL[a.type]}
							</span>
						))}
					</div>
				)}
				<div className={`pktw-flex pktw-items-center pktw-gap-1 pktw-shrink-0 pktw-transition-opacity ${
					section.status === 'done' ? 'pktw-opacity-0 group-hover:pktw-opacity-100' : 'pktw-opacity-0'
				}`}>
					<div
						onClick={handleCopy}
						className="pktw-w-7 pktw-h-7 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-flex pktw-items-center pktw-justify-center pktw-cursor-pointer hover:pktw-bg-[#f5f3ff] pktw-transition-colors"
						title="Copy section"
					>
						{copied ? <Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-green-600" /> : <Copy className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />}
					</div>
					<div
						onClick={handleRegenerate}
						className="pktw-w-7 pktw-h-7 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-flex pktw-items-center pktw-justify-center pktw-cursor-pointer hover:pktw-bg-[#f5f3ff] pktw-transition-colors"
						title="Regenerate section"
					>
						<RefreshCw className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />
					</div>
				</div>
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
								onKeyDown={(e) => { if (e.key === 'Enter') handleRegenerate(); }}
								placeholder="Describe what to change..."
								className="pktw-flex-1 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-[#7c3aed]/50"
								autoFocus
							/>
							<div
								onClick={() => { onRegenerate?.(section.id, prompt.trim() || undefined); setPrompt(''); setShowPrompt(false); }}
								className="pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-text-white pktw-bg-[#7c3aed] pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-[#6d28d9]"
							>
								Regenerate
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Skeleton when generating but no content yet */}
			{section.status === 'generating' && !content && (
				<div className="pktw-space-y-3 pktw-animate-pulse">
					<div className="pktw-h-3 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-full" />
					<div className="pktw-h-3 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-5/6" />
					<div className="pktw-h-3 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-4/6" />
					<div className="pktw-h-8 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-full pktw-mt-2" />
					<div className="pktw-h-3 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-full" />
					<div className="pktw-h-3 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-3/4" />
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

			{section.vizData && section.status === 'done' && (
				<VizRenderer spec={section.vizData} />
			)}

			{/* Error */}
			{section.status === 'error' && section.error && (
				<div className="pktw-text-xs pktw-text-red-500 pktw-mt-2">{section.error}</div>
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
								className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-h-6"
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
								if (e.key === 'Enter') handleSubmitAnnotation();
								if (e.key === 'Escape') setShowAnnotationBar(false);
							}}
							autoFocus
						/>
						<Button size="sm" className="pktw-text-xs pktw-h-7" onClick={handleSubmitAnnotation}>
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
		<div className="pktw-bg-[#f9fafb] pktw-rounded-xl pktw-border pktw-border-[#e5e7eb] pktw-mb-4">
			<div
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-4 pktw-pb-0 pktw-cursor-pointer"
				onClick={() => !summaryStreaming && setExpanded(!expanded)}
			>
				<ChevronRight className={`pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af] pktw-transition-transform ${expanded ? 'pktw-rotate-90' : ''}`} />
				<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Executive Summary</span>
				{summaryStreaming && <Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed] pktw-animate-spin" />}
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

export const V2ReportView: React.FC<V2ReportViewProps> = ({ onClose, onApprove, onRegenerateSection }) => {
	const { rounds, v2PlanSections: sections, v2Summary: summary, v2SummaryStreaming: summaryStreaming } = useSearchSessionStore(
		(s) => ({
			rounds: s.rounds,
			v2PlanSections: s.v2PlanSections,
			v2Summary: s.v2Summary,
			v2SummaryStreaming: s.v2SummaryStreaming,
		})
	);
	const planApproved = useSearchSessionStore((s) => s.v2PlanApproved);

	const progress = useMemo(() => {
		const doneCount = sections.filter((s) => s.status === 'done').length;
		const total = sections.length + 1; // +1 for executive summary
		const summaryDone = !summaryStreaming && !!summary;
		const completed = doneCount + (summaryDone ? 1 : 0);
		return { completed, total, pct: Math.round((completed / total) * 100) };
	}, [sections, summary, summaryStreaming]);

	const isGenerating = sections.some((s) => s.status === 'generating') || summaryStreaming;

	// Plan review mode — show inline plan when sections exist but user hasn't approved yet
	if (sections.length > 0 && !planApproved) {
		return (
			<div className="pktw-px-1 pktw-py-2">
				<V2InlinePlanReview onApprove={onApprove ?? (() => {})} />
			</div>
		);
	}

	// No content yet — show loading state instead of blank page
	if (sections.length === 0 && !summary && rounds.length === 0) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-h-32 pktw-text-sm pktw-text-[#9ca3af] pktw-gap-2">
				<Loader2 className="pktw-w-5 pktw-h-5 pktw-animate-spin" />
				<span>Preparing report...</span>
			</div>
		);
	}

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pktw-px-1 pktw-py-2">
			{/* Back to Process button — visible when coming from a round's Report link */}
			{rounds.length > 0 && (
				<div
					className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2 pktw-py-1.5 pktw-mb-2 pktw-text-xs pktw-text-[#7c3aed] pktw-cursor-pointer hover:pktw-bg-[#f5f3ff] pktw-rounded-lg pktw-w-fit pktw-transition-colors"
					onClick={() => useSearchSessionStore.getState().setV2View('process')}
				>
					<ArrowLeft className="pktw-w-3.5 pktw-h-3.5" />
					<span>Back to Process</span>
				</div>
			)}
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
						<span className="pktw-text-xs pktw-text-[#6b7280]">
							{progress.completed}/{progress.total} sections
						</span>
						<span className="pktw-text-xs pktw-font-medium pktw-text-[#7c3aed]">
							{progress.pct}%
						</span>
					</div>
					<div className="pktw-h-1.5 pktw-bg-[#e5e7eb] pktw-rounded-full pktw-overflow-hidden">
						<motion.div
							className="pktw-h-full pktw-bg-[#7c3aed] pktw-rounded-full"
							initial={{ width: 0 }}
							animate={{ width: `${progress.pct}%` }}
							transition={{ duration: 0.5, ease: 'easeOut' }}
						/>
					</div>
				</div>
			)}

			{/* Executive Summary — collapsible */}
			{(summary || summaryStreaming) && (
				<CollapsibleSummary summary={summary} summaryStreaming={summaryStreaming} />
			)}

			{/* Section blocks */}
			<div className="pktw-flex pktw-flex-col pktw-gap-3">
				{sections.map((sec, i) => (
					<SectionBlock
						key={sec.id}
						section={sec}
						index={i}
						onRegenerate={onRegenerateSection}
					/>
				))}
			</div>
		</motion.div>
	);
};
