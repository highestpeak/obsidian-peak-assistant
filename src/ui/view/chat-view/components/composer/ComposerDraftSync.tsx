import React, { useEffect, useRef } from 'react';
import { usePromptInputContext } from '@/ui/component/prompt-input';
import { useComposerStore } from '../../store/composerStore';
import { useChatViewStore, ViewMode } from '../../store/chatViewStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import {
	draftKeyForConversation,
	draftKeyForNew,
	draftKeyForProject,
	type ComposerDraftKey,
} from '@/core/types/chat-studio';
import { normalizeVaultReferenceDisplayText } from '@/ui/component/prompt-input/promptMenuSelection';

/**
 * ComposerDraftSync — the coordinator half of the single-owner Composer
 * (chat-studio §8.1 / COMP-01).
 *
 * Derives the active draft key from navigation state, saves/restores the
 * per-key draft (text, File attachments, source switches) on scope changes,
 * pushes external draft mutations (starters, suggested follow-ups,
 * edit-and-resend) into the editor, and honors focus requests. Rendered
 * inside PromptInput so it can reach the editor context. Renders nothing.
 */

function deriveActiveKey(): ComposerDraftKey {
	const conv = useChatDataStore.getState().activeConversation;
	if (conv) return draftKeyForConversation(conv.meta.id);
	const view = useChatViewStore.getState();
	// Project home Composer scopes its draft to the project (§8.1).
	if (view.viewMode === ViewMode.PROJECT_OVERVIEW && view.projectForOverview) {
		return draftKeyForProject(view.projectForOverview.meta.id);
	}
	const pending = view.pendingConversation;
	if (pending?.project) return draftKeyForProject(pending.project.meta.id);
	return draftKeyForNew();
}

export const ComposerDraftSync: React.FC = () => {
	const { textInput, attachments, focusInput } = usePromptInputContext();
	const activeConversationId = useChatDataStore((s) => s.activeConversation?.meta.id ?? null);
	const pendingProjectId = useChatViewStore((s) => s.pendingConversation?.project?.meta.id ?? null);
	const hasPending = useChatViewStore((s) => s.pendingConversation !== null);
	const viewMode = useChatViewStore((s) => s.viewMode);
	const overviewProjectId = useChatViewStore((s) => s.projectForOverview?.meta.id ?? null);
	const focusRequestId = useComposerStore((s) => s.focusRequestId);

	const keyRef = useRef<ComposerDraftKey | null>(null);
	const textInputRef = useRef(textInput);
	textInputRef.current = textInput;
	const attachmentsRef = useRef(attachments);
	attachmentsRef.current = attachments;

	// Scope switch: save outgoing attachments, restore incoming draft.
	useEffect(() => {
		const nextKey = deriveActiveKey();
		const prevKey = keyRef.current;
		if (prevKey === nextKey) return;

		const store = useComposerStore.getState();
		if (prevKey !== null) {
			store.setAttachmentFiles(prevKey, attachmentsRef.current.files.map((f) => f.file));
			attachmentsRef.current.clear();
		}
		keyRef.current = nextKey;
		store.setActiveKey(nextKey);

		const draft = store.getDraft(nextKey);
		const readableText = normalizeVaultReferenceDisplayText(draft.text, draft.explicitRefs);
		if (readableText !== draft.text) store.updateDraft({ text: readableText }, nextKey);
		textInputRef.current.setInput(readableText);
		const files = store.getAttachmentFiles(nextKey);
		if (files.length > 0) attachmentsRef.current.add(files);

		// Per-key source switches drive the runtime toggles (§12.0 row 4).
		const view = useChatViewStore.getState();
		view.setEnableVaultSearch(draft.vaultSearch);
		view.setEnableWebSearch(draft.webSearch);
	}, [activeConversationId, pendingProjectId, hasPending, viewMode, overviewProjectId]);

	// Editor → draft (text changes flow through PromptInput onTextChange in
	// Composer; here we cover the reverse: external draft fills → editor).
	useEffect(() => {
		const unsubscribe = useComposerStore.subscribe((state, prev) => {
			const key = keyRef.current;
			if (!key) return;
			const draft = state.drafts[key];
			const prevDraft = prev.drafts[key];
			if (!draft || draft === prevDraft) return;
			if (draft.text !== textInputRef.current.value) {
				textInputRef.current.setInput(draft.text);
			}
		});
		return unsubscribe;
	}, []);

	// Focus requests (targeted follow-up, starters).
	const lastFocusRef = useRef(focusRequestId);
	useEffect(() => {
		if (focusRequestId === lastFocusRef.current) return;
		lastFocusRef.current = focusRequestId;
		focusInput();
	}, [focusRequestId, focusInput]);

	return null;
};
