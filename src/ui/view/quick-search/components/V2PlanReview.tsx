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

const MISSION_ROLE_LABELS: Record<string, { label: string; color: string }> = {
	synthesis: { label: 'Synthesis', color: 'pktw-bg-emerald-100 pktw-text-emerald-700' },
	contradictions: { label: 'Contradictions', color: 'pktw-bg-red-100 pktw-text-red-700' },
	trade_off: { label: 'Trade-off', color: 'pktw-bg-amber-100 pktw-text-amber-700' },
	action_plan: { label: 'Action Plan', color: 'pktw-bg-blue-100 pktw-text-blue-700' },
	risk_audit: { label: 'Risk Audit', color: 'pktw-bg-orange-100 pktw-text-orange-700' },
	roadmap: { label: 'Roadmap', color: 'pktw-bg-indigo-100 pktw-text-indigo-700' },
	decomposition: { label: 'Decomposition', color: 'pktw-bg-violet-100 pktw-text-violet-700' },
	blindspots: { label: 'Blindspots', color: 'pktw-bg-pink-100 pktw-text-pink-700' },
	probing_horizon: { label: 'Probing Horizon', color: 'pktw-bg-cyan-100 pktw-text-cyan-700' },
};

const REQUIRED_ROLES = ['synthesis', 'action_plan'];

interface V2PlanReviewProps {
	onApprove: () => void;
}

export const V2PlanReview: React.FC<V2PlanReviewProps> = ({ onApprove }) => {
	const sections = useSearchSessionStore((s) => s.v2PlanSections);
	const overview = useSearchSessionStore((s) => s.v2ProposedOutline);
	const removePlanSection = useSearchSessionStore((s) => s.removePlanSection);
	const reorderPlanSections = useSearchSessionStore((s) => s.reorderPlanSections);
	const userNotes = useSearchSessionStore((s) => s.v2UserNotes);

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

			{/* Framework coverage */}
			<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-mb-4 pktw-px-1">
				{Object.entries(MISSION_ROLE_LABELS).map(([role, { label, color }]) => {
					const covered = sections.some((s) => s.missionRole === role);
					const required = REQUIRED_ROLES.includes(role);
					return (
						<span
							key={role}
							className={`pktw-px-2 pktw-py-0.5 pktw-text-[10px] pktw-font-medium pktw-rounded-full ${
								covered ? color : 'pktw-bg-gray-100 pktw-text-[#9ca3af]'
							} ${required && !covered ? 'pktw-ring-1 pktw-ring-red-300' : ''}`}
						>
							{covered ? '\u2713' : '\u25CB'} {label}
						</span>
					);
				})}
			</div>

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
								{sec.missionRole && MISSION_ROLE_LABELS[sec.missionRole] && (
									<span className={`pktw-px-1.5 pktw-py-0.5 pktw-text-[10px] pktw-font-medium pktw-rounded ${MISSION_ROLE_LABELS[sec.missionRole].color}`}>
										{MISSION_ROLE_LABELS[sec.missionRole].label}
									</span>
								)}
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

			{/* User notes */}
			<div className="pktw-mb-3">
				<input
					type="text"
					value={userNotes}
					onChange={(e) => useSearchSessionStore.getState().setUserNotes(e.target.value)}
					placeholder="Add notes for report generation..."
					className="pktw-w-full pktw-px-3 pktw-py-2 pktw-text-sm pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-[#7c3aed]/50"
				/>
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
