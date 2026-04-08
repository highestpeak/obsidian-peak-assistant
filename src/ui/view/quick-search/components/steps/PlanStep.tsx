import React from 'react';
import type { PlanStep as PlanStepType } from '../../types/search-steps';
import { HitlInlineInput } from '../ai-analysis-sections/HitlInlineInput';

export const PlanStep: React.FC<{ step: PlanStepType }> = ({ step }) => {
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

	// Show plan snapshot content when available (completed or running)
	if (step.snapshot) {
		const { proposedOutline, suggestedSections, confidence } = step.snapshot;
		return (
			<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
				{proposedOutline ? (
					<span className="pktw-text-xs pktw-text-[#374151]">{proposedOutline}</span>
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
		);
	}

	return (
		<span className="pktw-text-xs pktw-text-[#6b7280]">Preparing report plan…</span>
	);
};
