import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useSearchSessionStore } from '../store/searchSessionStore';

const CONTENT_TYPE_LABELS: Record<string, string> = {
	enumeration: 'Enumeration',
	comparison: 'Comparison',
	analysis: 'Analysis',
	recommendation: 'Recommendation',
	timeline: 'Timeline',
};

const VISUAL_TYPE_LABELS: Record<string, string> = {
	table: 'Table',
	quadrantChart: 'Quadrant',
	flowchart: 'Flowchart',
	timeline: 'Timeline',
	mindmap: 'Mindmap',
	none: 'None',
};

interface V2PlanReviewProps {
	onApprove: () => void;
}

export const V2PlanReview: React.FC<V2PlanReviewProps> = ({ onApprove }) => {
	const sections = useSearchSessionStore((s) => s.v2PlanSections);
	const overview = useSearchSessionStore((s) => s.v2ProposedOutline);
	const removePlanSection = useSearchSessionStore((s) => s.removePlanSection);
	const reorderPlanSections = useSearchSessionStore((s) => s.reorderPlanSections);

	const moveSection = useCallback((id: string, direction: -1 | 1) => {
		const ids = sections.map((s) => s.id);
		const idx = ids.indexOf(id);
		if (idx < 0) return;
		const newIdx = idx + direction;
		if (newIdx < 0 || newIdx >= ids.length) return;
		[ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
		reorderPlanSections(ids);
	}, [sections, reorderPlanSections]);

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pktw-px-1 pktw-py-3">
			{/* Overview */}
			{overview && (
				<div className="pktw-bg-[#f9fafb] pktw-rounded-xl pktw-p-4 pktw-border pktw-border-[#e5e7eb] pktw-mb-4">
					<span className="pktw-text-sm pktw-text-[#6b7280]">{overview}</span>
				</div>
			)}

			{/* Section cards */}
			<div className="pktw-space-y-2 pktw-mb-4">
				{sections.map((sec, i) => (
					<motion.div
						key={sec.id}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: i * 0.05 }}
						className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-p-3 pktw-flex pktw-items-start pktw-gap-3 pktw-group"
					>
						{/* Reorder buttons */}
						<div className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-shrink-0 pktw-pt-0.5">
							<div
								onClick={() => moveSection(sec.id, -1)}
								className={`pktw-p-0.5 pktw-rounded pktw-cursor-pointer pktw-transition-colors ${i === 0 ? 'pktw-text-[#e5e7eb]' : 'pktw-text-[#9ca3af] hover:pktw-text-[#6b7280]'}`}
							>
								<ChevronUp className="pktw-w-3.5 pktw-h-3.5" />
							</div>
							<div
								onClick={() => moveSection(sec.id, 1)}
								className={`pktw-p-0.5 pktw-rounded pktw-cursor-pointer pktw-transition-colors ${i === sections.length - 1 ? 'pktw-text-[#e5e7eb]' : 'pktw-text-[#9ca3af] hover:pktw-text-[#6b7280]'}`}
							>
								<ChevronDown className="pktw-w-3.5 pktw-h-3.5" />
							</div>
						</div>

						{/* Content */}
						<div className="pktw-flex-1 pktw-min-w-0">
							<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-1">
								<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">{sec.title}</span>
							</div>
							<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-1.5">
								<span className="pktw-px-1.5 pktw-py-0.5 pktw-text-[10px] pktw-font-medium pktw-bg-purple-100 pktw-text-[#7c3aed] pktw-rounded">
									{CONTENT_TYPE_LABELS[sec.contentType] ?? sec.contentType}
								</span>
								{sec.visualType !== 'none' && (
									<span className="pktw-px-1.5 pktw-py-0.5 pktw-text-[10px] pktw-font-medium pktw-bg-blue-100 pktw-text-blue-700 pktw-rounded">
										{VISUAL_TYPE_LABELS[sec.visualType] ?? sec.visualType}
									</span>
								)}
								<span className="pktw-text-[10px] pktw-text-[#9ca3af]">
									{sec.evidencePaths.length} sources
								</span>
							</div>
							<span className="pktw-text-xs pktw-text-[#6b7280] pktw-leading-relaxed">{sec.brief}</span>
						</div>

						{/* Delete button */}
						<div
							onClick={() => removePlanSection(sec.id)}
							className="pktw-p-1 pktw-rounded pktw-text-[#e5e7eb] group-hover:pktw-text-[#9ca3af] hover:!pktw-text-red-500 pktw-cursor-pointer pktw-transition-colors pktw-shrink-0"
						>
							<Trash2 className="pktw-w-3.5 pktw-h-3.5" />
						</div>
					</motion.div>
				))}
			</div>

			{/* Generate button */}
			<Button
				onClick={onApprove}
				className="pktw-w-full pktw-bg-[#7c3aed] hover:pktw-bg-[#6d28d9] pktw-text-white pktw-font-medium"
			>
				<Sparkles className="pktw-w-4 pktw-h-4 pktw-mr-2" />
				Generate Report ({sections.length} sections)
			</Button>
		</motion.div>
	);
};
