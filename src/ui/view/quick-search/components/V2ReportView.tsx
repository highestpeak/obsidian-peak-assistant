import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Copy, Check, Sparkles, Loader2, CheckCircle, Clock } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import type { V2Section } from '../store/searchSessionStore';
import { StreamdownIsolated } from '@/ui/component/mine/StreamdownIsolated';
import { V2PlanReview } from './V2PlanReview';

interface V2ReportViewProps {
	onClose?: () => void;
	onApprove?: () => void;
	onRegenerateSection?: (id: string, prompt?: string) => void;
}

/** Single section block card — matches V1's DashboardBlocksSection visual */
const SectionBlock: React.FC<{
	section: V2Section;
	index: number;
	onRegenerate?: (id: string, prompt?: string) => void;
}> = ({ section, index, onRegenerate }) => {
	const [showPrompt, setShowPrompt] = useState(false);
	const [prompt, setPrompt] = useState('');
	const [copied, setCopied] = useState(false);

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

	return (
		<motion.div
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
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#374151] pktw-flex-1 pktw-line-clamp-1" title={section.title}>
					{section.title}
				</span>
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
			{content && (
				<StreamdownIsolated isAnimating={section.status === 'generating'} className="pktw-select-text pktw-break-words">
					{content}
				</StreamdownIsolated>
			)}

			{/* Error */}
			{section.status === 'error' && section.error && (
				<div className="pktw-text-xs pktw-text-red-500 pktw-mt-2">{section.error}</div>
			)}
		</motion.div>
	);
};

export const V2ReportView: React.FC<V2ReportViewProps> = ({ onClose, onApprove, onRegenerateSection }) => {
	const sections = useSearchSessionStore((s) => s.v2PlanSections);
	const planApproved = useSearchSessionStore((s) => s.v2PlanApproved);
	const summary = useSearchSessionStore((s) => s.v2Summary);
	const summaryStreaming = useSearchSessionStore((s) => s.v2SummaryStreaming);

	const progress = useMemo(() => {
		const doneCount = sections.filter((s) => s.status === 'done').length;
		const total = sections.length + 1; // +1 for executive summary
		const summaryDone = !summaryStreaming && !!summary;
		const completed = doneCount + (summaryDone ? 1 : 0);
		return { completed, total, pct: Math.round((completed / total) * 100) };
	}, [sections, summary, summaryStreaming]);

	const isGenerating = sections.some((s) => s.status === 'generating') || summaryStreaming;

	// Plan review mode — show when sections exist but user hasn't approved yet
	if (sections.length > 0 && !planApproved) {
		return <V2PlanReview onApprove={onApprove ?? (() => {})} />;
	}

	// No sections yet — fallback
	if (sections.length === 0 && !summary) return null;

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pktw-px-1 pktw-py-2">
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

			{/* Executive Summary */}
			{(summary || summaryStreaming) && (
				<div className="pktw-bg-[#f9fafb] pktw-rounded-xl pktw-p-5 pktw-border pktw-border-[#e5e7eb] pktw-mb-4">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
						<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
						<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Executive Summary</span>
						{summaryStreaming && <Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed] pktw-animate-spin" />}
					</div>
					<StreamdownIsolated isAnimating={summaryStreaming} className="pktw-select-text pktw-break-words">
						{summary}
					</StreamdownIsolated>
				</div>
			)}

			{/* Section blocks */}
			<div className="pktw-space-y-4">
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
