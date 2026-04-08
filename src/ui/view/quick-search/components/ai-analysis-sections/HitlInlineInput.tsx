/**
 * HitlInlineInput: shown when VaultSearchAgent pauses for user review.
 *
 * Displays:
 * - Proposed report outline
 * - Collected evidence list
 * - Text input for redirect feedback
 * - Action buttons: Approve / Redirect / Add More / Stop
 */

import React, { useState } from 'react';
import { Check, RotateCcw, Plus, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useAIAnalysisRuntimeStore } from '../../store/aiAnalysisStore';
import type { PlanSnapshot } from '@/service/agents/vault/types';
import type { UserFeedback } from '@/service/agents/core/types';

interface HitlInlineInputProps {
	pauseId: string;
	phase: string;
	snapshot: PlanSnapshot;
}

export const HitlInlineInput: React.FC<HitlInlineInputProps> = ({ pauseId, phase, snapshot }) => {
	const [redirectText, setRedirectText] = useState('');
	const [showEvidence, setShowEvidence] = useState(false);
	const hitlFeedbackCallback = useAIAnalysisRuntimeStore((s) => s.hitlFeedbackCallback);

	const sendFeedback = (feedback: UserFeedback) => {
		hitlFeedbackCallback?.(feedback);
	};

	const handleApprove = () => {
		sendFeedback({ type: 'approve' });
	};

	const handleRedirect = () => {
		if (!redirectText.trim()) return;
		sendFeedback({ type: 'redirect', message: redirectText.trim() });
		setRedirectText('');
	};

	const handleStop = () => {
		sendFeedback({ type: 'stop' });
	};

	const confidenceColor =
		snapshot.confidence === 'high' ? 'pktw-text-green-400' :
		snapshot.confidence === 'medium' ? 'pktw-text-yellow-400' :
		'pktw-text-red-400';

	return (
		<span className="pktw-flex pktw-flex-col pktw-gap-3 pktw-mt-3 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-[#7c3aed]/30 pktw-bg-[#7c3aed]/5">
			{/* Header */}
			<span className="pktw-flex pktw-items-center pktw-gap-2">
				<span className="pktw-text-xs pktw-font-semibold pktw-text-[#a78bfa]">Research Plan Ready</span>
				<span className={`pktw-text-xs ${confidenceColor}`}>({snapshot.confidence} confidence)</span>
			</span>

			{/* Proposed outline */}
			<span className="pktw-text-xs pktw-text-[#c4b5fd]/80 pktw-leading-relaxed">
				{snapshot.proposedOutline}
			</span>

			{/* Suggested sections */}
			{snapshot.suggestedSections.length > 0 && (
				<span className="pktw-flex pktw-flex-col pktw-gap-1">
					<span className="pktw-text-xs pktw-text-[#a78bfa]/60">Proposed sections:</span>
					<span className="pktw-flex pktw-flex-wrap pktw-gap-1">
						{snapshot.suggestedSections.map((section, i) => (
							<span
								key={i}
								className="pktw-text-xs pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-[#7c3aed]/20 pktw-text-[#c4b5fd]"
							>
								{section}
							</span>
						))}
					</span>
				</span>
			)}

			{/* Coverage assessment */}
			<span className="pktw-text-xs pktw-text-[#c4b5fd]/60 pktw-italic">
				{snapshot.coverageAssessment}
			</span>

			{/* Evidence toggle */}
			<span
				className="pktw-flex pktw-items-center pktw-gap-1 pktw-cursor-pointer pktw-text-xs pktw-text-[#a78bfa]/70 hover:pktw-text-[#a78bfa]"
				onClick={() => setShowEvidence((v) => !v)}
			>
				{showEvidence ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
				<span>{snapshot.evidence.length} sources collected</span>
			</span>

			{showEvidence && (
				<span className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-max-h-32 pktw-overflow-y-auto pktw-pl-2 pktw-border-l pktw-border-[#7c3aed]/20">
					{snapshot.evidence.slice(0, 20).map((ev, i) => (
						<span key={i} className="pktw-text-xs pktw-text-[#c4b5fd]/70 pktw-truncate" title={`${ev.path}: ${ev.reason}`}>
							<span className="pktw-text-[#a78bfa]">{ev.path.split('/').pop()}</span>
							<span className="pktw-ml-1 pktw-text-[#c4b5fd]/40">— {ev.reason.slice(0, 60)}</span>
						</span>
					))}
					{snapshot.evidence.length > 20 && (
						<span className="pktw-text-xs pktw-text-[#c4b5fd]/40">…and {snapshot.evidence.length - 20} more</span>
					)}
				</span>
			)}

			{/* Redirect input */}
			<span className="pktw-flex pktw-gap-2 pktw-items-center">
				<input
					type="text"
					placeholder="Redirect: describe what else to search…"
					value={redirectText}
					onChange={(e) => setRedirectText(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && handleRedirect()}
					className="pktw-flex-1 pktw-bg-transparent pktw-text-xs pktw-text-[#e2d9f3] pktw-border pktw-border-[#7c3aed]/30 pktw-rounded pktw-px-2 pktw-py-1 pktw-outline-none focus:pktw-border-[#7c3aed] pktw-placeholder-[#7c3aed]/30"
				/>
				{redirectText.trim() && (
					<Button
						onClick={handleRedirect}
						size="sm"
						variant="ghost"
						className="pktw-h-6 pktw-px-2 pktw-text-xs pktw-text-[#a78bfa]"
					>
						<RotateCcw size={10} className="pktw-mr-1" />
						Redirect
					</Button>
				)}
			</span>

			{/* Action buttons */}
			<span className="pktw-flex pktw-gap-2 pktw-justify-end">
				<Button
					onClick={handleStop}
					size="sm"
					variant="ghost"
					className="pktw-h-6 pktw-px-2 pktw-text-xs pktw-text-[#ef4444]/70 hover:pktw-text-[#ef4444]"
				>
					<X size={10} className="pktw-mr-1" />
					Stop
				</Button>
				<Button
					onClick={handleApprove}
					size="sm"
					className="pktw-h-6 pktw-px-2 pktw-text-xs pktw-bg-[#7c3aed] hover:pktw-bg-[#6d28d9] pktw-text-white"
				>
					<Check size={10} className="pktw-mr-1" />
					Approve & Generate Report
				</Button>
			</span>
		</span>
	);
};
