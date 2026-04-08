import React, { useState } from 'react';
import type { PlanStep as PlanStepType } from '../../types/search-steps';
import { HitlInlineInput } from '../ai-analysis-sections/HitlInlineInput';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const PlanStep: React.FC<{ step: PlanStepType }> = ({ step }) => {
	const [showEvidence, setShowEvidence] = useState(false);

	// HITL pause: show inline input for user review
	if (step.hitlPauseId && step.snapshot && step.status === 'running') {
		return (
			<HitlInlineInput
				pauseId={step.hitlPauseId}
				phase={step.hitlPhase ?? 'present-plan'}
				snapshot={step.snapshot}
			/>
		);
	}

	// Show plan snapshot content when available
	if (step.snapshot) {
		const { proposedOutline, suggestedSections, confidence, evidence } = step.snapshot;
		return (
			<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
				{proposedOutline ? (
					<span className="pktw-text-xs pktw-text-[#374151] pktw-leading-relaxed">{proposedOutline}</span>
				) : null}
				{suggestedSections && suggestedSections.length > 0 ? (
					<div className="pktw-flex pktw-flex-wrap pktw-gap-1">
						{suggestedSections.map((section, i) => (
							<span key={i} className="pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-[#f3f4f6] pktw-text-[10px] pktw-text-[#6b7280]">
								{section}
							</span>
						))}
					</div>
				) : null}
				{/* Evidence paths — collapsible */}
				{evidence && evidence.length > 0 ? (
					<div className="pktw-mt-1">
						<div
							className="pktw-flex pktw-items-center pktw-gap-1 pktw-cursor-pointer pktw-select-none"
							onClick={() => setShowEvidence(!showEvidence)}
						>
							{showEvidence
								? <ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af]" />
								: <ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af]" />
							}
							<span className="pktw-text-[10px] pktw-text-[#9ca3af]">{evidence.length} sources collected</span>
						</div>
						{showEvidence ? (
							<div className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-pl-4 pktw-mt-1 pktw-max-h-[200px] pktw-overflow-y-auto">
								{evidence.map((e, i) => (
									<div key={i} className="pktw-flex pktw-items-start pktw-gap-1.5">
										<span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-shrink-0 pktw-font-mono pktw-mt-px">📄</span>
										<span className="pktw-text-[11px] pktw-text-[#374151] pktw-font-mono pktw-truncate" title={e.path}>
											{e.path}
										</span>
									</div>
								))}
							</div>
						) : null}
					</div>
				) : null}
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
			</div>
		);
	}

	return (
		<span className="pktw-text-xs pktw-text-[#9ca3af]">Preparing report plan…</span>
	);
};
