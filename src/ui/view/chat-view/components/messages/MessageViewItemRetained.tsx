import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { Check, Copy, RefreshCw, Star, GitBranch } from 'lucide-react';
import { ChatMessage, ChatConversation } from '@/service/chat/types';
import { useChatViewStore } from '../../store/chatViewStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useStreamChat } from '../../hooks/useStreamChat';
import { ConversationUpdatedEvent } from '@/core/eventBus';
import { openConversationInChat } from '@/ui/view/chat-view/chatNavigation';
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from '@/ui/component/ai-elements';
import { Chip } from '@/ui/components/primitives';
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
import { useChatStrings } from '../../chatStringsContext';
import { getMessageReceiptRenderer } from '../../integration/messageReceiptSlot';
import { UsageOutcomeService } from '@/service/usage/UsageOutcomeService';
import { Notice } from 'obsidian';

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
	const strings = useChatStrings();
	const { manager, app, eventBus, viewManager, chatVaultWriter, settingsActions } = useServiceContext();
	const openSettings = settingsActions.openSettings;
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const activeProject = useChatDataStore((s) => s.activeProject);

	const [copied, setCopied] = useState(false);
	const [showInlineFollowup, setShowInlineFollowup] = useState(false);
	const [showRawModal, setShowRawModal] = useState(false);

	// PR-Chat-4 hook: external consumers (Usage Dashboard) can inject an inline
	// cost/duration receipt. Read once per render — registry is module-local so
	// no React state churn.
	const ReceiptRenderer = getMessageReceiptRenderer();

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

	/**
	 * Save the message body to a fresh markdown note in the vault and emit a
	 * `vault_save` outcome event so the Usage Dashboard's MPG metric counts it
	 * as a "useful" message.
	 *
	 * Target folder: `strings.message.vaultSaveDefaultFolder` (template-overridable;
	 * defaults to "Peak Chat Saves"). The note name uses an ISO-derived timestamp
	 * so multiple saves of the same conversation don't collide.
	 */
	const handleSaveToVault = useCallback(async () => {
		if (!activeConversation) return;
		const folderRaw = (strings.message.vaultSaveDefaultFolder || 'Peak Chat Saves').trim();
		const titleSlug = (activeConversation.meta.title || 'chat')
			.replace(/[\\/:*?"<>|#^[\]]/g, '')
			.trim()
			.slice(0, 60) || 'chat';
		const stamp = new Date(message.createdAtTimestamp || Date.now())
			.toISOString()
			.replace(/[:.]/g, '-');
		const fileNameWithExt = `${titleSlug} — ${stamp}.md`;
		const front =
			`---\n` +
			`source: Peak Chat\n` +
			`conversation_id: ${activeConversation.meta.id}\n` +
			`message_id: ${message.id}\n` +
			`model: ${message.model ?? ''}\n` +
			`provider: ${message.provider ?? ''}\n` +
			`saved_at: ${new Date().toISOString()}\n` +
			`---\n\n`;
		const body = String(message.content ?? '');
		try {
			const path = await chatVaultWriter.saveChatMessageToFolder(folderRaw, fileNameWithExt, front + body);

			// Best-effort telemetry — failure here must NOT block UX.
			try {
				await UsageOutcomeService.getInstance().recordVaultSave(
					message.id,
					activeConversation.meta.id,
					path,
				);
			} catch (telemetryErr) {
				console.warn('[MessageItemRetained] recordVaultSave failed:', telemetryErr);
			}

			new Notice(strings.message.vaultSaveSuccess);
		} catch (err) {
			console.error('[MessageItemRetained] Save to vault failed:', err);
			new Notice(strings.message.vaultSaveFailed);
		}
	}, [activeConversation, chatVaultWriter, message.id, message.content, message.model, message.provider, message.createdAtTimestamp, strings.message.vaultSaveDefaultFolder, strings.message.vaultSaveSuccess, strings.message.vaultSaveFailed]);

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

	/*
	 * Head meta — assembled from two sources so the row stays populated even
	 * after streaming ends:
	 *   • streamingState.currentToolCalls — live count during agent runs
	 *   • message.toolCalls.length — persisted count read from the saved
	 *     ChatMessage (LLM parsed it back out of the markdown on load)
	 *   • message.tokenUsage — totalTokens persisted alongside the message
	 *   • message.genTimeMs — generation duration in ms (assistant only)
	 *
	 * Previously the row was only populated from `streamingState`, so once
	 * the stream finalised and the streamingState was reset, the row went
	 * empty (see Image 2 in the 2026-06-02 chat audit). Reading from the
	 * persisted message fields keeps the head consistent across reloads.
	 */
	const toolCount =
		streamingState.currentToolCalls.length > 0
			? streamingState.currentToolCalls.length
			: (message.toolCalls?.length ?? 0);

	const durationMs = message.genTimeMs ?? 0;

	const inlineHeadMeta: string[] = [];
	if (toolCount > 0) {
		inlineHeadMeta.push(
			`${toolCount} ${
				toolCount === 1
					? strings.message.toolsSingular
					: strings.message.toolsPlural
			}`
		);
	}
	if (tokenCount != null && tokenCount > 0) {
		// k-format large counts for compactness (1234 → "1.2k").
		const tokenDisplay =
			tokenCount >= 1000
				? `${(tokenCount / 1000).toFixed(1).replace(/\.0$/, '')}k`
				: String(tokenCount);
		inlineHeadMeta.push(`${tokenDisplay} ${strings.message.tokensSuffix}`);
	}
	if (durationMs > 0) {
		// Show as `8.4s` for sub-minute durations, `2m 14s` beyond.
		const secs = durationMs / 1000;
		const durStr =
			secs < 60
				? `${secs.toFixed(1)}s`
				: `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
		inlineHeadMeta.push(durStr);
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
					<div className="pkchat-msg__name">{strings.message.youName}</div>
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
				<div className="pkchat-msg__name">{strings.message.assistantName}</div>
				{/*
				  Agent badge: shown whenever the message had tool calls (which
				  only happens in agent runs). Heuristic — no `runMode` field is
				  persisted on the message yet, but tool-call presence is a
				  reliable proxy. When/if runMode lands, swap this condition.
				*/}
				{toolCount > 0 && (
					<Chip variant="accent" className="pkchat-msg__mode-badge">
						{strings.composer.runChipModeAgent}
					</Chip>
				)}
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

			{/*
			  Inline receipt slot — Usage Dashboard worktree (or any consumer)
			  may register a renderer via `registerMessageReceiptRenderer` to
			  attach a cost/duration/feedback strip under the message body.
			  `usageLogId` is left `null` until the chat-side metadata-write
			  plumbing lifts the PK through `chat_messages` (PR-Chat-4 §11.6
			  notes this gap).
			*/}
			{ReceiptRenderer && activeConversation && !streamingState.isStreaming && (
				<div className="pkchat-msg__receipt-slot">
					{ReceiptRenderer({
						messageId: message.id,
						sessionId: activeConversation.meta.id,
						usageLogId: null,
					})}
				</div>
			)}

			{isLastMessage && !streamingState.isStreaming && !message.isErrorMessage && (
				<CapabilitySuggestion message={message} />
			)}

			{!streamingState.isStreaming && (
				<div className="pkchat-msg__meta-row">
					{modelChipText && (
						<Chip variant="accent" className="pkchat-msg__model-chip">
							{modelChipText}
						</Chip>
					)}
					{timestampText && <span>{timestampText}</span>}
					{(modelChipText || timestampText) && <span className="pkchat-msg__sep">·</span>}

					<button
						type="button"
						className="pkchat-msg__action"
						onClick={handleCopy}
						title={copied ? strings.message.copiedLabel : strings.message.copyLabel}
					>
						{copied ? <Check /> : <Copy />}
						<span>{copied ? strings.message.copiedLabel : strings.message.copyLabel}</span>
					</button>

					<button
						type="button"
						className="pkchat-msg__action"
						onClick={handleRegenerate}
						title={strings.message.regenerateLabel}
					>
						<RefreshCw />
						<span>{strings.message.regenerateLabel}</span>
					</button>

					<button
						type="button"
						className="pkchat-msg__action"
						onClick={handleToggleStar}
						title={
							message.starred
								? strings.message.unstarLabel
								: strings.message.starLabel
						}
					>
						<Star
							className={cn(message.starred && 'pktw-fill-current pktw-text-red-500')}
						/>
						<span>
							{message.starred
								? strings.message.unstarLabel
								: strings.message.starLabel}
						</span>
					</button>

					<button
						type="button"
						className="pkchat-msg__action"
						onClick={handleBranch}
						title={strings.message.branchLabel}
					>
						<GitBranch />
						<span>{strings.message.branchLabel}</span>
					</button>

					<MessageMorePopover
						onViewRaw={() => setShowRawModal(true)}
						onCopyMarkdown={handleCopy}
						onCopyJson={handleCopyJson}
						onSaveToVault={handleSaveToVault}
						onReplyInline={() => setShowInlineFollowup(true)}
					/>
				</div>
			)}

			{isLastMessage && !streamingState.isStreaming && !message.isErrorMessage && (
				<MessageSuggestedNext
					suggestions={message.suggestedFollowups}
					onSelect={(q) => {
						const submit = useChatViewStore.getState().submitAction;
						if (submit) submit(q);
					}}
					onSaveToNote={handleSaveToVault}
					onAskCustom={() => setShowInlineFollowup(true)}
					/*
					 * MIGRATION-DEFERRED: Rewrite-simply / Create-checklist /
					 * Open-related-notes ACTIONS rows. Need a service-layer entry
					 * point — `manager.actions.rewriteSimply(messageId)`,
					 * `manager.actions.createChecklist(messageId)`, and a
					 * vault-search query derived from the assistant content.
					 * Slots in MessageSuggestedNext render only when their handler
					 * is supplied, so omitting them here keeps the popover honest
					 * until the wiring lands.
					 */
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
							openSettings();
						}}
					>
						{strings.message.openSettingsLabel}
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
					<Modal.Title>{strings.message.viewRawTitle}</Modal.Title>
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
