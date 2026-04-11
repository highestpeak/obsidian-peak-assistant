/**
 * HitlInlineInput: action panel shown when VaultSearchAgent pauses for user review.
 *
 * Shows preset action buttons + coverage gap "dig deeper" + free-form redirect input.
 */

import React, { useState } from 'react';
import { Check, RotateCcw, X, Search, FileText, ArrowRight } from 'lucide-react';
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
	const [showMore, setShowMore] = useState(false);
	const hitlFeedbackCallback = useAIAnalysisRuntimeStore((s) => s.hitlFeedbackCallback);

	const sendFeedback = (feedback: UserFeedback) => {
		hitlFeedbackCallback?.(feedback);
	};

	return (
		<span className="pktw-flex pktw-flex-col pktw-gap-2 pktw-mt-2 pktw-p-2.5 pktw-rounded-lg pktw-border pktw-border-[#7c3aed]/30 pktw-bg-[#7c3aed]/5">
			{/* Preset action buttons — primary choices */}
			<span className="pktw-flex pktw-flex-col pktw-gap-1.5">
				<Button
					onClick={() => sendFeedback({ type: 'approve' })}
					size="sm"
					className="pktw-w-full pktw-h-7 pktw-text-xs pktw-bg-[#7c3aed] hover:pktw-bg-[#6d28d9] pktw-text-white pktw-justify-start pktw-gap-2"
				>
					<FileText size={12} />
					Generate Report
				</Button>

				{/* Coverage gap actions */}
				{snapshot.coverageGaps && snapshot.coverageGaps.length > 0 && (
					snapshot.coverageGaps.map((gap, i) => (
						<Button
							key={i}
							onClick={() => sendFeedback({ type: 'redirect', message: `Dig deeper into: ${gap}` })}
							size="sm"
							variant="outline"
							className="pktw-w-full pktw-h-7 pktw-text-xs pktw-justify-start pktw-gap-2 pktw-text-[#7c3aed] pktw-border-[#7c3aed]/20"
						>
							<Search size={12} />
							Dig deeper: {gap}
						</Button>
					))
				)}

				{/* More options toggle */}
				<span
					className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-cursor-pointer pktw-text-center hover:pktw-text-[#7c3aed]"
					onClick={() => setShowMore(v => !v)}
				>
					{showMore ? 'Less options' : 'More options...'}
				</span>
			</span>

			{/* Expanded options */}
			{showMore && (
				<span className="pktw-flex pktw-flex-col pktw-gap-1.5">
					{/* Free-form redirect */}
					<span className="pktw-flex pktw-gap-1.5 pktw-items-center">
						<input
							type="text"
							placeholder="Search for something else..."
							value={redirectText}
							onChange={(e) => setRedirectText(e.target.value)}
							onKeyDown={(e) => e.key === 'Enter' && redirectText.trim() && sendFeedback({ type: 'redirect', message: redirectText.trim() })}
							className="pktw-flex-1 pktw-bg-transparent pktw-text-xs pktw-text-[#e2d9f3] pktw-border pktw-border-[#7c3aed]/30 pktw-rounded pktw-px-2 pktw-py-1 pktw-outline-none focus:pktw-border-[#7c3aed] pktw-placeholder-[#7c3aed]/30"
						/>
						{redirectText.trim() && (
							<Button
								onClick={() => { sendFeedback({ type: 'redirect', message: redirectText.trim() }); setRedirectText(''); }}
								size="sm"
								variant="ghost"
								className="pktw-h-6 pktw-px-2 pktw-text-xs pktw-text-[#a78bfa]"
							>
								<ArrowRight size={10} />
							</Button>
						)}
					</span>

					<Button
						onClick={() => sendFeedback({ type: 'stop' })}
						size="sm"
						variant="ghost"
						className="pktw-h-6 pktw-text-xs pktw-text-[#ef4444]/70 hover:pktw-text-[#ef4444]"
					>
						<X size={10} className="pktw-mr-1" />
						Cancel
					</Button>
				</span>
			)}
		</span>
	);
};
