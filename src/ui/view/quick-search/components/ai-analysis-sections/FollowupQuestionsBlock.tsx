import React, { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useAIAnalysisInteractionsStore, useAIAnalysisRuntimeStore } from '../../store/aiAnalysisStore';
import { useContinueAnalysisFollowupChatConfig } from '../../hooks/useAIAnalysisPostAIInteractions';
import { streamSearchFollowup, consumeFollowupStream } from '../../hooks/useAIAnalysisPostAIInteractions';

/** Fallback when agent did not return suggested follow-up questions. */
const FALLBACK_QUESTIONS = [
	'What contradictions or tensions appear across my notes on this?',
	'What am I missing? What perspective or evidence is absent?',
];

export type FollowupQuestionsBlockProps = {
	summary: string;
	onClose?: () => void;
};

/**
 * Block of suggested follow-up questions from the suggest-follow-up agent (search history / memory).
 * Clicking one runs Continue-Analysis-style follow-up and appends the answer to fullAnalysisFollowUp.
 */
export const FollowupQuestionsBlock: React.FC<FollowupQuestionsBlockProps> = ({ summary }) => {
	const { manager } = useServiceContext();
	const suggestedFollowUpQuestions = useAIAnalysisInteractionsStore((s) => s.suggestedFollowUpQuestions);
	const setFullAnalysisFollowUp = useAIAnalysisInteractionsStore((s) => s.setFullAnalysisFollowUp);
	const setFollowUpStreaming = useAIAnalysisInteractionsStore((s) => s.setFollowUpStreaming);
	const [loadingQuestion, setLoadingQuestion] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const continueConfig = useContinueAnalysisFollowupChatConfig({ summary });

	const questions = useMemo(() => {
		const raw = (suggestedFollowUpQuestions ?? []).filter((q) => (q ?? '').trim());
		return raw.length > 0 ? raw : FALLBACK_QUESTIONS;
	}, [suggestedFollowUpQuestions]);

	const runFollowup = useCallback(
		async (question: string) => {
			if (!question.trim()) return;
			setError(null);
			setLoadingQuestion(question);
			setFollowUpStreaming({ question, content: '' });
			try {
				const variables = continueConfig.getVariables(question);
				const stream = streamSearchFollowup(
					manager,
					continueConfig.promptId,
					variables as Record<string, unknown>
				);
				const answer = await consumeFollowupStream(stream, {
					onDelta: (acc) => {
						const prev = useAIAnalysisInteractionsStore.getState().followUpStreaming;
						if (prev) setFollowUpStreaming({ ...prev, content: acc });
					},
					onUsage: (usage) => useAIAnalysisRuntimeStore.getState().accumulateUsage(usage),
				});
				setFullAnalysisFollowUp(question, answer, 'append');
			} catch (e) {
				console.warn('[FollowupQuestionsBlock] followup failed:', e);
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setFollowUpStreaming(null);
				setLoadingQuestion(null);
			}
		},
		[manager, continueConfig, setFullAnalysisFollowUp, setFollowUpStreaming]
	);

	if (questions.length === 0) return null;

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
			className="pktw-select-text pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb] pktw-scroll-mt-4"
		>
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<MessageCircle className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-xs pktw-font-semibold pktw-text-[#6b7280]">Follow-up Questions</span>
				<span className="pktw-text-[11px] pktw-text-[#9ca3af]">Click to analyze</span>
			</div>
			<ul className="pktw-flex pktw-flex-col pktw-gap-1 pktw-list-none pktw-m-0 pktw-p-0">
				{questions.map((q) => {
					const isBusy = loadingQuestion === q;
					return (
						<li key={q} className="pktw-w-full">
							<Button
								variant="ghost"
								size="sm"
								disabled={!!loadingQuestion}
								onClick={() => void runFollowup(q)}
								className="pktw-w-full pktw-justify-start pktw-shadow-none pktw-text-xs pktw-px-3 pktw-py-2 pktw-h-auto pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white hover:pktw-bg-[#f5f3ff] hover:pktw-border-[#7c3aed]/30 hover:pktw-text-[#7c3aed] pktw-text-left pktw-font-normal pktw-normal-case"
								title="Run follow-up analysis (same as Continue Analysis)"
							>
								{isBusy ? '…' : q}
							</Button>
						</li>
					);
				})}
			</ul>
			{error ? (
				<div className="pktw-mt-2 pktw-text-xs pktw-text-red-600">{error}</div>
			) : null}
		</motion.div>
	);
};
