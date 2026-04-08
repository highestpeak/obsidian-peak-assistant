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

	// Completed with user feedback
	if (step.status === 'completed' && step.userFeedback) {
		const decision = step.userFeedback.type === 'approve'
			? 'Approved'
			: step.userFeedback.type === 'redirect'
				? `Redirected: ${step.userFeedback.message ?? ''}`
				: step.userFeedback.type === 'stop'
					? 'Stopped'
					: step.userFeedback.type;
		return (
			<span className="pktw-text-xs pktw-text-[#6b7280]">
				Plan reviewed — <span className="pktw-text-[#374151] pktw-font-medium">{decision}</span>
			</span>
		);
	}

	return (
		<span className="pktw-text-xs pktw-text-[#6b7280]">Preparing report plan…</span>
	);
};
