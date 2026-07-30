import React, { useCallback, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, FileText, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useSearchSessionStore } from '../store/searchSessionStore';
import type { V2Section } from '../store/searchSessionStore';
import { MISSION_ROLES, VISUAL_TYPE_LABELS } from '@/core/constant';
import { StreamdownIsolated } from '@/ui/component/mine/StreamdownIsolated';

function moveLabel(role: string): string {
	return MISSION_ROLES.find((item) => item.key === role)?.label ?? role.replace(/_/g, ' ');
}

const SectionCard: React.FC<{
	section: V2Section;
	index: number;
	total: number;
	editable: boolean;
	onMove: (id: string, direction: -1 | 1) => void;
	onRemove: (id: string) => void;
	onUpdate: (id: string, updater: (section: V2Section) => V2Section) => void;
}> = ({ section, index, total, editable, onMove, onRemove, onUpdate }) => (
	<div className="pktw-grid pktw-grid-cols-[32px_minmax(0,1fr)_auto] pktw-gap-2.5 pktw-px-3 pktw-py-3 pktw-border-t pktw-border-pk-border first:pktw-border-t-0 pktw-bg-pk-background">
		<div className="pktw-w-7 pktw-h-7 pktw-rounded-md pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border pktw-flex pktw-items-center pktw-justify-center pktw-text-pk-xs pktw-font-semibold pktw-text-pk-foreground-muted">
			{index + 1}
		</div>
		<div className="pktw-min-w-0">
			<span
				className={`pktw-block pktw-text-sm pktw-font-semibold pktw-text-pk-text-primary pktw-rounded pktw-outline-none ${editable ? 'pktw-px-1.5 pktw-py-0.5 pktw--mx-1.5 pktw-border pktw-border-transparent hover:pktw-border-pk-border focus:pktw-border-pk-accent/40 focus:pktw-bg-pk-surface-raised pktw-cursor-text' : ''}`}
				contentEditable={editable}
				suppressContentEditableWarning
				onBlur={(event) => {
					if (!editable) return;
					const title = event.currentTarget.textContent?.trim() || section.title;
					if (title !== section.title) onUpdate(section.id, (value) => ({ ...value, title }));
				}}
				onKeyDown={(event) => {
					if (event.nativeEvent.isComposing) return;
					if (event.key !== 'Enter') return;
					event.preventDefault();
					event.currentTarget.blur();
				}}
			>
				{section.title}
			</span>
			<span
				className={`pktw-block pktw-mt-1 pktw-text-xs pktw-leading-relaxed pktw-text-pk-foreground-muted pktw-rounded pktw-outline-none ${editable ? 'pktw-px-1.5 pktw-py-0.5 pktw--mx-1.5 pktw-border pktw-border-transparent hover:pktw-border-pk-border focus:pktw-border-pk-accent/40 focus:pktw-bg-pk-surface-raised pktw-cursor-text' : ''}`}
				contentEditable={editable}
				suppressContentEditableWarning
				onBlur={(event) => {
					if (!editable) return;
					const brief = event.currentTarget.textContent?.trim() || section.brief;
					if (brief !== section.brief) onUpdate(section.id, (value) => ({ ...value, brief }));
				}}
			>
				{section.brief || 'Add the question this section must answer.'}
			</span>
			<div className="pktw-flex pktw-items-center pktw-flex-wrap pktw-gap-1.5 pktw-mt-2">
				<span className="pktw-px-1.5 pktw-py-0.5 pktw-rounded-full pktw-bg-pk-accent-tint pktw-text-pk-xs pktw-font-medium pktw-text-pk-accent">
					{moveLabel(section.missionRole)}
				</span>
				{section.visualType && section.visualType !== 'none' && (
					<span className="pktw-px-1.5 pktw-py-0.5 pktw-rounded-full pktw-bg-pk-surface-sunken pktw-text-pk-xs pktw-text-pk-foreground-muted">
						{VISUAL_TYPE_LABELS[section.visualType] ?? section.visualType}
					</span>
				)}
				<span className="pktw-text-pk-xs pktw-text-pk-foreground-muted">
					{section.evidencePaths.length} direct sources
				</span>
			</div>
		</div>
		{editable && (
			<div className="pktw-flex pktw-items-start pktw-gap-0.5">
				<Button
					variant="ghost"
					size="icon"
					geometry="toolbar-icon"
					disabled={index === 0}
					className="pktw-rounded-md"
					title="Move section up"
					onClick={() => onMove(section.id, -1)}
				>
					<ChevronUp className="pktw-w-4 pktw-h-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					geometry="toolbar-icon"
					disabled={index === total - 1}
					className="pktw-rounded-md"
					title="Move section down"
					onClick={() => onMove(section.id, 1)}
				>
					<ChevronDown className="pktw-w-4 pktw-h-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					geometry="toolbar-icon"
					className="pktw-rounded-md hover:pktw-text-pk-error"
					title="Remove section"
					onClick={() => onRemove(section.id)}
				>
					<Trash2 className="pktw-w-4 pktw-h-4" />
				</Button>
			</div>
		)}
	</div>
);

export const V2InlinePlanReview: React.FC<{ onApprove: () => void }> = ({ onApprove }) => {
	const sections = useSearchSessionStore((state) => state.v2PlanSections);
	const overview = useSearchSessionStore((state) => state.v2ProposedOutline);
	const approved = useSearchSessionStore((state) => state.v2PlanApproved);
	const insights = useSearchSessionStore((state) => state.v2UserInsights);
	const removePlanSection = useSearchSessionStore((state) => state.removePlanSection);
	const reorderPlanSections = useSearchSessionStore((state) => state.reorderPlanSections);
	const updatePlanSection = useSearchSessionStore((state) => state.updatePlanSection);
	const addPlanSection = useSearchSessionStore((state) => state.addPlanSection);
	const [direction, setDirection] = useState('');

	const moves = useMemo(
		() => [...new Set(sections.map((section) => section.missionRole).filter(Boolean))],
		[sections],
	);

	const moveSection = useCallback((id: string, change: -1 | 1) => {
		const ids = sections.map((section) => section.id);
		const from = ids.indexOf(id);
		const to = from + change;
		if (from < 0 || to < 0 || to >= ids.length) return;
		[ids[from], ids[to]] = [ids[to], ids[from]];
		reorderPlanSections(ids);
	}, [sections, reorderPlanSections]);

	const addDirection = () => {
		const value = direction.trim();
		if (!value) return;
		useSearchSessionStore.getState().addUserInsight(value);
		setDirection('');
	};

	return (
		<div className="pktw-mt-3 pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-background pktw-overflow-hidden">
			<div className="pktw-flex pktw-items-start pktw-gap-2 pktw-px-3 pktw-py-3 pktw-border-b pktw-border-pk-border">
				<FileText className="pktw-w-4 pktw-h-4 pktw-text-pk-accent pktw-mt-0.5" />
				<div className="pktw-min-w-0 pktw-flex-1">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-flex-wrap">
						<span className="pktw-text-sm pktw-font-semibold pktw-text-pk-text-primary">
							Report plan · {sections.length} evidence-backed sections
						</span>
						{approved && (
							<span className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2 pktw-py-0.5 pktw-rounded-full pktw-bg-pk-success-bg pktw-text-pk-xs pktw-font-medium pktw-text-pk-success-text">
								<Check className="pktw-w-3 pktw-h-3" />
								Approved
							</span>
						)}
					</div>
					<span className="pktw-block pktw-text-xs pktw-text-pk-foreground-muted pktw-mt-1">
						Sections are chosen for this question. Analytical moves guide quality; they are not fixed chapters.
					</span>
				</div>
			</div>

			{overview && (
				<div className="pktw-px-3 pktw-py-3 pktw-border-b pktw-border-pk-border pktw-bg-pk-surface-raised">
					<StreamdownIsolated isAnimating={false} className="pktw-text-sm pktw-text-pk-foreground-muted">
						{overview}
					</StreamdownIsolated>
				</div>
			)}

			{moves.length > 0 && (
				<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-flex-wrap pktw-px-3 pktw-py-2 pktw-border-b pktw-border-pk-border pktw-bg-pk-accent-tint/30">
					<span className="pktw-text-pk-xs pktw-font-medium pktw-text-pk-foreground-muted">Selected analytical moves</span>
					{moves.map((move) => (
						<span key={move} className="pktw-px-1.5 pktw-py-0.5 pktw-rounded-full pktw-border pktw-border-pk-accent/20 pktw-text-pk-xs pktw-text-pk-accent pktw-bg-pk-background">
							{moveLabel(move)}
						</span>
					))}
				</div>
			)}

			<div>
				{sections.map((section, index) => (
					<SectionCard
						key={section.id}
						section={section}
						index={index}
						total={sections.length}
						editable={!approved}
						onMove={moveSection}
						onRemove={removePlanSection}
						onUpdate={updatePlanSection}
					/>
				))}
			</div>

			{!approved && (
				<div className="pktw-px-3 pktw-py-3 pktw-border-t pktw-border-pk-border pktw-bg-pk-surface-raised">
					<Button
						variant="outline"
						size="sm"
						geometry="action"
						className="pktw-text-xs pktw-mb-3"
						onClick={() => addPlanSection('synthesis')}
					>
						<Plus className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
						Add section
					</Button>
					{insights.length > 0 && (
						<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-mb-2">
							{insights.map((insight, index) => (
								<span key={`${insight}-${index}`} className="pktw-px-2 pktw-py-1 pktw-rounded-full pktw-bg-pk-accent-tint pktw-text-pk-xs pktw-text-pk-accent">
									{insight}
								</span>
							))}
						</div>
					)}
					<div className="pktw-min-w-0">
						<label
							htmlFor="peak-ai-report-direction"
							className="pktw-block pktw-text-xs pktw-font-medium pktw-text-pk-text-primary pktw-mb-1"
						>
							Additional report direction
						</label>
						<div
							data-report-direction-field
							className="pktw-relative"
						>
							<textarea
								id="peak-ai-report-direction"
								value={direction}
								onChange={(event) => setDirection(event.target.value)}
								onKeyDown={(event) => {
									if (event.nativeEvent.isComposing) return;
									if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return;
									event.preventDefault();
									addDirection();
								}}
								placeholder="For example: separate proven findings from open questions."
								className="pktw-w-full pktw-min-h-[76px] pktw-resize-none pktw-pl-3 pktw-pr-32 pktw-pt-2 pktw-pb-12 pktw-text-xs pktw-border pktw-border-pk-border pktw-rounded-lg pktw-bg-pk-background pktw-outline-none focus:pktw-border-pk-accent"
							/>
							<Button
								variant="outline"
								size="sm"
								geometry="action"
								disabled={!direction.trim()}
								onClick={addDirection}
								className="pktw-absolute pktw-bottom-2 pktw-right-2 pktw-rounded-md pktw-shadow-sm"
							>
								Apply to plan
							</Button>
						</div>
					</div>
					<div className="pktw-flex pktw-justify-center pktw-mt-4 pktw-pb-1">
						<Button
							onClick={onApprove}
							geometry="cta"
							disabled={sections.length === 0}
							className="!pktw-rounded-full"
						>
							<Sparkles className="pktw-w-4 pktw-h-4 pktw-mr-2" />
							Generate report
						</Button>
					</div>
				</div>
			)}
		</div>
	);
};
