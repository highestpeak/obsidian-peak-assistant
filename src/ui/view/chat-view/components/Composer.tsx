import React, { useRef } from 'react';
import { ArrowUp, Loader2, Workflow } from 'lucide-react';
import {
	PromptInput,
	PromptInputBody,
	PromptInputAttachments,
	type PromptInputEditorHandle,
} from '@/ui/component/prompt-input';
import { cn } from '@/ui/react/lib/utils';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '../store/chatViewStore';
import { useComposerStore } from '../store/composerStore';
import { useContextSearch } from '../hooks/useContextSearch';
import { useInputKeyboard } from '../hooks/useInputKeyboard';
import { useInputSubmit } from '../hooks/useInputSubmit';
import { PromptEnhanceSuggestion } from './PromptEnhanceSuggestion';
import { useChatStrings } from '../chatStringsContext';
import { useChatStudioStrings } from '../chatStudioStringsContext';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { providerKindForProfile } from '@/ui/component/model-picker/modelPickerData';
import { normalizeModelSelection, AUTO_MODEL_SELECTION, type ModelSelection } from '@/core/types/chat-studio';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { NavigableMenuItem } from '@/ui/component/mine/NavigableMenu';
import {
	mergeVaultReferenceDraft,
	reconcileVaultReferencesWithText,
} from '@/ui/component/prompt-input/promptMenuSelection';
import { ComposerContextShelf } from './composer/ComposerContextShelf';
import { ComposerDraftSync } from './composer/ComposerDraftSync';
import { ComposerPlusMenu } from './composer/ComposerPlusMenu';
import { ComposerSourcesPopover } from './composer/ComposerSourcesPopover';
import { ComposerModelSelector } from './composer/ComposerModelSelector';
import { ComposerAssistantSelector } from './composer/ComposerAssistantSelector';

/**
 * Composer V2 — the single live editor of Chat Studio (chat-studio §8).
 *
 * Ownership map (§8.3): `+` = resources, `[[` = Vault refs (wikilink text +
 * explicit context ref), `/` = workflows (real ones only), Sources popover =
 * project/Vault/Web scope, model + assistant chips = engine/identity.
 * `@` is unassigned this round. No Mic (no transcription runtime), no role
 * pills (no role dispatch) — fake controls were removed per RUN-07.
 */

// ---------------------------------------------------------------------------
// Send / Stop — send appears with input; stop replaces it while streaming.
// ---------------------------------------------------------------------------

interface SendButtonProps {
	status: 'ready' | 'submitted' | 'streaming';
	hasInput: boolean;
	onCancel?: () => void | Promise<void>;
}

const SendButton: React.FC<SendButtonProps> = ({ status, hasInput, onCancel }) => {
	const strings = useChatStrings();

	if (status === 'streaming') {
		return (
			<button
				type="button"
				className="pkchat-send pkchat-send--stop"
				aria-label={strings.composer.cancelLabel}
				onClick={async (e) => {
					e.preventDefault();
					e.stopPropagation();
					if (onCancel) await onCancel();
				}}
			>
				<span className="pkchat-send__stop-mark" aria-hidden />
			</button>
		);
	}

	if (status === 'submitted') {
		return (
			<button type="button" className="pkchat-send" aria-label={strings.composer.sendLabel} disabled>
				<Loader2 className="pktw-animate-spin" />
			</button>
		);
	}

	// Send stays resident even with an empty input (chat-studio composer mock):
	// disabled = neutral sunken circle, ready = solid accent circle. It never
	// unmounts, so the footer's right edge doesn't reflow as the user types.
	return (
		<button
			type="submit"
			className="pkchat-send"
			aria-label={strings.composer.sendLabel}
			disabled={!hasInput}
		>
			<ArrowUp />
		</button>
	);
};

// ---------------------------------------------------------------------------
// Model / Assistant binding helpers
// ---------------------------------------------------------------------------

function useCurrentModelSelection(): ModelSelection {
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const activeKey = useComposerStore((s) => s.activeKey);
	const draft = useComposerStore((s) => s.drafts[activeKey]);
	if (activeConversation) {
		return normalizeModelSelection(activeConversation.meta.modelSelection, {
			activeModel: activeConversation.meta.activeModel,
			activeProvider: activeConversation.meta.activeProvider,
		});
	}
	return draft?.modelOverride ?? AUTO_MODEL_SELECTION;
}

// ---------------------------------------------------------------------------
// Composer — root composer for Chat Studio.
// ---------------------------------------------------------------------------

export const Composer: React.FC = () => {
	const strings = useChatStrings();
	const studioStrings = useChatStudioStrings();
	const { manager } = useServiceContext();
	const activeConversation = useChatDataStore((s) => s.activeConversation);

	const textareaRef = useRef<PromptInputEditorHandle>(null);
	const inputFocusRef = useRef<{ focus: () => void } | null>(null);

	const {
		isSending,
		status,
		handleSubmit,
		handleCancelStream,
		handleTextChange,
	} = useInputSubmit();

	const {
		menuContextItems,
		folderStack,
		handleSearchContext,
		handleMenuSelect,
		handleFolderUp,
	} = useContextSearch();
	useInputKeyboard(textareaRef, activeConversation?.meta?.id ?? null);

	const modelSelection = useCurrentModelSelection();
	// Rules of Hooks: always call the store selector, then pick between
	// conversation-bound and draft-override values (the selector must not sit
	// behind a conditional — activeConversation toggling would change hook count).
	const draftAssistantOverride = useComposerStore((s) => s.drafts[s.activeKey]?.assistantOverride ?? undefined);
	const assistantId = activeConversation
		? activeConversation.meta.assistantId
		: draftAssistantOverride;

	const activeKey = useComposerStore((s) => s.activeKey);
	const draftText = useComposerStore((s) => s.drafts[s.activeKey]?.text ?? '');
	const hasInput = draftText.trim().length > 0;

	// Only REAL workflows appear in the `/` palette (RUN-07 truthfulness).
	const slashItems: NavigableMenuItem[] = [
		{
			id: 'plan',
			label: studioStrings.composer.workflowPlanLabel,
			description: studioStrings.composer.workflowPlanDescription,
			icon: <Workflow />,
			value: 'plan',
		},
	];

	const onMenuItemSelect = (trigger: string, item: NavigableMenuItem, resolvedText?: string) => {
		if (trigger === '/') {
			useComposerStore.getState().updateDraft({ workflowId: item.value });
			return;
		}
		if (trigger === '[[' && !item.showArrow && item.value) {
			const path = item.value;
			const ref = {
				id: generateUuidWithoutHyphens(),
				kind: 'vault-file' as const,
				uri: path,
				title: path.split('/').pop() ?? path,
			};
			const store = useComposerStore.getState();
			const current = store.getDraft();
			const merged = mergeVaultReferenceDraft(
				{ text: current.text, explicitRefs: current.explicitRefs },
				resolvedText ?? current.text,
				ref,
			);
			store.updateDraft(merged);
		}
		handleMenuSelect(trigger, item);
	};

	const onModelSelect = async (selection: ModelSelection) => {
		if (!activeConversation) {
			useComposerStore.getState().updateDraft({ modelOverride: selection });
			if (selection.mode === 'fixed') {
				const kind = providerKindForProfile(selection.profileId);
				useChatViewStore.getState().setSelectedModel(kind ?? selection.profileId, selection.modelId);
			} else {
				useChatViewStore.getState().clearSelectedModel();
			}
			return;
		}
		const legacyProvider = selection.mode === 'fixed' ? providerKindForProfile(selection.profileId) : undefined;
		await manager.conv.updateConversationModelSelection({
			conversationId: activeConversation.meta.id,
			selection,
			legacyProvider,
		});
		if (selection.mode === 'fixed') {
			useChatViewStore.getState().setSelectedModel(legacyProvider ?? selection.profileId, selection.modelId);
		} else {
			useChatViewStore.getState().clearSelectedModel();
		}
		const updated = await manager.readConversation(activeConversation.meta.id, false);
		if (updated) {
			updated.messages = useChatDataStore.getState().activeConversation?.messages ?? [];
			useChatDataStore.getState().setActiveConversation(updated);
			useChatDataStore.getState().updateConversation(updated);
		}
	};

	const onAssistantSelect = async (nextAssistantId: string | undefined) => {
		if (!activeConversation) {
			useComposerStore.getState().updateDraft({ assistantOverride: nextAssistantId ?? null });
			return;
		}
		await manager.conv.updateConversationAssistant({
			conversationId: activeConversation.meta.id,
			assistantId: nextAssistantId,
		});
		const updated = await manager.readConversation(activeConversation.meta.id, false);
		if (updated) {
			updated.messages = useChatDataStore.getState().activeConversation?.messages ?? [];
			useChatDataStore.getState().setActiveConversation(updated);
			useChatDataStore.getState().updateConversation(updated);
		}
	};

	const onTextChange = (text: string, tags: Parameters<typeof handleTextChange>[1]) => {
		const store = useComposerStore.getState();
		const current = store.getDraft(activeKey);
		store.updateDraft({
			text,
			explicitRefs: reconcileVaultReferencesWithText(text, current.explicitRefs),
		}, activeKey);
		handleTextChange(text, tags);
	};

	return (
		<div className="pkchat-composer-wrap" data-composer-root="true">
			<PromptInput
				className={cn('pkchat-composer', `pkchat-composer--${status}`)}
				globalDrop
				multiple
				inputFocusRef={inputFocusRef}
				onSubmit={handleSubmit}
				contextItems={menuContextItems}
				onLoadContextItems={handleSearchContext}
				onMenuItemSelect={onMenuItemSelect}
				folderStack={folderStack}
				onFolderUp={handleFolderUp}
				onTextChange={onTextChange}
			>
				<ComposerDraftSync />
				<ComposerContextShelf />
				<PromptInputAttachments />
				{status === 'streaming' && (
					<div className="pkchat-composer__status" role="status" aria-live="polite">
						<Loader2 className="pkchat-composer__status-spinner" />
						<span>{strings.composer.streamingStatus}</span>
						{hasInput && (
							<span className="pktw-text-pk-xs pktw-text-pk-muted-foreground">
								{studioStrings.composer.queuedHint}
							</span>
						)}
					</div>
				)}
				<div className="pkchat-composer__editor">
					<PromptInputBody
						ref={textareaRef}
						inputRef={inputFocusRef}
						placeholder={studioStrings.composer.placeholder}
						slashItems={slashItems}
						onTextChange={onTextChange}
					/>
					<PromptEnhanceSuggestion />
				</div>

				<div className="pkchat-composer__foot">
					<div className="pkchat-composer__foot-left">
						<ComposerPlusMenu insertAtCaret={(text) => textareaRef.current?.insertText(text)} />
						<ComposerSourcesPopover />
					</div>
					<div className="pkchat-composer__foot-right">
						<ComposerAssistantSelector assistantId={assistantId} onSelect={onAssistantSelect} />
						<ComposerModelSelector selection={modelSelection} onSelect={onModelSelect} />
						<SendButton status={status} hasInput={hasInput} onCancel={handleCancelStream} />
					</div>
				</div>
			</PromptInput>
		</div>
	);
};
