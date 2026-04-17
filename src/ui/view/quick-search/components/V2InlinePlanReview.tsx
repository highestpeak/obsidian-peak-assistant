import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, ChevronUp, ChevronDown, Trash2, Sparkles, FileText, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useSearchSessionStore } from '../store/searchSessionStore';
import type { V2Section } from '../store/searchSessionStore';

const VISUAL_TYPE_LABELS: Record<string, string> = {
	table: 'Table',
	quadrantChart: 'Quadrant',
	flowchart: 'Flowchart',
	timeline: 'Timeline',
	mindmap: 'Mindmap',
	none: '',
};

const MISSION_ROLES: Array<{ key: string; label: string; icon: string; color: string; bgColor: string; required: boolean }> = [
	{ key: 'synthesis', label: 'Synthesis', icon: '🔬', color: 'pktw-text-emerald-700', bgColor: 'pktw-bg-emerald-50 pktw-border-emerald-200', required: true },
	{ key: 'contradictions', label: 'Contradictions', icon: '⚡', color: 'pktw-text-red-700', bgColor: 'pktw-bg-red-50 pktw-border-red-200', required: false },
	{ key: 'trade_off', label: 'Trade-off', icon: '⚖️', color: 'pktw-text-amber-700', bgColor: 'pktw-bg-amber-50 pktw-border-amber-200', required: false },
	{ key: 'action_plan', label: 'Action Plan', icon: '🎯', color: 'pktw-text-blue-700', bgColor: 'pktw-bg-blue-50 pktw-border-blue-200', required: true },
	{ key: 'risk_audit', label: 'Risk Audit', icon: '🛡️', color: 'pktw-text-orange-700', bgColor: 'pktw-bg-orange-50 pktw-border-orange-200', required: false },
	{ key: 'roadmap', label: 'Roadmap', icon: '🗺️', color: 'pktw-text-indigo-700', bgColor: 'pktw-bg-indigo-50 pktw-border-indigo-200', required: false },
	{ key: 'decomposition', label: 'Decomposition', icon: '🧩', color: 'pktw-text-violet-700', bgColor: 'pktw-bg-violet-50 pktw-border-violet-200', required: false },
	{ key: 'blindspots', label: 'Blindspots', icon: '👁️', color: 'pktw-text-pink-700', bgColor: 'pktw-bg-pink-50 pktw-border-pink-200', required: false },
	{ key: 'probing_horizon', label: 'Probing Horizon', icon: '🔭', color: 'pktw-text-cyan-700', bgColor: 'pktw-bg-cyan-50 pktw-border-cyan-200', required: false },
];

/** A single section card nested under its role */
const SectionCard: React.FC<{
	sec: V2Section;
	index: number;
	total: number;
	onMove: (id: string, dir: -1 | 1) => void;
	onRemove: (id: string) => void;
	onUpdate: (id: string, updater: (s: V2Section) => V2Section) => void;
}> = ({ sec, index, total, onMove, onRemove, onUpdate }) => (
	<div className="pktw-flex pktw-items-start pktw-gap-2 pktw-py-2 pktw-px-3 pktw-bg-white pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-group">
		{/* Reorder */}
		<div className="pktw-flex pktw-flex-col pktw-gap-0 pktw-shrink-0 pktw-pt-0.5">
			<div
				onClick={() => onMove(sec.id, -1)}
				className={`pktw-p-0.5 pktw-rounded pktw-cursor-pointer pktw-transition-colors ${index === 0 ? 'pktw-text-[#e5e7eb]' : 'pktw-text-[#9ca3af] hover:pktw-text-[#6b7280]'}`}
			>
				<ChevronUp className="pktw-w-3 pktw-h-3" />
			</div>
			<div
				onClick={() => onMove(sec.id, 1)}
				className={`pktw-p-0.5 pktw-rounded pktw-cursor-pointer pktw-transition-colors ${index === total - 1 ? 'pktw-text-[#e5e7eb]' : 'pktw-text-[#9ca3af] hover:pktw-text-[#6b7280]'}`}
			>
				<ChevronDown className="pktw-w-3 pktw-h-3" />
			</div>
		</div>
		{/* Content */}
		<div className="pktw-flex-1 pktw-min-w-0">
			<span
				className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338] pktw-block pktw-mb-0.5 pktw-outline-none pktw-rounded pktw-px-0.5 pktw--mx-0.5 focus:pktw-ring-1 focus:pktw-ring-[#7c3aed]/40 focus:pktw-bg-white"
				contentEditable
				suppressContentEditableWarning
				onBlur={(e) => {
					const text = (e.target as HTMLSpanElement).textContent?.trim() || sec.title;
					if (text !== sec.title) onUpdate(sec.id, (s) => ({ ...s, title: text }));
				}}
				onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }}
			>
				{sec.title}
			</span>
			<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-1">
				{sec.visualType && sec.visualType !== 'none' && (
					<span className="pktw-px-1.5 pktw-py-0.5 pktw-text-[9px] pktw-font-medium pktw-bg-gray-100 pktw-text-[#6b7280] pktw-rounded">
						{VISUAL_TYPE_LABELS[sec.visualType] ?? sec.visualType}
					</span>
				)}
				<span className="pktw-text-[9px] pktw-text-[#9ca3af]">{sec.evidencePaths.length} sources</span>
			</div>
			<span
				className="pktw-text-xs pktw-text-[#6b7280] pktw-leading-relaxed pktw-outline-none pktw-rounded pktw-px-0.5 pktw--mx-0.5 focus:pktw-ring-1 focus:pktw-ring-[#7c3aed]/40 focus:pktw-bg-white"
				contentEditable
				suppressContentEditableWarning
				onBlur={(e) => {
					const text = (e.target as HTMLSpanElement).textContent?.trim() || sec.brief;
					if (text !== sec.brief) onUpdate(sec.id, (s) => ({ ...s, brief: text }));
				}}
				onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }}
			>
				{sec.brief}
			</span>
		</div>
		{/* Delete */}
		<div
			onClick={() => onRemove(sec.id)}
			className="pktw-p-1 pktw-rounded pktw-text-[#e5e7eb] group-hover:pktw-text-[#9ca3af] hover:!pktw-text-red-500 pktw-cursor-pointer pktw-transition-colors pktw-shrink-0"
		>
			<Trash2 className="pktw-w-3 pktw-h-3" />
		</div>
	</div>
);

interface V2InlinePlanReviewProps {
	onApprove: () => void;
}

export const V2InlinePlanReview: React.FC<V2InlinePlanReviewProps> = ({ onApprove }) => {
	const sections = useSearchSessionStore((s) => s.v2PlanSections);
	const overview = useSearchSessionStore((s) => s.v2ProposedOutline);
	const planApproved = useSearchSessionStore((s) => s.v2PlanApproved);
	const removePlanSection = useSearchSessionStore((s) => s.removePlanSection);
	const reorderPlanSections = useSearchSessionStore((s) => s.reorderPlanSections);
	const updatePlanSection = useSearchSessionStore((s) => s.updatePlanSection);
	const insights = useSearchSessionStore((s) => s.v2UserInsights);
	const [insightInput, setInsightInput] = useState('');
	const [expanded, setExpanded] = useState(!planApproved);

	const moveSection = useCallback((id: string, direction: -1 | 1) => {
		const ids = sections.map((s) => s.id);
		const idx = ids.indexOf(id);
		if (idx < 0) return;
		const newIdx = idx + direction;
		if (newIdx < 0 || newIdx >= ids.length) return;
		[ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
		reorderPlanSections(ids);
	}, [sections, reorderPlanSections]);

	// Group sections by mission role, preserving order
	const roleGroups = useMemo(() => {
		const grouped = new Map<string, V2Section[]>();
		for (const sec of sections) {
			const role = sec.missionRole || 'synthesis';
			const list = grouped.get(role) ?? [];
			list.push(sec);
			grouped.set(role, list);
		}
		return grouped;
	}, [sections]);

	// Find missing required roles
	const coveredRoles = useMemo(() => new Set(sections.map((s) => s.missionRole)), [sections]);
	const missingRequired = MISSION_ROLES.filter((r) => r.required && !coveredRoles.has(r.key));

	return (
		<div className="pktw-mt-2 pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-bg-[#f9fafb]">
			{/* Collapsible Header */}
			<div
				onClick={() => setExpanded((prev) => !prev)}
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-cursor-pointer pktw-select-none hover:pktw-bg-[#f3f4f6] pktw-rounded-t-lg pktw-transition-colors"
			>
				<motion.div
					animate={{ rotate: expanded ? 90 : 0 }}
					transition={{ duration: 0.15 }}
				>
					<ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />
				</motion.div>
				<FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-xs pktw-font-semibold pktw-text-[#2e3338]">Report Outline</span>
				<span className="pktw-text-[10px] pktw-text-[#9ca3af]">{sections.length} sections</span>
				<div className="pktw-flex-1" />
				{planApproved && (
					<span className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2 pktw-py-0.5 pktw-text-[10px] pktw-font-medium pktw-text-emerald-700 pktw-bg-emerald-50 pktw-border pktw-border-emerald-200 pktw-rounded-full">
						<Check className="pktw-w-3 pktw-h-3" />
						Approved
					</span>
				)}
			</div>

			{/* Collapsible Body */}
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: 'easeInOut' }}
						className="pktw-overflow-hidden"
					>
						<div className="pktw-px-3 pktw-pb-3">
							{/* Overview */}
							{overview && (
								<div className="pktw-bg-white pktw-rounded-lg pktw-p-3 pktw-border pktw-border-[#e5e7eb] pktw-mb-3">
									<span className="pktw-text-sm pktw-text-[#6b7280] pktw-leading-relaxed">{overview}</span>
								</div>
							)}

							{/* Executive Summary marker */}
							<div className="pktw-mb-2 pktw-ml-1 pktw-pl-3 pktw-border-l-2 pktw-border-[#7c3aed]/30">
								<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5">
									<Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed]" />
									<span className="pktw-text-xs pktw-font-semibold pktw-text-[#7c3aed]">Executive Summary</span>
									<span className="pktw-text-[9px] pktw-text-[#9ca3af] pktw-italic">auto-generated</span>
								</div>
							</div>

							{/* Role groups with nested sections */}
							{MISSION_ROLES.map((role) => {
								const roleSections = roleGroups.get(role.key) ?? [];
								if (roleSections.length === 0) return null;

								return (
									<motion.div
										key={role.key}
										initial={{ opacity: 0, y: 6 }}
										animate={{ opacity: 1, y: 0 }}
										className="pktw-mb-2 pktw-ml-1"
									>
										{/* Role header */}
										<div className={`pktw-pl-3 pktw-border-l-2 ${role.bgColor.split(' ')[1] ?? 'pktw-border-gray-200'}`}>
											<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-py-1">
												<span className="pktw-text-sm">{role.icon}</span>
												<span className={`pktw-text-xs pktw-font-semibold ${role.color}`}>{role.label}</span>
												{role.required && (
													<span className="pktw-text-[8px] pktw-text-[#9ca3af] pktw-uppercase">required</span>
												)}
											</div>
											{/* Nested section cards */}
											<div className="pktw-space-y-1.5 pktw-pb-2">
												{roleSections.map((sec) => (
													<SectionCard
														key={sec.id}
														sec={sec}
														index={sections.indexOf(sec)}
														total={sections.length}
														onMove={moveSection}
														onRemove={removePlanSection}
														onUpdate={updatePlanSection}
													/>
												))}
											</div>
										</div>
									</motion.div>
								);
							})}

							{/* Missing roles warning */}
							{missingRequired.length > 0 && (
								<div className="pktw-ml-1 pktw-pl-3 pktw-border-l-2 pktw-border-red-200 pktw-py-2">
									<div className="pktw-flex pktw-items-center pktw-gap-1.5">
										<AlertTriangle className="pktw-w-3.5 pktw-h-3.5 pktw-text-red-400" />
										<span className="pktw-text-[10px] pktw-text-red-500">
											Missing: {missingRequired.map((r) => r.label).join(', ')}
										</span>
									</div>
								</div>
							)}

							{/* Uncovered optional roles hint */}
							{MISSION_ROLES.filter((r) => !r.required && !coveredRoles.has(r.key)).length > 0 && (
								<div className="pktw-ml-1 pktw-pl-3 pktw-border-l-2 pktw-border-gray-100 pktw-py-1.5">
									<span className="pktw-text-[9px] pktw-text-[#9ca3af]">
										Not covered: {MISSION_ROLES.filter((r) => !r.required && !coveredRoles.has(r.key)).map((r) => `${r.icon} ${r.label}`).join('  ')}
									</span>
								</div>
							)}

							{/* Divider before footer area */}
							<div className="pktw-border-t pktw-border-[#e5e7eb] pktw-mt-2 pktw-pt-3">
								{/* Insight chips */}
								{insights.length > 0 && (
									<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-mb-2">
										{insights.map((insight, i) => (
											<span
												key={i}
												className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2.5 pktw-py-1 pktw-text-xs pktw-bg-[#f5f3ff] pktw-text-[#7c3aed] pktw-rounded-full pktw-border pktw-border-[#7c3aed]/20"
											>
												{insight}
												<span
													onClick={() => useSearchSessionStore.getState().removeUserInsight(i)}
													className="pktw-cursor-pointer pktw-text-[#7c3aed]/50 hover:pktw-text-[#7c3aed] pktw-ml-0.5"
												>
													&times;
												</span>
											</span>
										))}
									</div>
								)}
								{/* Insight input */}
								{!planApproved && (
									<input
										type="text"
										value={insightInput}
										onChange={(e) => setInsightInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter' && insightInput.trim()) {
												useSearchSessionStore.getState().addUserInsight(insightInput.trim());
												setInsightInput('');
											}
										}}
										placeholder="Add insight (Enter to add)..."
										className="pktw-w-full pktw-px-3 pktw-py-2 pktw-text-sm pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-[#7c3aed]/50 pktw-mb-2"
									/>
								)}
								{/* Generate button — only before approval */}
								{!planApproved && (
									<Button
										onClick={onApprove}
										className="pktw-w-full pktw-bg-[#7c3aed] hover:pktw-bg-[#6d28d9] pktw-text-white pktw-font-medium"
									>
										<Sparkles className="pktw-w-4 pktw-h-4 pktw-mr-2" />
										Generate Report ({sections.length} sections)
									</Button>
								)}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Collapsed compact section list (when not expanded and not approved) */}
			{!expanded && !planApproved && sections.length > 0 && (
				<div className="pktw-px-3 pktw-pb-2">
					<div className="pktw-flex pktw-flex-wrap pktw-gap-1">
						{sections.map((sec) => {
							const role = MISSION_ROLES.find((r) => r.key === sec.missionRole);
							return (
								<span
									key={sec.id}
									className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2 pktw-py-0.5 pktw-text-[10px] pktw-text-[#6b7280] pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded"
								>
									{role && <span className="pktw-text-xs">{role.icon}</span>}
									{sec.title}
								</span>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
};
