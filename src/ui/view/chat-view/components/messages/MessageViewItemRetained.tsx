import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { Check, Copy, RefreshCw, Star, GitBranch } from 'lucide-react';
import { ChatMessage, ChatConversation } from '@/service/chat/types';
import { useChatViewStore } from '../../store/chatViewStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { AppContext } from '@/app/context/AppContext';
import { useStreamChat } from '../../hooks/useStreamChat';
import { ConversationUpdatedEvent } from '@/core/eventBus';
import { openConversationInChat } from '@/ui/view/chat-view/chatNavigation';
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from '@/ui/component/ai-elements';
import { AnimatedSparkles, StreamdownIsolated } from '@/ui/component/mine';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { formatTimestampLocale } from '@/core/utils/date-utils';
import { MessageAttachmentsList } from './MessageAttachmentsList';
import { ToolCallSummary } from '../ToolCallSummary';
import { CapabilitySuggestion } from './CapabilitySuggestion';
import { MessageStatusIndicator } from './MessageStatusIndicator';
import { MessageSuggestedNext } from './MessageSuggestedNext';
import { MessageMorePopover } from './MessageMorePopover';
import { MessageInlineFollowup } from './MessageInlineFollowup';
import { CHAT_STRINGS } from '../../chatStrings';

interface StreamingState {
	isStreaming: boolean;
	streamingContent: string;
	reasoningContent: string;
	isReasoningActive: boolean;
	currentToolCalls: Array<{
		toolName: string;
		input?: any;
		isActive?: boolean;
		output?: any;
	}>;
	isToolSequenceActive: boolean;
}

export interface MessageItemRetainedProps {
	message: ChatMessage;
	streamingState?: StreamingState;
	isLastMessage?: boolean;
	models?: ModelInfoForSwitch[];
}

/** Tiny helper for the inline meta dot. */
const MetaDot: React.FC = () => <span className="pkchat-msg__dot">·</span>;

/**
 * MessageViewItemRetained — document-style message rendering for the 2026-05-29
 * retained chat design.
 *
 * Anatomy (assistant):
 *   .pkchat-msg
 *     ├─ __head    avatar + name + inline meta (tools / tokens / duration)
 *     ├─ __body    markdown content + reasoning + tool calls
 *     ├─ __meta-row  model chip + timestamp + Copy/Regenerate/Star/More
 *     └─ __suggest   suggested-next chips (max 2 inline + More popover)
 *
 * For user messages the body wears the sunken-surface bubble look; meta row
 * is omitted by design — user actions are surfaced via right-click + the
 * shared composer.
 */
export const MessageViewItemRetained: React.FC<MessageItemRetainedProps> = ({
	message,
	streamingState = {
		isStreaming: false,
		streamingContent: '',
		reasoningContent: '',
		isReasoningActive: false,
		currentToolCalls: [],
		isToolSequenceActive: false,
	},
	isLastMessage = false,
}) => {
	const { manager, app, eventBus, viewManager } = useServiceContext();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const activeProject = useChatDataStore((s) => s.activeProject);

	const [copied, setCopied] = useState(false);
	const [showInlineFollowup, setShowInlineFollowup] = useState(false);
	const [showRawModal, setShowRawModal] = useState(false);

	const isUser = message.role === 'user';
	const displayContent = message.content;

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(String(message.content ?? ''));
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('[MessageItemRetained] Copy failed:', err);
		}
	}, [message.content]);

	const handleCopyJson = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(JSON.stringify(message, null, 2));
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('[MessageItemRetained] Copy JSON failed:', err);
		}
	}, [message]);

	const handleToggleStar = useCallback(async () => {
		if (!activeConversation) return;
		const next = !message.starred;
		await manager.conv.toggleStar({
			messageId: message.id,
			conversationId: activeConversation.meta.id,
			starred: next,
		});
		const updatedMessages = activeConversation.messages.map((m) =>
			m.id === message.id ? { ...m, starred: next } : m
		);
		const updatedConv = { ...activeConversation, messages: updatedMessages };
		useChatViewStore.getState().setConversation(updatedConv);
		useChatDataStore.getState().updateConversation(updatedConv);
		useChatDataStore.getState().setActiveConversation(updatedConv);
		eventBus.dispatch(new ConversationUpdatedEvent({ conversation: updatedConv }));
	}, [activeConversation, manager, eventBus, message.id, message.starred]);

	const { streamChat } = useStreamChat();

	const handleRegenerate = useCallback(async () => {
		if (!activeConversation) return;
		const messageIndex = activeConversation.messages.findIndex((m) => m.id === message.id);
		if (messageIndex === -1) return;
		const assistantMessage = activeConversation.messages[messageIndex];
		if (assistantMessage.role !== 'assistant') return;
		let userMessageIndex = -1;
		for (let i = messageIndex - 1; i >= 0; i--) {
			if (activeConversation.messages[i].role === 'user') {
				userMessageIndex = i;
				break;
			}
		}
		if (userMessageIndex === -1) return;
		const userMessage = activeConversation.messages[userMessageIndex];
		try {
			const conversationContext: ChatConversation = {
				...activeConversation,
				messages: activeConversation.messages.slice(0, userMessageIndex + 1),
			};
			const streamResult = await streamChat({
				conversation: conversationContext,
				project: activeProject,
				userContent: userMessage.content,
			});
			if (streamResult.finalMessage) {
				await manager.conv.addMessage({
					conversationId: activeConversation.meta.id,
					message: streamResult.finalMessage,
					model: streamResult.finalMessage.model,
					provider: streamResult.finalMessage.provider,
					usage: streamResult.finalUsage ?? { inputTokens: -1, outputTokens: -1, totalTokens: -1 },
				});
			}
		} catch (err) {
			console.error('[MessageItemRetained] Regenerate failed:', err);
		}
	}, [activeConversation, activeProject, streamChat, manager, message.id]);

	const handleBranch = useCallback(async () => {
		if (!activeConversation) return;
		try {
			const branchedConv = await manager.conv.branchFromMessage({
				sourceConversation: activeConversation,
				messageId: message.id,
				project: activeProject?.meta ?? null,
			});
			await openConversationInChat(branchedConv, {
				manager,
				eventBus,
				viewManager,
				loadMessages: false,
			});
		} catch (err) {
			console.error('[MessageItemRetained] Branch failed:', err);
		}
	}, [activeConversation, activeProject, manager, eventBus, viewManager, message.id]);

	// ── Meta row derived bits ────────────────────────────────────────────
	const modelChipText = useMemo(() => {
		if (!message.model) return null;
		const prefix = message.provider ? `${message.provider}/` : '';
		return `${prefix}${message.model}`;
	}, [message.model, message.provider]);

	const timestampText = useMemo(() => {
		if (!message.createdAtTimestamp) return null;
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return formatTimestampLocale(message.createdAtTimestamp, tz);
	}, [message.createdAtTimestamp]);

	const tokenCount = useMemo(() => {
		const usage: any = message.tokenUsage;
		if (!usage) return null;
		return (
			usage.totalTokens ??
			usage.total_tokens ??
			((usage.promptTokens ?? usage.prompt_tokens ?? 0) +
				(usage.completionTokens ?? usage.completion_tokens ?? 0))
		);
	}, [message.tokenUsage]);

	const inlineHeadMeta: string[] = [];
	if (streamingState.currentToolCalls.length > 0) {
		inlineHeadMeta.push(
			`${streamingState.currentToolCalls.length} ${
				streamingState.currentToolCalls.length === 1
					? CHAT_STRINGS.message.toolsSingular
					: CHAT_STRINGS.message.toolsPlural
			}`
		);
	}
	if (tokenCount != null && tokenCount > 0) {
		inlineHeadMeta.push(`${tokenCount} ${CHAT_STRINGS.message.tokensSuffix}`);
	}

	const shouldShowLoader =
		streamingState.isStreaming &&
		!displayContent &&
		!streamingState.isReasoningActive &&
		!streamingState.isToolSequenceActive;

	// ── User render ──────────────────────────────────────────────────────
	if (isUser) {
		return (
			<article
				className={cn('pkchat-msg', 'pkchat-msg--user')}
				data-message-id={message.id}
				data-message-role={message.role}
			>
				<div className="pkchat-msg__head">
					<div className="pkchat-msg__avatar pkchat-msg__avatar--user">U</div>
					<div className="pkchat-msg__name">{CHAT_STRINGS.message.youName}</div>
					{timestampText && (
						<span className="pkchat-msg__head-meta">{timestampText}</span>
					)}
				</div>
				{message.resources && message.resources.length > 0 && (
					<MessageAttachmentsList message={message} app={app} />
				)}
				<div className="pkchat-msg__body">
					{displayContent ? (
						<StreamdownIsolated
							className="pktw-select-text"
							isAnimating={false}
						>
							{String(displayContent)}
						</StreamdownIsolated>
					) : null}
				</div>
				<MessageStatusIndicator status={message.status} className="pktw-mt-1" />
			</article>
		);
	}

	// ── Assistant render ─────────────────────────────────────────────────
	return (
		<article
			className="pkchat-msg"
			data-message-id={message.id}
			data-message-role={message.role}
		>
			<div className="pkchat-msg__head">
				<div className="pkchat-msg__avatar">P</div>
				<div className="pkchat-msg__name">{CHAT_STRINGS.message.assistantName}</div>
				{inlineHeadMeta.length > 0 && (
					<span className="pkchat-msg__head-meta">
						{inlineHeadMeta.map((bit, i) => (
							<React.Fragment key={i}>
								{i > 0 && <MetaDot />}
								{bit}
							</React.Fragment>
						))}
					</span>
				)}
			</div>

			<div className="pkchat-msg__body">
				{streamingState.reasoningContent && (
					<Reasoning
						isStreaming={streamingState.isReasoningActive}
						defaultOpen={streamingState.isStreaming}
						className="pktw-w-full pktw-mb-0"
					>
						<ReasoningTrigger />
						<ReasoningContent>{streamingState.reasoningContent}</ReasoningContent>
					</Reasoning>
				)}

				{streamingState.currentToolCalls.length > 0 && (
					<ToolCallSummary
						toolCalls={streamingState.currentToolCalls.map((call) => ({
							toolName: call.toolName,
							input: call.input,
							output: call.output,
							isActive: call.isActive ?? false,
						}))}
						isStreaming={streamingState.isStreaming}
					/>
				)}

				{shouldShowLoader ? (
					<div className="pktw-flex pktw-items-center pktw-justify-start pktw-py-2">
						<div className="pktw-scale-50 pktw-origin-left">
							<AnimatedSparkles isAnimating={true} />
						</div>
					</div>
				) : null}

				{!shouldShowLoader && displayContent ? (
					<StreamdownIsolated
						className="pktw-select-text"
						isAnimating={streamingState.isStreaming}
					>
						{String(displayContent)}
					</StreamdownIsolated>
				) : null}
			</div>

			{isLastMessage && !streamingState.isStreaming && !message.isErrorMessage && (
				<CapabilitySuggestion message={message} />
			)}

			{!streamingState.isStreaming && (
				<div className="pkchat-msg__meta-row">
					{modelChipText && (
						<span className="pkchat-msg__model-chip">{modelChipText}</span>
					)}
					{timestampText && <span>{timestampText}</span>}
					{(modelChipText || timestampText) && <span className="pkchat-msg__sep">·</span>}

					<button
						type="button"
						className="pkchat-msg__action"
						onClick={handleCopy}
						title={copied ? CHAT_STRINGS.message.copiedLabel : CHAT_STRINGS.message.copyLabel}
					>
						{copied ? <Check /> : <Copy />}
						<span>{copied ? CHAT_STRINGS.message.copiedLabel : CHAT_STRINGS.message.copyLabel}</span>
					</button>

					<button
						type="button"
						className="pkchat-msg__action"
						onClick={handleRegenerate}
						title={CHAT_STRINGS.message.regenerateLabel}
					>
						<RefreshCw />
						<span>{CHAT_STRINGS.message.regenerateLabel}</span>
					</button>

					<button
						type="button"
						className="pkchat-msg__action"
						onClick={handleToggleStar}
						title={
							message.starred
								? CHAT_STRINGS.message.unstarLabel
								: CHAT_STRINGS.message.starLabel
						}
					>
						<Star
							className={cn(message.starred && 'pktw-fill-current pktw-text-red-500')}
						/>
						<span>
							{message.starred
								? CHAT_STRINGS.message.unstarLabel
								: CHAT_STRINGS.message.starLabel}
						</span>
					</button>

					<button
						type="button"
						className="pkchat-msg__action"
						onClick={handleBranch}
						title={CHAT_STRINGS.message.branchLabel}
					>
						<GitBranch />
						<span>{CHAT_STRINGS.message.branchLabel}</span>
					</button>

					<MessageMorePopover
						onViewRaw={() => setShowRawModal(true)}
						onCopyMarkdown={handleCopy}
						onCopyJson={handleCopyJson}
						onReplyInline={() => setShowInlineFollowup(true)}
					/>
				</div>
			)}

			{isLastMessage && !streamingState.isStreaming && !message.isErrorMessage && (
				<MessageSuggestedNext
					messageId={message.id}
					userContent={(() => {
						const msgs = activeConversation?.messages;
						if (!msgs) return '';
						const idx = msgs.findIndex((m) => m.id === message.id);
						for (let i = idx - 1; i >= 0; i--) {
							if (msgs[i].role === 'user') return String(msgs[i].content || '');
						}
						return '';
					})()}
					assistantContent={String(message.content || '')}
					onSelect={(q) => {
						const submit = useChatViewStore.getState().submitAction;
						if (submit) submit(q);
					}}
				/>
			)}

			{showInlineFollowup && (
				<MessageInlineFollowup onClose={() => setShowInlineFollowup(false)} />
			)}

			{showRawModal && (
				<RawMessageModal message={message} onClose={() => setShowRawModal(false)} />
			)}

			{message.isErrorMessage &&
				(message.content.includes('profile') ||
					message.content.includes('configured') ||
					message.content.includes('credentials')) && (
					<button
						type="button"
						className="pkchat-msg__action"
						onClick={() => {
							const { SettingsModal } = require('@/ui/view/SettingsModal');
							new SettingsModal(AppContext.getInstance()).open();
						}}
					>
						{CHAT_STRINGS.message.openSettingsLabel}
					</button>
				)}

			<MessageStatusIndicator status={message.status} className="pktw-mt-1" />
		</article>
	);
};

// ── Raw-message viewer modal ─────────────────────────────────────────────

import { Modal } from '@/ui/components/primitives';

const RawMessageModal: React.FC<{ message: ChatMessage; onClose: () => void }> = ({
	message,
	onClose,
}) => {
	const raw = JSON.stringify(message, null, 2);
	return (
		<Modal open onOpenChange={(open) => { if (!open) onClose(); }}>
			<Modal.Content width="wide">
				<Modal.Header>
					<Modal.Title>{CHAT_STRINGS.message.viewRawTitle}</Modal.Title>
					<Modal.Close />
				</Modal.Header>
				<Modal.Body>
					<pre
						style={{
							margin: 0,
							maxHeight: '60vh',
							overflow: 'auto',
							fontFamily: 'var(--pk-font-mono)',
							fontSize: '12px',
							background: 'var(--pk-surface-sunken)',
							padding: 'var(--pk-space-3)',
							borderRadius: 'var(--pk-radius-sm)',
							whiteSpace: 'pre-wrap',
							wordBreak: 'break-word',
						}}
					>
						{raw}
					</pre>
				</Modal.Body>
			</Modal.Content>
		</Modal>
	);
};
