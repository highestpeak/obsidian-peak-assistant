/**
 * ContinueAnalysisInput: shown at the bottom of search results after analysis completes.
 *
 * Preset action buttons + free-form input for follow-up questions.
 * Publishes 'continue-analysis' UIEvent which tab-AISearch picks up to open InlineFollowupChat.
 *
 * Hidden during HITL pause — HitlInlineInput inside PlanStep handles that case.
 */

import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useSearchSessionStore } from '../../store/searchSessionStore';
import { useUIEventStore } from '@/ui/store/uiEventStore';

// Presets for follow-up after analysis is complete
const PRESETS = [
	'What did you find so far?',
	'Which notes are most relevant?',
	'Summarize the key insights',
];

export const ContinueAnalysisInput: React.FC = () => {
	const [text, setText] = useState('');
	const [submitted, setSubmitted] = useState(false);
	// Only show after plan step appears — recon alone is too early
	const hasPlan = useSearchSessionStore((s) => s.steps.some((st) => st.type === 'plan'));
	// Hide during HITL pause — HitlInlineInput inside PlanStep handles the action
	const hitlActive = useSearchSessionStore((s) => s.hitlState !== null);

	if (!hasPlan || submitted || hitlActive) return null;

	const triggerContinue = (question: string) => {
		if (!question.trim()) return;
		useUIEventStore.getState().publish('continue-analysis', { text: question.trim() });
		setText('');
		setSubmitted(true);
	};

	return (
		<div className="pktw-mt-3 pktw-pt-2 pktw-border-t pktw-border-[#f3f4f6]">
			<div className="pktw-flex pktw-gap-1.5 pktw-items-center">
				<input
					type="text"
					placeholder="Ask about what's been found so far…"
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') triggerContinue(text);
					}}
					className="pktw-flex-1 pktw-bg-transparent pktw-text-xs pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-px-3 pktw-py-1.5 focus:pktw-border-[#7c3aed] pktw-outline-none pktw-text-[#374151] placeholder:pktw-text-[#9ca3af]"
				/>
				{text.trim() && (
					<Button
						onClick={() => triggerContinue(text)}
						size="sm"
						variant="ghost"
						className="pktw-h-7 pktw-w-7 pktw-p-0 pktw-text-[#7c3aed] hover:pktw-bg-[#ede9fe]"
					>
						<ArrowRight size={14} />
					</Button>
				)}
			</div>
			<div className="pktw-flex pktw-gap-1 pktw-mt-1.5 pktw-flex-wrap">
				{PRESETS.map((preset) => (
					<button
						key={preset}
						onClick={() => triggerContinue(preset)}
						className="pktw-text-[10px] pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-[#f3f4f6] pktw-text-[#6b7280] hover:pktw-bg-[#ede9fe] hover:pktw-text-[#7c3aed] pktw-transition-colors pktw-cursor-pointer"
					>
						{preset}
					</button>
				))}
			</div>
		</div>
	);
};
