/**
 * Inline chat scoped to a single Auto Review insight.
 *
 * Two modes:
 *   - 'follow-up'      — open dialogue to understand / explore the insight
 *   - 'draft-proposal' — ask the model to turn the insight into 1-3 concrete edits
 *
 * Stays within the review modal: streams from the AI service manager, renders
 * conversation history inline with markdown via StreamdownIsolated. Does NOT
 * persist to chat history (this is ephemeral exploration).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import { PromptId } from '@/core/prompt/PromptId';
import { TemplateManager } from '@/core/template/TemplateManager';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { StreamdownIsolated } from '@/ui/component/mine';
import { useServiceContext } from '@/ui/context/ServiceContext';

export type InsightChatMode = 'follow-up' | 'draft-proposal';

export interface ChatTurn {
	role: 'user' | 'assistant';
	text: string;
	at: number;
}

export interface PersistedInsightChat {
	mode: InsightChatMode;
	turns: ChatTurn[];
	updatedAt: number;
}

interface InsightInlineChatProps {
	insightTitle: string;
	insightBody: string;
	subjectPath?: string;
	subjectBasename?: string;
	mode: InsightChatMode;
	onClose: () => void;
	/** Initial conversation history (when reopening after collapse, or in read-only history mode). */
	initialHistory?: ChatTurn[];
	/** Called whenever the conversation updates so parent can persist. */
	onHistoryChange?: (turns: ChatTurn[]) => void;
	/** Read-only mode disables the input + send. */
	readOnly?: boolean;
}

async function buildSystemPrompt(params: {
	mode: InsightChatMode;
	subjectBasename: string;
	subjectPath: string;
	insightTitle: string;
	insightBody: string;
}): Promise<string> {
	// T11Y-6: prompt body migrated to
	// templates/prompts/insight-inline-chat-{draft-proposal,followup}-system.md.
	// Pre-template `params.subjectPath || '(unknown)'` /
	// `params.subjectBasename || '(untitled)'` fallbacks are computed here so
	// the template stores only `{{{subjectPath}}}` / `{{{subjectBasename}}}`.
	const tm = TemplateManager.getInstance();
	if (!tm) throw new Error('TemplateManager not bound — cannot render insight inline chat system prompt.');
	const vars = {
		subjectPath: params.subjectPath || '(unknown)',
		subjectBasename: params.subjectBasename || '(untitled)',
		insightTitle: params.insightTitle,
		insightBody: params.insightBody,
	};
	const id = params.mode === 'draft-proposal'
		? PromptId.InsightInlineChatDraftProposalSystem
		: PromptId.InsightInlineChatFollowupSystem;
	return tm.render(id, vars);
}

function buildUserPrompt(history: ChatTurn[], question: string): string {
	if (history.length === 0) return question;
	const lines: string[] = ['Prior conversation:'];
	for (const t of history) {
		lines.push(`${t.role === 'user' ? 'USER' : 'ASSISTANT'}: ${t.text}`);
	}
	lines.push('');
	lines.push(`USER: ${question}`);
	return lines.join('\n');
}

export const InsightInlineChat: React.FC<InsightInlineChatProps> = ({
	insightTitle,
	insightBody,
	subjectPath,
	subjectBasename,
	mode,
	onClose,
	initialHistory,
	onHistoryChange,
	readOnly,
}) => {
	const { manager } = useServiceContext();
	const [history, setHistory] = useState<ChatTurn[]>(initialHistory ?? []);
	const [input, setInput] = useState('');
	const [streaming, setStreaming] = useState('');
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const placeholder = mode === 'draft-proposal'
		? 'Add any specifics, then press Enter to draft edits…'
		: 'Ask a follow-up about this insight…';

	const promptedRef = useRef(false);
	useEffect(() => {
		// Prefill an initial question for draft-proposal mode so the user
		// can just press Enter to get edits — but only if there's no existing history.
		if (mode === 'draft-proposal' && !promptedRef.current && history.length === 0 && !readOnly) {
			promptedRef.current = true;
			setInput('Draft 2-3 concrete edits I could apply.');
		}
	}, [mode, history.length, readOnly]);

	const canSend = useMemo(
		() => !isStreaming && !readOnly && input.trim().length > 0,
		[isStreaming, input, readOnly],
	);

	const send = async () => {
		if (readOnly) return;
		const question = input.trim();
		if (!question) return;
		setError(null);

		const nextHistoryWithUser: ChatTurn[] = [...history, { role: 'user', text: question, at: Date.now() }];
		setHistory(nextHistoryWithUser);
		onHistoryChange?.(nextHistoryWithUser);
		setInput('');
		setStreaming('');
		setIsStreaming(true);

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const systemPrompt = await buildSystemPrompt({
				mode,
				subjectBasename: subjectBasename ?? '',
				subjectPath: subjectPath ?? '',
				insightTitle,
				insightBody,
			});
			const userPrompt = buildUserPrompt(history, question);

			let accumulated = '';
			for await (const evt of manager.queryTextStream(userPrompt, undefined, {
				systemPrompt,
				signal: controller.signal,
				usageFeature: 'copilot',
				usageAction: `insight-${mode}`,
			})) {
				if (evt.type === 'delta') {
					accumulated += evt.text;
					setStreaming(accumulated);
				}
			}

			const finalHistory: ChatTurn[] = [...nextHistoryWithUser, { role: 'assistant', text: accumulated, at: Date.now() }];
			setHistory(finalHistory);
			onHistoryChange?.(finalHistory);
			setStreaming('');
		} catch (err) {
			if (controller.signal.aborted) {
				// Treat as a soft cancel — drop the partial assistant turn.
				setHistory(history); // revert: remove the user turn we just pushed
			} else {
				setError(err instanceof Error ? err.message : String(err));
			}
			setStreaming('');
		} finally {
			setIsStreaming(false);
			abortRef.current = null;
		}
	};

	const cancel = () => {
		abortRef.current?.abort();
	};

	return (
		<div className="pktw-mt-3 pktw-rounded-lg pktw-border pktw-border-pk-accent/40 pktw-bg-background pktw-p-3" style={{ userSelect: 'text' }}>
			<div className="pktw-mb-2 pktw-flex pktw-items-center pktw-gap-2">
				<Sparkles className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-accent" />
				<span className="pktw-text-[12px] pktw-font-semibold pktw-text-foreground">
					{mode === 'draft-proposal' ? 'Draft edits from this insight' : 'Follow-up about this insight'}
				</span>
				<span className="pktw-flex-1" />
				<Button
					variant="ghost"
					size="icon"
					className="pktw-h-6 pktw-w-6"
					onClick={onClose}
					title="Close this chat"
				>
					<X className="pktw-h-3.5 pktw-w-3.5" />
				</Button>
			</div>

			{(history.length > 0 || streaming) && (
				<div className="pktw-mb-2 pktw-flex pktw-flex-col pktw-gap-3 pktw-rounded-md pktw-border pktw-border-border pktw-bg-muted/10 pktw-p-3" style={{ userSelect: 'text' }}>
					{history.map((turn, i) => (
						<div key={i} className="pktw-flex pktw-flex-col pktw-gap-1">
							<span className={cn(
								'pktw-text-[10px] pktw-font-semibold pktw-uppercase pktw-tracking-wider',
								turn.role === 'user' ? 'pktw-text-pk-accent' : 'pktw-text-muted-foreground',
							)}>
								{turn.role === 'user' ? 'You' : 'Assistant'}
							</span>
							{turn.role === 'user' ? (
								<span className="pktw-text-sm pktw-leading-relaxed pktw-text-foreground pktw-whitespace-pre-wrap">{turn.text}</span>
							) : (
								<StreamdownIsolated className="pktw-text-sm pktw-leading-relaxed pktw-text-foreground">
									{turn.text}
								</StreamdownIsolated>
							)}
						</div>
					))}
					{streaming && (
						<div className="pktw-flex pktw-flex-col pktw-gap-1">
							<span className="pktw-text-[10px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
								Assistant
							</span>
							<StreamdownIsolated className="pktw-text-sm pktw-leading-relaxed pktw-text-foreground" isAnimating>
								{streaming}
							</StreamdownIsolated>
						</div>
					)}
				</div>
			)}

			{error && (
				<div className="pktw-mb-2 pktw-rounded-md pktw-bg-red-50/70 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-text-red-700 dark:pktw-bg-red-950/30 dark:pktw-text-red-300">
					{error}
				</div>
			)}

			{readOnly ? (
				<div className="pktw-rounded-md pktw-border pktw-border-dashed pktw-border-border pktw-px-3 pktw-py-2 pktw-text-[11px] pktw-text-muted-foreground">
					Historical conversation — read-only.
				</div>
			) : (
				<div className="pktw-flex pktw-items-end pktw-gap-2">
					<textarea
						className="pktw-flex-1 pktw-min-h-[36px] pktw-max-h-32 pktw-resize-y pktw-rounded-md pktw-border pktw-border-border pktw-bg-background pktw-px-3 pktw-py-1.5 pktw-text-sm pktw-text-foreground focus:pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-pk-accent/30"
						value={input}
						onChange={e => setInput(e.target.value)}
						onKeyDown={e => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								if (canSend) void send();
							}
						}}
						placeholder={placeholder}
						disabled={isStreaming}
						rows={1}
					/>
					{isStreaming ? (
						<Button size="sm" variant="outline" className="pktw-h-9 pktw-gap-1.5" onClick={cancel}>
							<Loader2 className="pktw-h-3.5 pktw-w-3.5 pktw-animate-spin" />
							Cancel
						</Button>
					) : (
						<Button size="sm" className="pktw-h-9 pktw-gap-1.5" onClick={() => void send()} disabled={!canSend}>
							<Send className="pktw-h-3.5 pktw-w-3.5" />
							Send
						</Button>
					)}
				</div>
			)}
		</div>
	);
};
