import { useState, useCallback, useEffect } from 'react';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore, ViewMode, ChatTag } from '../store/chatViewStore';
import { DEFAULT_NEW_CONVERSATION_TITLE } from '@/core/constant';
import { useComposerStore } from '../store/composerStore';
import { useChatSubmit } from './useChatSubmit';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { draftKeyForConversation, emptySourceScope, type TurnSourceScope } from '@/core/types/chat-studio';
import { providerKindForProfile } from '@/ui/component/model-picker/modelPickerData';
import type { PromptInputMessage } from '@/ui/component/prompt-input';

const PLAN_WORKFLOW_ID = 'plan';

/**
 * Submission orchestration for the single Composer (chat-studio §8).
 *
 * Builds the outgoing turn from the active draft (workflow prefix, explicit
 * refs, reply anchor, revision marker, source scope), clears CONTENT fields
 * only after a successful send (failures keep the draft, §12.0), and binds
 * new/project draft overrides to the conversation created by the first send.
 */
export function useInputSubmit() {
	const [isSending, setIsSending] = useState(false);
	const { manager } = useServiceContext();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const activeProject = useChatDataStore((s) => s.activeProject);
	const isStreaming = useChatDataStore((s) => s.streamingMessageId !== null);

	const { submitMessage, cancelStream } = useChatSubmit();

	// Bridge: expose submitAction so external triggers (StyleButtons, QuickActions) can submit
	useEffect(() => {
		const action = (text: string) => {
			const conv = useChatDataStore.getState().activeConversation;
			const project = useChatDataStore.getState().activeProject;
			if (conv) {
				void submitMessage({ text, files: [], conversation: conv, project });
			}
		};
		useChatViewStore.getState().setSubmitAction(action);
		return () => useChatViewStore.getState().setSubmitAction(null);
	}, [submitMessage]);

	const handleSubmit = useCallback(async (message: PromptInputMessage) => {
		const composer = useComposerStore.getState();
		const draftKey = composer.activeKey;
		const draft = composer.getDraft(draftKey);

		const hasDraftContext = draft.explicitRefs.length > 0 || draft.workflowId !== null;
		if (!message.text.trim() && message.files.length === 0 && !hasDraftContext) return;
		if (isSending) return;
		setIsSending(true);

		// Workflow chip → per-message intent prefix consumed by the service
		// layer (only `plan` exists today; the palette lists real workflows only).
		let text = message.text;
		if (draft.workflowId === PLAN_WORKFLOW_ID && !/^\s*\/plan\b/i.test(text)) {
			text = `/plan ${text}`;
		}

		// Project home first send (F2): no conversation and no pending yet —
		// stage a pending conversation inside the project so ensureConversation
		// creates it there and the view lands on the new project conversation.
		const view = useChatViewStore.getState();
		let effectiveProject = activeProject;
		if (!activeConversation && !view.pendingConversation
			&& view.viewMode === ViewMode.PROJECT_OVERVIEW && view.projectForOverview) {
			effectiveProject = view.projectForOverview;
			view.setPendingConversation({ title: DEFAULT_NEW_CONVERSATION_TITLE, project: effectiveProject });
		}

		const vaultAvailable = manager.conv.isVaultSearchAvailable();
		const requestedSources: TurnSourceScope = {
			...emptySourceScope(effectiveProject?.meta.id ?? null),
			vaultSearch: draft.vaultSearch && vaultAvailable,
			webSearch: draft.webSearch,
			explicitRefs: draft.explicitRefs,
		};

		try {
			const conversation = await submitMessage({
				text,
				files: message.files,
				conversation: activeConversation,
				project: effectiveProject,
				explicitRefs: draft.explicitRefs,
				replyToMessageId: draft.replyAnchor?.messageId,
				revisionOfMessageId: draft.revisionOfMessageId ?? undefined,
				workflowId: draft.workflowId ?? undefined,
				requestedSources,
			});

			if (conversation) {
				// First send from a new/project draft: bind draft overrides to
				// the created conversation and carry switch state to its key.
				const convKey = draftKeyForConversation(conversation.meta.id);
				if (draftKey !== convKey) {
					if (draft.modelOverride) {
						// Mirror Composer.onModelSelect: a fixed selection must also
						// write the legacy provider kind, or service-conversation
						// falls back to storing the opaque profileId in activeProvider
						// and later provider resolution / hydration breaks (FIX 1).
						const legacyProvider = draft.modelOverride.mode === 'fixed'
							? providerKindForProfile(draft.modelOverride.profileId)
							: undefined;
						await manager.conv.updateConversationModelSelection({
							conversationId: conversation.meta.id,
							selection: draft.modelOverride,
							legacyProvider,
						});
					}
					if (draft.assistantOverride) {
						await manager.conv.updateConversationAssistant({
							conversationId: conversation.meta.id,
							assistantId: draft.assistantOverride,
						});
					}
					composer.updateDraft({ vaultSearch: draft.vaultSearch, webSearch: draft.webSearch }, convKey);
				}
				// Success: clear CONTENT fields only; switches/overrides stay
				// on their key per the §12.0 reset matrix.
				composer.updateDraft({
					text: '',
					explicitRefs: [],
					replyAnchor: null,
					workflowId: null,
					revisionOfMessageId: null,
				}, draftKey);
			}
		} catch (error) {
			// Failure keeps the draft (text/attachments/refs) for retry.
			// Rethrow so PromptInput's success-clear does NOT run (§12.0).
			console.error('[useInputSubmit] handleSubmit error:', error);
			throw error;
		} finally {
			setIsSending(false);
		}
	}, [submitMessage, activeConversation, activeProject, isSending, manager]);

	const handleCancelStream = useCallback(async () => {
		if (isStreaming) {
			await cancelStream();
			setIsSending(false);
		}
	}, [isStreaming, cancelStream]);

	const handleTextChange = useCallback((_text: string, tags: ChatTag[]) => {
		useChatViewStore.getState().setCurrentInputTags(tags);
	}, []);

	const status: 'ready' | 'submitted' | 'streaming' = isStreaming
		? 'streaming'
		: (isSending ? 'submitted' : 'ready');

	return {
		isSending,
		isStreaming,
		status,
		handleSubmit,
		handleCancelStream,
		handleTextChange,
	};
}
