/**
 * MessageViewItem — document-style message rendering (chat-studio §7.3–7.8).
 *
 * Track D rewrite: consumes the shared `messageActionRegistry` and the
 * artifact receipt slot. Identity is calm-by-default (no avatar / no name
 * header for the default assistant); a small identity chip appears only
 * when the conversation has a non-default assistant OR the model attribution
 * changes from the previous assistant message.
 *
 * Nothing renders an inline composer under a message any more (spec §15).
 * Targeted follow-up / suggested-next chips route to the single main
 * Composer via `useComposerStore.setReplyAnchor + fillDraftText + requestComposerFocus`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { useDebugTraceCopy } from '@/ui/hooks/useDebugTraceCopy';
import { ChatMessage, ChatConversation } from '@/service/chat/types';
import { useChatViewStore } from '../../store/chatViewStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useStreamChat } from '../../hooks/useStreamChat';
import { ConversationUpdatedEvent } from '@/core/eventBus';
import { useChatNavigation } from '@/ui/view/chat-view/useChatNavigation';
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from '@/ui/component/ai-elements';
import {
	Chip,
	Modal,
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverItem,
} from '@/ui/components/primitives';
import { AnimatedSparkles, StreamdownIsolated } from '@/ui/component/mine';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { formatTimestampLocale } from '@/core/utils/date-utils';
import { MessageAttachmentsList } from './MessageAttachmentsList';
import { ToolCallSummary } from '../ToolCallSummary';
import { CapabilitySuggestion } from './CapabilitySuggestion';
import { MessageStatusIndicator } from './MessageStatusIndicator';
import { MessageSuggestedNext } from './MessageSuggestedNext';
import { MessageMorePopover } from './MessageMorePopover';
import { ArtifactReceiptCard, getArtifactReceiptLayout } from './ArtifactReceiptCard';
import { useChatStrings } from '../../chatStringsContext';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import { getMessageReceiptRenderer } from '../../integration/messageReceiptSlot';
import { Notice } from 'obsidian';
import { useComposerStore } from '../../store/composerStore';
import { useComposerEditImageStore } from '../../store/composerEditImageStore';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import { resolveConfigureTab } from '@/service/media/mediaSettingsOverlay';
import type { ChatStudioStrings } from '../../chatStudioStrings';
import {
	computeActionLayout,
	getApplicableActions,
	type MessageActionContext,
	type MessageActionDefinition,
} from '../../actions/messageActionRegistry';
import { collectVariantGroup } from '@/core/types/chat-message-variants';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type { ChatAssistantDefinition } from '@/core/types/chat-studio';

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

export interface MessageItemProps {
	message: ChatMessage;
	streamingState?: StreamingState;
	isLastMessage?: boolean;
	models?: ModelInfoForSwitch[];
	/** Prior assistant message (for model-attribution identity — MSG-01). */
	previousAssistantMessage?: ChatMessage;
}

// ── Module cache: assistant name lookup ──────────────────────────────────────
const assistantNameCache = new Map<string, string>();

// ── Short clock-time formatter (MSG / M3) ────────────────────────────────────
// Message rows show only the wall-clock time (mock `.message-time` → "11:20");
// the calendar day is carried by the date-separator, and the full localized
// timestamp stays available on the `title` hover. 24h, user locale.
function formatTimeShort(timestamp: number): string {
	try {
		return new Date(timestamp).toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
		});
	} catch {
		return '';
	}
}

// ── Short model label (MSG / M4) ─────────────────────────────────────────────
// Mock `.model-chip` shows only the model short name ("gpt-5"), not the provider
// prefix or the full catalog id (OpenRouter ids embed a second `openai/` path
// segment → three ugly segments). Prefer the catalog displayName; fall back to
// the last path segment. Full `provider/model` stays on the `title` hover.
function resolveModelShortName(
	model: string | undefined,
	provider: string | undefined,
	models: ModelInfoForSwitch[] | undefined,
): { label: string; title: string } | null {
	if (!model) return null;
	const display = models?.find((m) => m.id === model)?.displayName;
	const label = display || model.split('/').pop() || model;
	const title = provider ? `${provider}/${model}` : model;
	return { label, title };
}

// ── Reasoning disclosure copy (MSG / M7) ─────────────────────────────────────
// `.reasoning-row` is a compact inline disclosure: <strong>Analysis</strong> +
// <small> status. We inject that structure through ReasoningTrigger's
// `getThinkingMessage` slot so the copy remains config-driven and the completed,
// timed, and streaming states share one stable visual rhythm. The disclosure chrome is owned by
// `.pkchat-reasoning-row`.
function buildReasoningMessage(studioStrings: ChatStudioStrings) {
	return (isStreaming: boolean, duration?: number): React.ReactNode => {
		const m = studioStrings.messages;
		let sub: string;
		if (isStreaming) sub = m.reasoningStreaming;
		else if (typeof duration === 'number' && duration > 0) sub = `${duration}${m.reasoningDurationSuffix}`;
		else sub = m.reasoningHint;
		return (
			<span className="pkchat-reasoning-row__text">
				<strong>{m.reasoningTitle}</strong>
				{sub && <small>{sub}</small>}
			</span>
		);
	};
}

export const MessageViewItem: React.FC<MessageItemProps> = ({
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
	previousAssistantMessage,
	models,
}) => {
	const strings = useChatStrings();
	const studioStrings = useChatStudioStrings();
	const { manager, eventBus, chatVaultWriter, settingsActions, usageServices, vaultNavigation } =
		useServiceContext();
	const chatNavigation = useChatNavigation();
	const openSettings = settingsActions.openSettings;
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const activeProject = useChatDataStore((s) => s.activeProject);
	// E2 R1#1: while the harness is paused on a permission ask, the
	// streaming assistant message should visibly say "Permission required"
	// instead of remaining stuck on the "Generating" spinner (the stream
	// paused; nothing new is arriving). We overlay the run-status onto the
	// message.status only for the streaming message on which the ask fired.
	// See useStreamChat.ts:411 for the source.
	const runStatus = useChatDataStore((s) => s.runStatus);

	const [copied, setCopied] = useState(false);
	const [showRawModal, setShowRawModal] = useState(false);
	const [saveReceipt, setSaveReceipt] = useState<{ path: string } | null>(null);
	const [assistantIdentity, setAssistantIdentity] = useState<ChatAssistantDefinition | null>(null);

	const ReceiptRenderer = getMessageReceiptRenderer();

	const isUser = message.role === 'user';

	// ── Assistant identity resolution (MSG-01, §7.3) ──────────────────────
	useEffect(() => {
		if (isUser) return;
		const assistantId = activeConversation?.meta.assistantId;
		if (!assistantId || assistantId === 'default') {
			setAssistantIdentity(null);
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const cached = assistantNameCache.get(assistantId);
				if (cached) {
					if (!cancelled) setAssistantIdentity({ id: assistantId, name: cached } as ChatAssistantDefinition);
				}
				const def = await manager.assistant.get(assistantId);
				if (cancelled) return;
				if (def) {
					assistantNameCache.set(def.id, def.name);
					setAssistantIdentity(def);
				}
			} catch {
				/* identity is decorative; ignore lookup errors */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [isUser, activeConversation?.meta.assistantId, manager]);

	// ── Copy helpers ──────────────────────────────────────────────────────
	const copyText = useCallback(async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
			return true;
		} catch (err) {
			console.error('[MessageItem] Copy failed:', err);
			return false;
		}
	}, []);

	const copyDebugTrace = useDebugTraceCopy();

	// ── Star ──────────────────────────────────────────────────────────────
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

	// ── Regenerate (MSG-08: produces a real variant, not a duplicate) ─────
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
			// 1. Deactivate the old assistant answer + reserve a variant slot
			//    for the new one. Persists to sqlite so a reload after retry
			//    sees the correct active-variant path immediately.
			const variantSlot = await manager.conv.prepareRetryVariant({
				conversationId: activeConversation.meta.id,
				previousAssistantMessageId: assistantMessage.id,
			});
			// 2. Reflect the deactivation in the in-memory conversation so
			//    the LLM request built from `conversationContext` below and
			//    the UI switcher rendered on the old bubble both see the new
			//    state without waiting for the next reload.
			const messagesWithGroup: ChatMessage[] = activeConversation.messages.map((m) => {
				if (m.id !== assistantMessage.id) return m;
				return {
					...m,
					variantGroupId: variantSlot.variantGroupId,
					variantIndex: m.variantIndex ?? 0,
					isActiveVariant: false,
				};
			});
			useChatViewStore.getState().setConversation({ ...activeConversation, messages: messagesWithGroup });
			useChatDataStore.getState().setActiveConversation({ ...activeConversation, messages: messagesWithGroup });

			// 3. Rebuild history WITHOUT the deactivated variant. The active
			//    variant filter in service-conversation trims it anyway, but
			//    slicing before the old assistant keeps the context minimal.
			const conversationContext: ChatConversation = {
				...activeConversation,
				messages: messagesWithGroup.slice(0, userMessageIndex + 1),
			};
			const streamResult = await streamChat({
				conversation: conversationContext,
				project: activeProject,
				userContent: userMessage.content,
			});
			if (streamResult.finalMessage) {
				// 4. Stamp the variant fields onto the new assistant answer
				//    BEFORE persistence so meta_json captures the group.
				const variantMessage: ChatMessage = {
					...streamResult.finalMessage,
					variantGroupId: variantSlot.variantGroupId,
					variantIndex: variantSlot.variantIndex,
					isActiveVariant: true,
				};
				await manager.conv.addMessage({
					conversationId: activeConversation.meta.id,
					message: variantMessage,
					model: variantMessage.model,
					provider: variantMessage.provider,
					usage: streamResult.finalUsage ?? { inputTokens: -1, outputTokens: -1, totalTokens: -1 },
				});
			}
		} catch (err) {
			console.error('[MessageItem] Regenerate failed:', err);
			new Notice(strings.message.retryFailed ?? 'Retry failed');
		}
	}, [activeConversation, activeProject, streamChat, manager, message.id, strings.message]);

	// ── Save to Vault (with inline receipt, §7.7) ─────────────────────────
	const handleSaveToVault = useCallback(async (): Promise<string | null> => {
		if (!activeConversation) return null;
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
			try {
				await usageServices?.outcome.recordVaultSave(
					message.id,
					activeConversation.meta.id,
					path,
				);
			} catch (telemetryErr) {
				console.warn('[MessageItem] recordVaultSave failed:', telemetryErr);
			}
			setSaveReceipt({ path });
			// RUN-06 / F5: a vault save is a REAL artifact producer — persist a
			// ChatArtifactReceipt so the right-index Resources and the project
			// Resources tab can recover it after reload. Fire-and-forget.
			void manager.conv.saveArtifactReceipt({
				artifactId: `vault-save-${message.id}`,
				runId: message.debugRunId ?? `manual-save-${message.id}`,
				messageId: message.id,
				conversationId: activeConversation.meta.id,
				projectId: activeConversation.meta.projectId,
				direction: 'generated',
				kind: 'document',
				title: fileNameWithExt,
				vaultPath: path,
				state: 'saved',
				availableActions: ['open'],
				createdAt: Date.now(),
			}).catch((receiptErr) => {
				console.warn('[MessageItem] saveArtifactReceipt failed:', receiptErr);
			});
			new Notice(strings.message.vaultSaveSuccess);
			return path;
		} catch (err) {
			console.error('[MessageItem] Save to vault failed:', err);
			new Notice(strings.message.vaultSaveFailed);
			return null;
		}
	}, [
		activeConversation,
		chatVaultWriter,
		manager,
		message.id,
		message.content,
		message.model,
		message.provider,
		message.debugRunId,
		message.createdAtTimestamp,
		strings.message.vaultSaveDefaultFolder,
		strings.message.vaultSaveSuccess,
		strings.message.vaultSaveFailed,
		usageServices,
	]);

	// ── Branch ────────────────────────────────────────────────────────────
	const handleBranch = useCallback(async () => {
		if (!activeConversation) return;
		try {
			const branchedConv = await manager.conv.branchFromMessage({
				sourceConversation: activeConversation,
				messageId: message.id,
				project: activeProject?.meta ?? null,
			});
			await chatNavigation.openConversationInChat(branchedConv, {
				loadMessages: false,
			});
		} catch (err) {
			console.error('[MessageItem] Branch failed:', err);
		}
	}, [activeConversation, activeProject, manager, chatNavigation, message.id]);

	// ── Composer bridge: targeted follow-up / edit-and-resend ─────────────
	const requestReplyToMessage = useCallback(() => {
		const store = useComposerStore.getState();
		const preview = String(message.content ?? '').trim().slice(0, 80);
		store.setReplyAnchor({
			messageId: message.id,
			preview: preview || studioStrings.messages.replyAnchorFallback,
		});
		store.requestComposerFocus();
	}, [message.id, message.content, studioStrings.messages.replyAnchorFallback]);

	const requestEditResend = useCallback(() => {
		const store = useComposerStore.getState();
		store.updateDraft({ text: String(message.content ?? ''), revisionOfMessageId: message.id });
		store.requestComposerFocus();
	}, [message.id, message.content]);

	// ── Build the action registry context ─────────────────────────────────
	const actionCtx = useMemo<MessageActionContext>(() => ({
		message,
		copyText,
		openTraceSurface: (_runId: string) => {
			// MSG-07: routes to the inline AgentTrace anchored on THIS
			// message. ToolCallSummary subscribes to the chatViewStore
			// signal, expands its trace section, and scrolls into view.
			// The runId argument is kept in the signature for symmetry with
			// `copyDebugTrace` but is not needed here — the message id is
			// the addressable anchor and `debugRun` is already looked up
			// from `manager.conv.getDebugRun(message.debugRunId)` above.
			useChatViewStore.getState().requestOpenTraceForMessage(message.id);
		},
		copyDebugTrace: async (runId: string) => {
			await copyDebugTrace(runId);
		},
		toggleStar: handleToggleStar,
		regenerate: handleRegenerate,
		branch: handleBranch,
		saveToVault: async () => handleSaveToVault(),
		openRawModal: () => setShowRawModal(true),
		requestReplyToMessage,
		requestEditResend,
	}), [
		message,
		copyText,
		copyDebugTrace,
		handleToggleStar,
		handleRegenerate,
		handleBranch,
		handleSaveToVault,
		requestReplyToMessage,
		requestEditResend,
	]);

	// ── Meta row derived bits ─────────────────────────────────────────────
	const modelChip = useMemo(
		() => resolveModelShortName(message.model, message.provider, models),
		[message.model, message.provider, models],
	);
	const modelChipText = modelChip?.label ?? null;
	const modelChipTitle = modelChip?.title ?? undefined;

	const timestampText = useMemo(() => {
		if (!message.createdAtTimestamp) return null;
		return formatTimeShort(message.createdAtTimestamp);
	}, [message.createdAtTimestamp]);

	// Full localized timestamp kept for the `title` hover only (M3).
	const timestampTitle = useMemo(() => {
		if (!message.createdAtTimestamp) return undefined;
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

	const durationMs = message.genTimeMs ?? 0;

	const agentRunMeta: string[] = [];
	if (tokenCount != null && tokenCount > 0) {
		const tokenDisplay =
			tokenCount >= 1000
				? `${(tokenCount / 1000).toFixed(1).replace(/\.0$/, '')}k`
				: String(tokenCount);
		agentRunMeta.push(`${tokenDisplay} ${strings.message.tokensSuffix}`);
	}
	if (durationMs > 0) {
		const secs = durationMs / 1000;
		const durStr =
			secs < 60 ? `${secs.toFixed(1)}s` : `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
		agentRunMeta.push(durStr);
	}

	const debugRun = useMemo(() => {
		if (!message.debugRunId) return undefined;
		return manager.conv.getDebugRun(message.debugRunId);
	}, [manager, message.debugRunId, streamingState.isStreaming, streamingState.currentToolCalls.length]);

	const shouldShowLoader =
		streamingState.isStreaming &&
		!message.content &&
		!streamingState.isReasoningActive &&
		!streamingState.isToolSequenceActive;
	const reasoningContent = streamingState.reasoningContent || message.reasoning?.content || '';
	const agentToolCalls = streamingState.currentToolCalls.length > 0
		? streamingState.currentToolCalls
		: message.toolCalls ?? [];

	// ── Identity chip (MSG-01) ────────────────────────────────────────────
	const showIdentityChip = !isUser && shouldShowIdentityChip({
		message,
		previousAssistantMessage,
		assistantIdentity,
	});

	// ── Artifact receipts (MSG-05) ────────────────────────────────────────
	const [artifactReceipts, setArtifactReceipts] = useState<ChatArtifactReceipt[]>([]);
	const reloadReceipts = useCallback(async () => {
		if (isUser) return;
		try {
			const receipts = await manager.conv.listArtifactReceiptsByMessage(message.id);
			setArtifactReceipts(receipts ?? []);
		} catch (err) {
			console.warn('[MessageItem] listArtifactReceiptsByMessage failed', err);
		}
	}, [isUser, message.id, manager]);
	useEffect(() => {
		if (isUser) return;
		let cancelled = false;
		const load = async () => {
			try {
				const receipts = await manager.conv.listArtifactReceiptsByMessage(message.id);
				if (!cancelled) setArtifactReceipts(receipts ?? []);
			} catch (err) {
				console.warn('[MessageItem] listArtifactReceiptsByMessage failed', err);
			}
		};
		void load();
		// Refresh when streaming completes for this message.
		return () => {
			cancelled = true;
		};
	}, [isUser, message.id, streamingState.isStreaming, manager]);
	// D2 §R1 UI observation: subscribe to `media-job-updated` events the
	// MediaJobRunner publishes on every job state change. When the event
	// targets this message (or has no messageId — meaning the runner does
	// not know the ownership yet, e.g. post-resume), reload receipts.
	// This is the minimum-noise observation channel — no parallel store.
	useEffect(() => {
		if (isUser) return;
		const unsub = useUIEventStore.subscribe((state) => {
			const event = state.lastEvent;
			if (!event || event.type !== 'media-job-updated') return;
			const targetMessageId = (event.payload as { messageId?: string } | undefined)?.messageId;
			if (targetMessageId && targetMessageId !== message.id) return;
			void reloadReceipts();
		});
		return () => unsub();
	}, [isUser, message.id, reloadReceipts]);

	// ── User render ──────────────────────────────────────────────────────
	if (isUser) {
		return (
			<UserMessageBody
				message={message}
				actionCtx={actionCtx}
				studioStrings={studioStrings}
			/>
		);
	}

	// ── Assistant render ─────────────────────────────────────────────────
	const applicable = getApplicableActions(message);
	const visualArtifactReceipts = artifactReceipts.filter((receipt) => getArtifactReceiptLayout(receipt) === 'visual');
	const supportingArtifactReceipts = artifactReceipts.filter((receipt) => getArtifactReceiptLayout(receipt) !== 'visual');
	const artifactLayout = visualArtifactReceipts.length > 1
		? 'gallery'
		: visualArtifactReceipts.length > 0 && supportingArtifactReceipts.length > 0
		? 'split'
		: visualArtifactReceipts.length > 0 ? 'visual-only' : 'list-only';
	const renderArtifactReceipt = (receipt: ChatArtifactReceipt) => {
		// Zero-gap §4 A1 — inject the UI-only `insert-as-reference` action
		// on saved image receipts so the Composer Edit form can be pre-filled
		// from the card. Never persist this into the sink; it is a render-
		// time affordance.
		const canInsertAsReference =
			receipt.kind === 'image' && receipt.state === 'saved' && Boolean(receipt.vaultPath);
		const decoratedReceipt = canInsertAsReference && !receipt.availableActions.includes('insert-as-reference')
			? { ...receipt, availableActions: [...receipt.availableActions, 'insert-as-reference' as const] }
			: receipt;
		return (
		<ArtifactReceiptCard
			key={receipt.artifactId}
			receipt={decoratedReceipt}
			galleryReceipts={visualArtifactReceipts}
			handlers={{
				open: (rc) => {
					if (rc.vaultPath) void vaultNavigation.openVaultPath(rc.vaultPath);
					else if (rc.externalUri) vaultNavigation.openExternalUrl(rc.externalUri);
				},
				copy: (rc) => {
					if (rc.preview?.text) void copyText(rc.preview.text);
					else if (rc.uri) void copyText(rc.uri);
				},
				retry: () => void handleRegenerate(),
				confirm: (rc) => {
					const svc = manager.conv.getMediaGenerationService();
					const jobId = (rc as ChatArtifactReceipt & { media?: { jobId?: string } }).media?.jobId;
					if (!svc || !jobId) return;
					void svc.confirmJob(jobId).catch((err) => {
						new Notice(`Media confirm failed: ${err instanceof Error ? err.message : String(err)}`);
					});
				},
				cancel: (rc) => {
					const svc = manager.conv.getMediaGenerationService();
					const jobId = (rc as ChatArtifactReceipt & { media?: { jobId?: string } }).media?.jobId;
					if (!svc || !jobId) return;
					void svc.cancelJob(jobId, 'user-cancelled').catch((err) => {
						new Notice(`Media cancel failed: ${err instanceof Error ? err.message : String(err)}`);
					});
				},
				configure: (rc) => {
					// Task E1 §R2 — jump into the settings tab named by the
					// receipt's configureAction (via the shared mediaSettingsOverlay
					// lookup). Falls back to the Media Generation tab when the
					// receipt does not carry a hint.
					const media = (rc as ChatArtifactReceipt & { media?: { configureAction?: string } }).media;
					const tab = resolveConfigureTab(media?.configureAction);
					settingsActions.openSettings({ tab });
				},
				'insert-as-reference': (rc) => {
					// Zero-gap §4 A1 — hand the receipt to the Edit Composer form.
					if (!rc.vaultPath) return;
					useComposerEditImageStore.getState().requestOpen({
						base: {
							sourceType: 'receipt',
							ref: rc.artifactId,
							label: rc.title,
							mimeType: rc.contentType,
						},
					});
				},
			}}
		/>
		);
	};
	// UI measures width in AssistantActionRow; here we just prepare data.
	return (
		<article
			className="pkchat-msg"
			data-message-id={message.id}
			data-message-role={message.role}
			data-variant-group={message.variantGroupId ?? undefined}
			data-variant-active={
				message.variantGroupId
					? message.isActiveVariant === true ? 'true' : 'false'
					: undefined
			}
		>
			{showIdentityChip && (
				<AssistantIdentityChip
					assistantName={assistantIdentity?.name}
					model={message.model}
					provider={message.provider}
				/>
			)}

			<div className="pkchat-msg__body">
				{reasoningContent && (
					<Reasoning
						isStreaming={streamingState.isReasoningActive}
						defaultOpen={streamingState.isStreaming}
						className="pkchat-reasoning pktw-w-full pktw-mb-0"
					>
						<ReasoningTrigger
							className="pkchat-reasoning-row"
							getThinkingMessage={buildReasoningMessage(studioStrings)}
						/>
						<ReasoningContent className="pkchat-reasoning-content">
							{reasoningContent}
						</ReasoningContent>
					</Reasoning>
				)}

				{(agentToolCalls.length > 0 || (debugRun && debugRun.spans.length > 0)) && (
					<ToolCallSummary
						toolCalls={agentToolCalls.map((call) => ({
							toolName: call.toolName,
							input: call.input,
							output: call.output,
							isActive: 'isActive' in call ? call.isActive ?? false : false,
						}))}
						isStreaming={streamingState.isStreaming}
						debugRun={debugRun}
						meta={agentRunMeta}
						messageId={message.id}
					/>
				)}

				{shouldShowLoader ? (
					<div className="pktw-flex pktw-items-center pktw-justify-start pktw-py-2">
						<div className="pktw-scale-50 pktw-origin-left">
							<AnimatedSparkles isAnimating={true} />
						</div>
					</div>
				) : null}

				{!shouldShowLoader && message.content ? (
					<StreamdownIsolated
						className="pktw-select-text"
						isAnimating={streamingState.isStreaming}
					>
						{String(message.content)}
					</StreamdownIsolated>
				) : null}
			</div>

			{message.resources && message.resources.length > 0 && (
				<MessageAttachmentsList message={message} align="start" />
			)}

			{artifactReceipts.length > 0 && (
				<div className="pkchat-msg__artifacts" data-layout={artifactLayout}>
					{visualArtifactReceipts.length > 0 && (
						<div className="pkchat-msg__artifact-media" data-count={visualArtifactReceipts.length}>
							{visualArtifactReceipts.map(renderArtifactReceipt)}
						</div>
					)}
					{supportingArtifactReceipts.length > 0 && (
						<div className="pkchat-msg__artifact-list">
							{supportingArtifactReceipts.map(renderArtifactReceipt)}
						</div>
					)}
				</div>
			)}

			{saveReceipt && (
				<div className="pkchat-msg__save-receipt">
					<span>{strings.message.vaultSaveSuccess}: {saveReceipt.path}</span>
					<button
						type="button"
						className="pkchat-msg__save-receipt-open"
						onClick={() => void vaultNavigation.openVaultPath(saveReceipt.path)}
						aria-label={studioStrings.messages.openSavedLabel}
					>
						{studioStrings.messages.openSavedLabel}
					</button>
				</div>
			)}

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
				<>
					<AssistantVariantSwitcher
						message={message}
						conversation={activeConversation}
						manager={manager}
						strings={strings}
					/>
					<AssistantActionRow
						message={message}
						actions={applicable}
						actionCtx={actionCtx}
						studioStrings={studioStrings}
						modelChipText={modelChipText}
						modelChipTitle={modelChipTitle}
						timestampText={timestampText}
						timestampTitle={timestampTitle}
						copied={copied}
					/>
				</>
			)}

			{isLastMessage && !streamingState.isStreaming && !message.isErrorMessage && (
				<MessageSuggestedNext
					message={message}
					suggestions={message.suggestedFollowups}
					studioStrings={studioStrings}
					onSaveToNote={() => void handleSaveToVault()}
				/>
			)}

			{showRawModal && (
				<RawMessageModal
					message={message}
					title={strings.message.viewRawTitle}
					onClose={() => setShowRawModal(false)}
				/>
			)}

			{message.isErrorMessage &&
				(message.content.includes('profile') ||
					message.content.includes('configured') ||
					message.content.includes('credentials')) && (
					<button
						type="button"
						className="pkchat-msg__action"
						onClick={() => openSettings()}
					>
						{strings.message.openSettingsLabel}
					</button>
				)}

			<MessageStatusIndicator
				status={
					// E2 R1#1: when the harness pauses on a permission ask,
					// overlay `waiting-permission` on the streaming assistant
					// message so the indicator reads "Permission required"
					// instead of the stale "Generating" spinner. Only applies
					// while the message is actively streaming — for saved
					// messages we render the persisted status verbatim.
					streamingState.isStreaming && runStatus === 'waiting-permission'
						? 'waiting-permission'
						: message.status
				}
				className="pktw-mt-1"
				onRetry={() => void handleRegenerate()}
				labels={{
					queued: studioStrings.messages.queuedLabel,
					permission: studioStrings.messages.permissionTitle,
					error: studioStrings.messages.errorLabel,
					cancelled: studioStrings.messages.cancelledLabel,
					timeout: studioStrings.messages.timeoutLabel,
					retry: studioStrings.messages.actionRetry,
				}}
			/>
		</article>
	);
};

// ── User message body (kept small — extract per ui-design conventions) ──────

const UserMessageBody: React.FC<{
	message: ChatMessage;
	actionCtx: MessageActionContext;
	studioStrings: ChatStudioStrings;
}> = ({ message, actionCtx, studioStrings }) => {
	const applicable = getApplicableActions(message);
	// Sub-actions (Copy Markdown / Copy JSON) surface in the Copy hover menu,
	// never as their own row/overflow entries.
	const persistent = applicable.filter((a) => a.persistent && !a.subOf);
	const overflow = applicable.filter((a) => !a.persistent && !a.subOf);
	// M5: the user bubble carries no chrome by default (mock `.user-message`
	// has no head / meta / action row). The action row still renders for
	// reachability (spec §7.7) but is hover-revealed via CSS — the calm bubble
	// is the resting state.
	return (
		<article
			className={cn('pkchat-msg', 'pkchat-msg--user')}
			data-message-id={message.id}
			data-message-role={message.role}
		>
			{message.resources && message.resources.length > 0 && (
				<MessageAttachmentsList message={message} align="end" />
			)}
			<div className="pkchat-msg__body">
				{message.content ? (
					<StreamdownIsolated className="pktw-select-text" isAnimating={false}>
						{String(message.content)}
					</StreamdownIsolated>
				) : null}
			</div>
			<div className="pkchat-msg__meta-row pkchat-msg__meta-row--user">
				{persistent.map((action) => (
					<ActionButton
						key={action.id}
						action={action}
						ctx={actionCtx}
						studioStrings={studioStrings}
						subActions={subActionsOf(applicable, action.id)}
					/>
				))}
				<MessageMorePopover overflow={overflow} ctx={actionCtx} studioStrings={studioStrings} />
			</div>
			<MessageStatusIndicator status={message.status} className="pktw-mt-1" />
		</article>
	);
};

// ── Assistant identity chip (MSG-01) ─────────────────────────────────────────

const AssistantIdentityChip: React.FC<{
	assistantName?: string | null;
	model?: string;
	provider?: string;
}> = ({ assistantName, model, provider }) => {
	const label = assistantName
		? assistantName
		: [provider, model].filter(Boolean).join('/');
	if (!label) return null;
	return (
		<div className="pkchat-msg__identity">
			<Chip variant="neutral" className="pkchat-msg__identity-chip">
				<span>{label}</span>
			</Chip>
		</div>
	);
};

/**
 * Show identity chip when:
 *   • conversation has a non-default assistantId (already fetched into
 *     `assistantIdentity`), OR
 *   • this message's provider/model differs from the previous assistant
 *     message's — model attribution change (§7.3).
 */
function shouldShowIdentityChip({
	message,
	previousAssistantMessage,
	assistantIdentity,
}: {
	message: ChatMessage;
	previousAssistantMessage?: ChatMessage;
	assistantIdentity: ChatAssistantDefinition | null;
}): boolean {
	if (assistantIdentity) return true;
	if (!previousAssistantMessage) return false;
	return (
		previousAssistantMessage.model !== message.model ||
		previousAssistantMessage.provider !== message.provider
	);
}

// ── Assistant action row — measured with ResizeObserver ──────────────────────

const MORE_TRIGGER_PX = 28;

const AssistantActionRow: React.FC<{
	message: ChatMessage;
	actions: MessageActionDefinition[];
	actionCtx: MessageActionContext;
	studioStrings: ChatStudioStrings;
	modelChipText: string | null;
	modelChipTitle?: string;
	timestampText: string | null;
	timestampTitle?: string;
	copied: boolean;
}> = ({ actions, actionCtx, studioStrings, modelChipText, modelChipTitle, timestampText, timestampTitle }) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [availableWidth, setAvailableWidth] = useState<number>(1200);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ownerWin = el.ownerDocument?.defaultView ?? window;
		const RO = (ownerWin as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
			?? (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver;
		if (!RO) return;
		const ro = new RO((entries: ResizeObserverEntry[]) => {
			for (const entry of entries) {
				setAvailableWidth(entry.contentRect.width);
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// M1: the row is nowrap (mock `.message-meta`) so over-inlining would clip.
	// Reserve the LEFT meta chunk (short model chip + short timestamp) AND the
	// persistent core buttons, then hand only the remaining width to the pure
	// adaptive-fit algorithm. `messageActionMinInlinePx` is the per-adaptive
	// width; `messageActionCorePx` is the (narrower) per-core reserve.
	const perActionPx = studioStrings.density.messageActionMinInlinePx || 92;
	const corePx = studioStrings.density.messageActionCorePx || 66;
	const persistentCount = actions.filter((a) => a.persistent).length;
	const leftMetaPx = (modelChipText ? 96 : 0) + (timestampText ? 52 : 0);
	const metaReservePx = leftMetaPx + persistentCount * corePx + 16;
	const usableWidth = Math.max(0, availableWidth - metaReservePx);
	const layout = computeActionLayout(usableWidth, actions, perActionPx, MORE_TRIGGER_PX);

	// N8: when even the labelled core buttons can't fit alongside the left meta,
	// drop the core to icon-only (mock `.is-compact-core`) rather than clipping.
	const COMPACT_CORE_PX = 28;
	const compact = availableWidth - leftMetaPx - MORE_TRIGGER_PX < persistentCount * COMPACT_CORE_PX;

	return (
		<div
			className={cn('pkchat-msg__meta-row', compact && 'pkchat-msg__meta-row--compact')}
			ref={containerRef}
		>
			{modelChipText && (
				<Chip variant="accent" className="pkchat-msg__model-chip" title={modelChipTitle}>
					{modelChipText}
				</Chip>
			)}
			{timestampText && (
				<span className="pkchat-msg__time" title={timestampTitle}>
					{timestampText}
				</span>
			)}

			{layout.inline.map((action) => (
				<ActionButton
					key={action.id}
					action={action}
					ctx={actionCtx}
					studioStrings={studioStrings}
					subActions={subActionsOf(actions, action.id)}
				/>
			))}
			<MessageMorePopover
				overflow={layout.overflow}
				ctx={actionCtx}
				studioStrings={studioStrings}
			/>
		</div>
	);
};

// ── Sub-actions helper ───────────────────────────────────────────────────────

/** Sub-actions (Copy Markdown / Copy JSON) hanging under a parent action id. */
function subActionsOf(
	applicable: MessageActionDefinition[],
	parentId: string,
): MessageActionDefinition[] {
	return applicable.filter((a) => a.subOf === parentId);
}

// ── Split action button with a hover sub-menu (Copy → Markdown / JSON) ────────
// The main button keeps its own click (copy plain text); hovering the whole
// control reveals the sub-actions in a popover anchored to the button. A short
// close delay lets the cursor cross the gap into the menu without dismissing.

const HOVER_CLOSE_MS = 140;
const COPIED_FEEDBACK_MS = 1600;

const ActionSplitButton: React.FC<{
	action: MessageActionDefinition;
	subActions: MessageActionDefinition[];
	ctx: MessageActionContext;
	studioStrings: ChatStudioStrings;
	label: string;
}> = ({ action, subActions, ctx, studioStrings, label }) => {
	const Icon = action.icon;
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const closeTimer = useRef<number | null>(null);
	const copiedTimer = useRef<number | null>(null);

	const cancelClose = () => {
		if (closeTimer.current == null) return;
		window.clearTimeout(closeTimer.current);
		closeTimer.current = null;
	};
	const scheduleClose = () => {
		cancelClose();
		closeTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
	};
	// Transient "Copied" confirmation, scoped to THIS copy control so it never
	// lights up when the user copies an artifact or a trace elsewhere.
	const flashCopied = () => {
		if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
		setCopied(true);
		copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
	};
	const runAndFlash = (fn: () => Promise<void> | void) => {
		void Promise.resolve(fn()).then(flashCopied);
	};
	useEffect(() => () => {
		cancelClose();
		if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
	}, []);

	const copiedLabel = studioStrings.messages.actionCopied;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverAnchor asChild>
				<span
					className="pkchat-msg__action-split"
					onMouseEnter={() => { cancelClose(); setOpen(true); }}
					onMouseLeave={scheduleClose}
				>
					<button
						type="button"
						className={cn(
							'pkchat-msg__action pkchat-msg__action-split__main',
							copied && 'pkchat-msg__action--copied',
						)}
						onClick={() => runAndFlash(() => action.execute(ctx))}
						title={copied ? copiedLabel : label}
						aria-label={copied ? copiedLabel : label}
					>
						{copied ? <Check /> : <Icon />}
						<span>{copied ? copiedLabel : label}</span>
						{!copied && <ChevronDown className="pkchat-msg__action-split__caret" aria-hidden="true" />}
					</button>
				</span>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				sideOffset={6}
				onOpenAutoFocus={(e) => e.preventDefault()}
				onMouseEnter={cancelClose}
				onMouseLeave={scheduleClose}
			>
				{subActions.map((sub) => {
					const SubIcon = sub.icon;
					const detail = sub.detail?.(studioStrings);
					return (
						<PopoverItem
							key={sub.id}
							className="pk-pop-item pkchat-msg-more-item"
							onClick={() => { setOpen(false); runAndFlash(() => sub.execute(ctx)); }}
						>
							<SubIcon />
							{detail ? (
								<span className="pkchat-msg-more-item__text">
									<strong>{sub.label(studioStrings)}</strong>
									<small>{detail}</small>
								</span>
							) : (
								<span>{sub.label(studioStrings)}</span>
							)}
						</PopoverItem>
					);
				})}
			</PopoverContent>
		</Popover>
	);
};

// ── Single action button ─────────────────────────────────────────────────────

const ActionButton: React.FC<{
	action: MessageActionDefinition;
	ctx: MessageActionContext;
	studioStrings: ChatStudioStrings;
	/** Sub-actions to reveal on hover (Copy → Markdown / JSON). */
	subActions?: MessageActionDefinition[];
}> = ({ action, ctx, studioStrings, subActions }) => {
	const Icon = action.icon;
	// Star toggles its label at render time based on message.starred state.
	const rawLabel = action.label(studioStrings);
	const label = action.id === 'star' && ctx.message.starred
		? studioStrings.messages.actionUnstar
		: rawLabel;
	const disabledReason = action.disabledReason?.(ctx.message, studioStrings) ?? null;
	const disabled = disabledReason != null;
	if (subActions && subActions.length > 0 && !disabled) {
		return (
			<ActionSplitButton
				action={action}
				subActions={subActions}
				ctx={ctx}
				studioStrings={studioStrings}
				label={label}
			/>
		);
	}
	return (
		<button
			type="button"
			className={cn(
				'pkchat-msg__action',
				!action.persistent && 'pkchat-msg__action--adaptive',
				disabled && 'pkchat-msg__action--disabled',
				action.id === 'star' && ctx.message.starred && 'pkchat-msg__action--starred',
			)}
			onClick={() => !disabled && void action.execute(ctx)}
			title={disabled ? disabledReason! : label}
			aria-label={label}
			aria-disabled={disabled}
			disabled={disabled}
		>
			<Icon className={ctx.message.starred && action.id === 'star' ? 'pktw-fill-current pktw-text-pk-error' : undefined} />
			<span>{label}</span>
		</button>
	);
};

// ── Assistant variant switcher (MSG-08) ─────────────────────────────────────
// Renders "‹ 2/3 ›" ONLY when this assistant message belongs to a variant
// group with more than one member — retried answers to the same user turn.
// Clicking a chevron flips `isActiveVariant` on the group via the service,
// which persists to sqlite and updates the in-memory conversation so the
// LLM history assembler picks the new active variant on the next turn.

const AssistantVariantSwitcher: React.FC<{
	message: ChatMessage;
	conversation: ChatConversation | null;
	manager: ReturnType<typeof useServiceContext>['manager'];
	strings: ReturnType<typeof useChatStrings>;
}> = ({ message, conversation, manager, strings }) => {
	if (!conversation) return null;
	if (!message.variantGroupId) return null;
	const group = collectVariantGroup(conversation.messages, message.id);
	if (group.length <= 1) return null;
	const sorted = [...group].sort((a, b) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0));
	const activeMember = sorted.find((m) => m.isActiveVariant === true) ?? sorted[sorted.length - 1];
	// We render the switcher on EVERY group member so users can navigate
	// past a specific answer even when it isn't the active one. Position is
	// derived from the sorted order.
	const currentIndex = sorted.findIndex((m) => m.id === message.id);
	if (currentIndex === -1) return null;

	const switchTo = async (target: ChatMessage) => {
		if (!target || target.isActiveVariant === true && target.id === activeMember.id) return;
		if (!message.variantGroupId) return;
		try {
			await manager.conv.setActiveVariant({
				conversationId: conversation.meta.id,
				variantGroupId: message.variantGroupId,
				activeMessageId: target.id,
			});
			// Reflect immediately in-memory — the store consumers see the
			// active flag flip before the next reload lands.
			const updatedMessages = conversation.messages.map((m) => {
				if (m.variantGroupId !== message.variantGroupId) return m;
				return { ...m, isActiveVariant: m.id === target.id };
			});
			const updatedConv = { ...conversation, messages: updatedMessages };
			useChatViewStore.getState().setConversation(updatedConv);
			useChatDataStore.getState().setActiveConversation(updatedConv);
		} catch (err) {
			console.error('[MessageItem] setActiveVariant failed:', err);
		}
	};

	const previous = currentIndex > 0 ? sorted[currentIndex - 1] : null;
	const next = currentIndex < sorted.length - 1 ? sorted[currentIndex + 1] : null;
	const total = sorted.length;
	const positionLabel = strings.message.variantSwitcherLabel
		.replace('{index}', String(currentIndex + 1))
		.replace('{total}', String(total));

	return (
		<div
			className="pkchat-msg__variant-switcher"
			role="group"
			aria-label={positionLabel}
			data-active={message.isActiveVariant === true ? 'true' : 'false'}
		>
			<button
				type="button"
				className="pkchat-msg__variant-nav"
				onClick={() => previous && void switchTo(previous)}
				disabled={!previous}
				aria-label={strings.message.variantPreviousLabel}
				title={strings.message.variantPreviousLabel}
			>
				<ChevronLeft />
			</button>
			<span className="pkchat-msg__variant-count">{positionLabel}</span>
			<button
				type="button"
				className="pkchat-msg__variant-nav"
				onClick={() => next && void switchTo(next)}
				disabled={!next}
				aria-label={strings.message.variantNextLabel}
				title={strings.message.variantNextLabel}
			>
				<ChevronRight />
			</button>
		</div>
	);
};

// ── Raw-message viewer modal ─────────────────────────────────────────────────

const RawMessageModal: React.FC<{ message: ChatMessage; title: string; onClose: () => void }> = ({
	message,
	title,
	onClose,
}) => {
	const raw = JSON.stringify(message, null, 2);
	return (
		<Modal open onOpenChange={(open) => { if (!open) onClose(); }}>
			<Modal.Content width="wide">
				<Modal.Header>
					<Modal.Title>{title}</Modal.Title>
					<Modal.Close />
				</Modal.Header>
				<Modal.Body>
					<pre
						className="pktw-m-0 pktw-max-h-[60vh] pktw-overflow-auto pktw-font-[family-name:var(--pk-font-mono)] pktw-text-pk-base pktw-bg-pk-surface-sunken pktw-p-pk-3 pktw-rounded-pk-sm pktw-whitespace-pre-wrap pktw-break-words"
					>
						{raw}
					</pre>
				</Modal.Body>
			</Modal.Content>
		</Modal>
	);
};
