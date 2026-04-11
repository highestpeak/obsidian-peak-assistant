import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Maximize2 } from 'lucide-react';
import type { PlanStep as PlanStepType } from '../../types/search-steps';
import type { DiscoveryGroup } from '@/service/agents/vault/types';
import { HitlInlineInput } from '../ai-analysis-sections/HitlInlineInput';
import { MermaidMindFlowSection } from '../ai-analysis-sections/MermaidMindFlowSection';
import { StreamdownIsolated } from '@/ui/component/mine';
import { wrapMermaidCode } from '@/core/utils/mermaid-utils';
import { useSearchSessionStore } from '../../store/searchSessionStore';
import { buildPlanMermaid } from './plan/buildPlanMermaid';

// ---------------------------------------------------------------------------
// Discovery Group Row — bar chart + click to expand representative notes
// ---------------------------------------------------------------------------

const BAR_COLOR: Record<'high' | 'medium' | 'low', string> = {
	high: '#10b981',
	medium: '#f59e0b',
	low: '#ef4444',
};

const CoverageBadge: React.FC<{ level: 'high' | 'medium' | 'low' }> = ({ level }) => {
	const styles = {
		high: 'pktw-text-green-600 pktw-bg-green-50',
		medium: 'pktw-text-amber-600 pktw-bg-amber-50',
		low: 'pktw-text-red-500 pktw-bg-red-50',
	};
	return <span className={`pktw-text-[9px] pktw-px-1 pktw-py-px pktw-rounded ${styles[level]}`}>{level}</span>;
};

const DiscoveryGroupRow: React.FC<{
	group: DiscoveryGroup;
	maxNotes: number;
	onOpenWikilink?: (path: string) => void | Promise<void>;
}> = ({ group, maxNotes, onOpenWikilink }) => {
	const [expanded, setExpanded] = useState(false);
	const keyNotes: string[] = (group as any).keyNotes ?? [];
	const hasNotes = keyNotes.length > 0;
	const barPct = Math.max(6, Math.round((group.noteCount / maxNotes) * 100));

	return (
		<div className="pktw-py-1">
			{/* Row 1: chevron + topic (full text, no truncation) + count + badge */}
			<div
				className={`pktw-flex pktw-items-start pktw-gap-1.5 pktw-px-1 pktw-rounded ${hasNotes ? 'pktw-cursor-pointer hover:pktw-bg-[#f9fafb] pktw-select-none' : ''}`}
				onClick={hasNotes ? () => setExpanded((v) => !v) : undefined}
			>
				<span className="pktw-mt-0.5 pktw-w-3 pktw-shrink-0">
					{hasNotes
						? expanded
							? <ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-[#d1d5db]" />
							: <ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#d1d5db]" />
						: null}
				</span>
				<span className="pktw-text-[10px] pktw-text-[#374151] pktw-font-medium pktw-flex-1 pktw-leading-snug">
					{group.topic}
				</span>
				<span className="pktw-text-[9px] pktw-text-[#9ca3af] pktw-shrink-0 pktw-tabular-nums">
					{group.noteCount}
				</span>
				<CoverageBadge level={group.coverage} />
			</div>
			{/* Row 2: coverage bar on its own line, never overlaps label */}
			<div className="pktw-pl-5 pktw-pr-2 pktw-mt-0.5 pktw-mb-0.5">
				<div className="pktw-w-full pktw-bg-[#f3f4f6] pktw-rounded-full pktw-h-1">
					<div
						className="pktw-h-1 pktw-rounded-full pktw-transition-all"
						style={{ width: `${barPct}%`, backgroundColor: BAR_COLOR[group.coverage] }}
					/>
				</div>
			</div>
			{/* Expanded: all keyNotes, clickable if onOpenWikilink provided */}
			{/* Expanded: all keyNotes in 2-col grid when many, clickable */}
			{expanded && hasNotes ? (
				<div className={keyNotes.length > 4 ? "pktw-pl-5 pktw-pt-0.5 pktw-pb-1 pktw-grid pktw-grid-cols-2 pktw-gap-x-3 pktw-gap-y-px" : "pktw-pl-5 pktw-pt-0.5 pktw-pb-1 pktw-flex pktw-flex-col pktw-gap-px"}>
					{keyNotes.map((rawPath, i) => {
						// Some paths have ": reason" suffix from recon evidence — split it off
						const mdIdx = rawPath.indexOf('.md:');
						const actualPath = mdIdx >= 0 ? rawPath.slice(0, mdIdx + 3) : rawPath;
						const reason = mdIdx >= 0 ? rawPath.slice(mdIdx + 4).trim() : '';
						const name = actualPath.split('/').pop()?.replace(/\.md$/, '') ?? actualPath;
						const tooltip = reason ? `${name}\n\n${reason}` : actualPath;
						return (
							<span
								key={i}
								title={tooltip}
								className={`pktw-text-[10px] pktw-leading-snug pktw-truncate ${onOpenWikilink ? 'pktw-text-[#7c3aed] pktw-cursor-pointer hover:pktw-underline' : 'pktw-text-[#6b7280]'}`}
								onClick={onOpenWikilink ? () => onOpenWikilink(actualPath) : undefined}
							>
								{name}
							</span>
						);
					})}
				</div>
			) : null}
		</div>
	);
};

// ---------------------------------------------------------------------------
// Mermaid Graph — dimensions → evidence groups
// ---------------------------------------------------------------------------

const PlanMermaidGraph: React.FC = () => {
	const [expanded, setExpanded] = useState(false); // Default collapsed — matrix already shows coverage
	const [fullscreen, setFullscreen] = useState(false);
	const steps = useSearchSessionStore((s) => s.steps);

	const mermaidCode = useMemo(() => {
		const classifyStep = steps.find((s) => s.type === 'classify');
		const planStep = steps.find((s) => s.type === 'plan');
		if (!planStep || planStep.type !== 'plan' || !planStep.snapshot) return '';
		if (!classifyStep || classifyStep.type !== 'classify') return '';
		const { discoveryGroups } = planStep.snapshot;
		const { dimensions } = classifyStep;
		if (!dimensions.length || !discoveryGroups?.length) return '';
		return buildPlanMermaid(dimensions, discoveryGroups);
	}, [steps]);

	if (!mermaidCode) return null;

	const mermaidContent = (
		<MermaidMindFlowSection
			mindflowMermaid={mermaidCode}
			maxHeightClassName="pktw-max-h-[300px]"
		/>
	);

	if (fullscreen) {
		return createPortal(
			<div
				style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, background: 'white', display: 'flex', flexDirection: 'column', padding: '16px', boxSizing: 'border-box' }}
				onClick={() => setFullscreen(false)}
			>
				<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-3 pktw-shrink-0">
					<span className="pktw-text-sm pktw-font-medium pktw-text-[#374151]">Query dimensions → Evidence found</span>
					<span className="pktw-text-xs pktw-text-[#9ca3af] pktw-cursor-pointer" onClick={() => setFullscreen(false)}>Click to close</span>
				</div>
				<div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#f9fafb', borderRadius: '8px', padding: '16px' }} onClick={(e) => e.stopPropagation()}>
					<StreamdownIsolated
						className="pktw-w-full pktw-min-w-0 pktw-text-left pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none pktw-select-text"
						isAnimating={false}
					>
						{wrapMermaidCode(mermaidCode)}
					</StreamdownIsolated>
				</div>
			</div>,
			document.body
		);
	}

	return (
		<div className="pktw-mb-1">
			<div className="pktw-flex pktw-items-center pktw-gap-1">
				<div
					className="pktw-flex pktw-items-center pktw-gap-1 pktw-cursor-pointer pktw-select-none pktw-flex-1"
					onClick={() => setExpanded((v) => !v)}
				>
					{expanded
						? <ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af]" />
						: <ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af]" />
					}
					<span className="pktw-text-[10px] pktw-text-[#9ca3af]">Research flow map</span>
				</div>
				{expanded && (
					<Maximize2
						className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af] pktw-cursor-pointer hover:pktw-text-[#7c3aed]"
						onClick={() => setFullscreen(true)}
					/>
				)}
			</div>
			{expanded && <div className="pktw-mt-1">{mermaidContent}</div>}
		</div>
	);
};

// ---------------------------------------------------------------------------
// Main PlanStep
// ---------------------------------------------------------------------------

export const PlanStep: React.FC<{
	step: PlanStepType;
	onOpenWikilink?: (path: string) => void | Promise<void>;
}> = ({ step, onOpenWikilink }) => {
	// Accumulate discovery groups and evidence from completed plan steps in previous rounds
	const prevPlanSteps = useSearchSessionStore((s) =>
		s.steps.filter((ps) => ps.type === 'plan' && ps.id !== step.id && ps.status === 'completed')
	) as PlanStepType[];

	if (!step.snapshot && !step.hitlPauseId) {
		return <span className="pktw-text-xs pktw-text-[#9ca3af]">Preparing research plan…</span>;
	}

	const { proposedOutline, suggestedSections, confidence, evidence, discoveryGroups, coverageGaps } = step.snapshot ?? {};

	// Merge discovery groups across all rounds (current + previous)
	// Deduplicate by topic name, taking max noteCount and union of keyNotes
	const mergedGroups = (() => {
		const allGroupLists = [
			...(discoveryGroups ? [discoveryGroups] : []),
			...prevPlanSteps.map((p) => p.snapshot?.discoveryGroups ?? []),
		];
		const map = new Map<string, DiscoveryGroup & { _keyNotes: string[] }>();
		for (const list of allGroupLists) {
			for (const g of list) {
				const existing = map.get(g.topic);
				const gKeys: string[] = (g as any).keyNotes ?? [];
				if (!existing) {
					map.set(g.topic, { ...g, _keyNotes: [...gKeys] });
				} else {
					existing.noteCount = Math.max(existing.noteCount, g.noteCount);
					for (const n of gKeys) {
						if (!existing._keyNotes.includes(n)) existing._keyNotes.push(n);
					}
					if (g.coverage === 'high') existing.coverage = 'high';
					else if (g.coverage === 'medium' && existing.coverage === 'low') existing.coverage = 'medium';
				}
			}
		}
		return Array.from(map.values()).map((g) => ({ ...g, keyNotes: g._keyNotes }));
	})();

	// Total evidence paths across all rounds
	const totalSourcePaths = new Set([
		...(evidence?.map((e) => e.path) ?? []),
		...prevPlanSteps.flatMap((p) => p.snapshot?.evidence?.map((e) => e.path) ?? []),
	]);
	const totalSources = totalSourcePaths.size || (evidence?.length ?? 0);
	const isMultiRound = prevPlanSteps.length > 0;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{/* Proposed outline */}
			{proposedOutline ? (
				<span className="pktw-text-xs pktw-text-[#6b7280] pktw-leading-relaxed pktw-italic">
					{proposedOutline}
					{step.status === 'running' ? <span className="pktw-animate-pulse pktw-text-[#7c3aed]">▎</span> : null}
				</span>
			) : null}

			{/* Discovery groups — topic label + bar on separate line + expandable notes */}
			{mergedGroups.length > 0 ? (
				<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
					<span className="pktw-text-[10px] pktw-text-[#9ca3af]">
						{totalSources} sources · {mergedGroups.length} topic areas{isMultiRound ? ' (cumulative)' : ''}
					</span>
					{(() => {
						const maxNotes = Math.max(...mergedGroups.map((g) => g.noteCount), 1);
						return (
							<div className="pktw-flex pktw-flex-col pktw-divide-y pktw-divide-[#f3f4f6]">
								{mergedGroups.map((group, i) => (
									<DiscoveryGroupRow key={i} group={group as DiscoveryGroup} maxNotes={maxNotes} onOpenWikilink={onOpenWikilink} />
								))}
							</div>
						);
					})()}
				</div>
			) : suggestedSections && suggestedSections.length > 0 ? (
				<div className="pktw-flex pktw-flex-wrap pktw-gap-1">
					{suggestedSections.map((section, i) => (
						<span key={i} className="pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-[#f3f4f6] pktw-text-[10px] pktw-text-[#6b7280]">
							{section}
						</span>
					))}
				</div>
			) : null}

			{/* Coverage gaps */}
			{coverageGaps && coverageGaps.length > 0 ? (
				<span className="pktw-text-[10px] pktw-text-amber-600">
					⚠ Thin coverage: {coverageGaps.join(', ')}
				</span>
			) : null}

			{/* Research flow mermaid — collapsed by default, expand for detail */}
			<PlanMermaidGraph />

			{/* Confidence + decision */}
			<div className="pktw-flex pktw-items-center pktw-gap-3">
				{confidence ? (
					<span className="pktw-text-[10px] pktw-text-[#9ca3af]">
						Confidence: <span className={confidence === 'high' ? 'pktw-text-green-600' : confidence === 'medium' ? 'pktw-text-amber-600' : 'pktw-text-red-500'}>{confidence}</span>
					</span>
				) : null}
				{step.userFeedback ? (
					<span className="pktw-text-[10px] pktw-text-[#9ca3af]">
						Decision: <span className="pktw-text-[#374151] pktw-font-medium">{step.userFeedback.type}</span>
					</span>
				) : null}
			</div>

			{/* HITL */}
			{step.hitlPauseId && step.snapshot ? (
				<HitlInlineInput
					pauseId={step.hitlPauseId}
					phase={step.hitlPhase ?? 'present-plan'}
					snapshot={step.snapshot}
				/>
			) : null}
		</div>
	);
};
