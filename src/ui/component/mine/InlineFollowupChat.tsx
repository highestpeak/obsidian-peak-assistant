import React, { useEffect, useMemo, useState } from 'react';
import { StreamdownIsolated } from '@/ui/component/mine';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type { PromptId } from '@/service/prompt/PromptId';

type ApplyMode = 'append' | 'replace';

/**
 * A lightweight inline follow-up chat component.
 *
 * Design goals:
 * - Minimal UI (single input)
 * - Streaming output rendered in-place via prompt templates (chatWithPromptStream)
 * - Optional "apply" behavior (append/replace) controlled by parent
 *
 * NOTE:
 * Does NOT create or use a conversation; streams via manager.chatWithPromptStream only.
 */
export const InlineFollowupChat: React.FC<{
	title: string;
	placeholder?: string;

	/** Prompt template ID from PromptId. */
	promptId: PromptId;
	/** Build variables for the prompt. Must include `question`. */
	getVariables: (question: string) => Record<string, unknown>;
	/** Optional initial question (e.g. when opened from node context "Chat"). */
	initialQuestion?: string;

	/** When true, hide Append/Replace mode toggle. */
	hideModeToggle?: boolean;
	applyMode?: ApplyMode;
	/** When 'modal', answer is shown in a modal; input stays inline. */
	outputPlace?: 'inline' | 'modal';
	/** Called when modal opens (outputPlace=replace). Opens before streaming starts. */
	onOpenModal?: (question: string) => void;
	/** When mode=replace, stream chunks here so parent can render in-place. If set, answer is not shown inline. Pass null to clear. */
	onStreamingReplace?: (text: string | null, context?: { question: string }) => void;
	/**
	 * Called when the streamed answer is complete.
	 * question is the user's input, used as section title when applicable.
	 */
	onApply?: (answer: string, mode: ApplyMode, question?: string) => void;
	/** When set, show Cancel button and call on cancel. */
	onCancel?: () => void;
}> = ({ title, placeholder, promptId, getVariables, onApply, hideModeToggle, applyMode = 'append', initialQuestion, outputPlace = 'inline', onOpenModal, onStreamingReplace, onCancel }) => {
	const { manager } = useServiceContext();
	const [question, setQuestion] = useState(initialQuestion ?? '');
	const [mode, setMode] = useState<ApplyMode>(applyMode);

	useEffect(() => {
		if (initialQuestion != null) setQuestion(initialQuestion);
	}, [initialQuestion]);

	const [isStreaming, setIsStreaming] = useState(false);
	const [answer, setAnswer] = useState('');
	const [error, setError] = useState<string | null>(null);

	const canSend = useMemo(() => !isStreaming && question.trim().length > 0, [isStreaming, question]);

	const send = async () => {
		const q = question.trim();
		if (!q) return;
		setError(null);
		setIsStreaming(true);
		setAnswer('');

		try {
			if (outputPlace === 'modal' && onOpenModal) {
				onOpenModal(q);
			}
			if (mode === 'replace' && onStreamingReplace) {
				onStreamingReplace('', { question: q });
			}

			const variables = getVariables(q);
			let acc = '';
			for await (const event of manager.chatWithPromptStream(promptId, variables as any)) {
				if (event.type === 'prompt-stream-delta' && typeof event.delta === 'string') {
					acc += event.delta;
					if (onStreamingReplace) {
						onStreamingReplace(acc, { question: q });
					}
					setAnswer(acc);
				} else if (event.type === 'prompt-stream-result' && event.output != null) {
					acc = typeof event.output === 'string' ? event.output : acc;
				} else if (event.type === 'error') {
					throw event.error;
				}
			}

			setQuestion('');
			onApply?.(acc, mode, q);
		} catch (e) {
			console.warn('[InlineFollowupChat] streaming failed:', e);
			setError(e instanceof Error ? e.message : String(e));
			onStreamingReplace?.(null);
		} finally {
			setIsStreaming(false);
		}
	};

	return (
		<div className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-p-3">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-2">
				<span className="pktw-text-xs pktw-font-semibold pktw-text-[#2e3338]">{title}</span>
				<div className="pktw-flex-1" />
				{onCancel ? (
					<Button
						variant="ghost"
						style={{ cursor: 'pointer' }}
						className="pktw-text-[11px] pktw-text-[#9ca3af] hover:pktw-text-[#374151] pktw-px-2 pktw-py-1"
						onClick={onCancel}
					>
						Cancel
					</Button>
				) : null}
				{outputPlace === 'inline' && !hideModeToggle ? (
					<div className="pktw-inline-flex pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-overflow-hidden pktw-gap-3">
						<Button
							variant="ghost"
							style={{ cursor: 'pointer' }}
							className={`pktw-text-[11px] pktw-px-2 pktw-py-1 ${mode === 'append' ? 'pktw-bg-[#f3f4f6] pktw-text-[#2e3338]' : 'pktw-bg-white pktw-text-[#6b7280]'}`}
							onClick={() => setMode('append')}
							disabled={isStreaming}
							title="Append answer below"
						>
							Append
						</Button>
						<Button
							variant="ghost"
							style={{ cursor: 'pointer' }}
							className={`pktw-text-[11px] pktw-px-2 pktw-py-1 ${mode === 'replace' ? 'pktw-bg-[#f3f4f6] pktw-text-[#2e3338]' : 'pktw-bg-white pktw-text-[#6b7280]'}`}
							onClick={() => setMode('replace')}
							disabled={isStreaming}
							title="Replace the section content"
						>
							Replace
						</Button>
					</div>
				) : null}
			</div>

			<div className="pktw-flex pktw-gap-2 pktw-items-center">
				<input
					className="pktw-shadow-none pktw-flex-1 pktw-min-w-0 pktw-h-9 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-px-3 pktw-text-sm pktw-text-[#2e3338] focus:pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-[#7c3aed]/30"
					value={question}
					onChange={(e) => setQuestion(e.target.value)}
					placeholder={placeholder || 'Ask a follow-up…'}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							void send();
						}
						if (e.key === 'Escape') onCancel?.();
					}}
					disabled={isStreaming}
				/>
				<Button
					size="sm"
					onClick={() => void send()}
					disabled={!canSend}
					className="pktw-h-9 pktw-px-3 pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9]"
				>
					{isStreaming ? 'Sending…' : 'Send'}
				</Button>
			</div>

			{error ? (
				<div className="pktw-mt-2 pktw-text-xs pktw-text-red-600">
					{error}
				</div>
			) : null}

			{outputPlace === 'inline' && !(mode === 'replace' && onStreamingReplace) && answer ? (
				<StreamdownIsolated
					className="pktw-mt-3 pktw-text-sm pktw-text-[#2e3338]"
					isAnimating={isStreaming}
				>
					{answer}
				</StreamdownIsolated>
			) : null}
		</div>
	);
};
