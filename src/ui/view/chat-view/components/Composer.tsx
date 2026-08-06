import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, FileText, ImagePlus, Layers3, Loader2, MessageSquare, Music as MusicIcon, Network, Pencil, Video as VideoIcon, Workflow } from 'lucide-react';
import { useComposerEditImageStore } from '../store/composerEditImageStore';
import {
	PromptInput,
	PromptInputBody,
	PromptInputAttachments,
	type PromptInputEditorHandle,
	usePromptInputContext,
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
import { ComposerGenerateActions, type GenerateKind } from './composer/ComposerGenerateActions';
import { PEAK_KEYBOARD_ZONE_LABELS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';
import type { ToolAvailability } from '@/service/chat/tools/toolAvailability';
import {
	normalizeAIInstructionAttachments,
	SharedAIInstructionController,
} from '@/core/instruction-composer';
import { IconButton } from '@/ui/components/primitives';
import { AIGraphContextArtifacts } from '@/ui/component/ai-graph';
import { Button } from '@/ui/component/shared-ui/button';
import { ComposerContextStack } from './composer/ComposerContextStack';
import {
	canScrollInDirection,
	isTimelineNearBottom,
	metricsForElement,
	resolveAdaptiveComposerDisplay,
} from './composer/composerAdaptiveState';

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

interface ComposerProps {
	scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

const ComposerAttachmentStateBridge: React.FC<{ onCountChange: (count: number) => void }> = ({
	onCountChange,
}) => {
	const { attachments } = usePromptInputContext();
	useEffect(() => {
		onCountChange(attachments.files.length);
	}, [attachments.files.length, onCountChange]);
	return null;
};

export const Composer: React.FC<ComposerProps> = ({ scrollContainerRef }) => {
	const strings = useChatStrings();
	const studioStrings = useChatStudioStrings();
	const { manager, quickSearchLauncher } = useServiceContext();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const activePlacement = Boolean(activeConversation && scrollContainerRef);

	const textareaRef = useRef<PromptInputEditorHandle>(null);
	const inputFocusRef = useRef<{ focus: () => void } | null>(null);
	const expandedContentRef = useRef<HTMLDivElement>(null);
	const [expandedHeight, setExpandedHeight] = useState<number | null>(null);

	const {
		isSending,
		status,
		handleSubmit,
		handleCancelStream,
		handleTextChange,
	} = useInputSubmit();
	const handleSubmitRef = useRef(handleSubmit);
	const handleCancelStreamRef = useRef(handleCancelStream);
	const pendingFilesRef = useRef<File[]>([]);
	handleSubmitRef.current = handleSubmit;
	handleCancelStreamRef.current = handleCancelStream;
	const instructionController = useMemo(
		() => new SharedAIInstructionController(
			{
				surface: 'chat',
				capabilityId: 'chat.send-message',
				placeholder: 'Send a message',
				context: () => undefined,
				submit: async (envelope) => {
					await handleSubmitRef.current({
						text: envelope.submission.instruction,
						files: pendingFilesRef.current,
					});
				},
				stop: async () => {
					await handleCancelStreamRef.current();
				},
			},
		),
		[],
	);
	useEffect(() => {
		instructionController.syncStatus(
			status === 'submitted'
				? 'submitting'
				: status === 'streaming'
					? 'streaming'
					: 'idle',
		);
	}, [instructionController, status]);

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
	const hasDraftContext = useComposerStore((state) => {
		const draft = state.drafts[state.activeKey];
		if (!draft) return false;
		return draft.explicitRefs.length > 0
			|| Boolean(draft.replyAnchor)
			|| Boolean(draft.workflowId)
			|| draft.vaultSearch
			|| draft.webSearch
			|| Boolean(draft.revisionOfMessageId);
	});
	const [attachmentCount, setAttachmentCount] = useState(0);
	const [focused, setFocused] = useState(false);
	const [contextOpen, setContextOpen] = useState(false);
	const [openSurfaceIds, setOpenSurfaceIds] = useState<Set<string>>(() => new Set());
	const [nearBottom, setNearBottom] = useState(true);
	const setComposerSurfaceOpen = (surfaceId: string, open: boolean) => {
		setOpenSurfaceIds((current) => {
			if (current.has(surfaceId) === open) return current;
			const next = new Set(current);
			if (open) next.add(surfaceId);
			else next.delete(surfaceId);
			return next;
		});
	};

	useEffect(() => {
		const container = scrollContainerRef?.current;
		if (!activePlacement || !container) {
			setNearBottom(true);
			return;
		}
		const update = () => {
			setNearBottom(isTimelineNearBottom(
				metricsForElement(container),
				studioStrings.density.composerBottomThresholdPx,
			));
		};
		update();
		container.addEventListener('scroll', update, { passive: true });
		const ResizeObserverCtor = container.ownerDocument.defaultView?.ResizeObserver;
		const observer = ResizeObserverCtor ? new ResizeObserverCtor(update) : null;
		observer?.observe(container);
		return () => {
			container.removeEventListener('scroll', update);
			observer?.disconnect();
		};
	}, [activePlacement, scrollContainerRef, studioStrings.density.composerBottomThresholdPx]);

	useLayoutEffect(() => {
		const content = expandedContentRef.current;
		if (!activePlacement || !content) {
			setExpandedHeight(null);
			return;
		}
		const update = () => {
			const next = Math.ceil(content.scrollHeight);
			if (next <= 0) return;
			setExpandedHeight((current) => current === next ? current : next);
		};
		update();
		const ResizeObserverCtor = content.ownerDocument.defaultView?.ResizeObserver;
		const observer = ResizeObserverCtor ? new ResizeObserverCtor(update) : null;
		observer?.observe(content);
		return () => observer?.disconnect();
	}, [activePlacement]);

	// `/` slash palette owns BOTH workflows (research/plan/…) and generation
	// actions (image/video/music). Selecting a workflow adds a context chip;
	// selecting a generation action opens the inline `ComposerGenerateActions`
	// panel above the editor. Only REAL entries appear — generation rows are
	// probed for tool availability and either disabled with an honest reason
	// or omitted so we never render a "fake-clickable" action (RUN-07).
	const [generateOpen, setGenerateOpen] = useState<{ kind: GenerateKind; mode: 'generate' | 'edit' } | null>(null);
	const composerDisplay = resolveAdaptiveComposerDisplay({
		activePlacement,
		nearBottom,
		focused,
		hasDraft: hasInput || hasDraftContext,
		hasAttachments: attachmentCount > 0,
		hasOpenSurface: contextOpen || openSurfaceIds.size > 0 || Boolean(generateOpen),
		hasActiveRun: status !== 'ready',
	});

	// Insert-as-reference from an artifact card fires this store; when it
	// ticks, open the Edit form. The form itself calls consumeIntent() so
	// re-opens from the slash palette start fresh.
	const editOpenRequestId = useComposerEditImageStore((s) => s.openRequestId);
	useEffect(() => {
		if (editOpenRequestId > 0) setGenerateOpen({ kind: 'image', mode: 'edit' });
	}, [editOpenRequestId]);
	const [mediaAvailability, setMediaAvailability] = useState<ToolAvailability | null>(null);
	useEffect(() => {
		try {
			const records = manager.conv.getToolAvailability({
				enableVaultSearch: false,
				enableWebSearch: false,
			});
			setMediaAvailability(records.find((r) => r.toolId === 'media_generate') ?? null);
		} catch {
			setMediaAvailability(null);
		}
	}, [manager]);

	const mediaReady = mediaAvailability?.state === 'available';
	const mediaSnapshot = (() => {
		try {
			const svc = manager.conv.getMediaGenerationService();
			return svc ? svc.probeSyncAvailability() : null;
		} catch { return null; }
	})();
	const imageReady = mediaReady && Boolean(mediaSnapshot?.perKind.image?.anyRouteReady);
	const videoReady = mediaReady && Boolean(mediaSnapshot?.perKind.video?.anyRouteReady);
	const musicReady = mediaReady && Boolean(mediaSnapshot?.perKind.music?.anyRouteReady);
	const mediaReason = mediaAvailability?.reason;

	const slashItems: NavigableMenuItem[] = [
		{
			id: 'plan',
			label: studioStrings.composer.workflowPlanLabel,
			description: studioStrings.composer.workflowPlanDescription,
			icon: <Workflow />,
			value: 'plan',
			group: studioStrings.composer.slashGroupWorkflow,
		},
		{
			id: 'generate-image',
			label: imageReady
				? studioStrings.composer.generateImageLabel
				: studioStrings.composer.generateImageUnavailableLabel,
			description: imageReady
				? studioStrings.composer.generateImageDescription
				: (mediaReason ?? studioStrings.composer.generateImageDescription),
			icon: <ImagePlus />,
			value: 'generate-image',
			disabled: !imageReady,
			group: studioStrings.composer.slashGroupGenerate,
		},
		{
			id: 'edit-image',
			label: imageReady
				? studioStrings.composer.editImageLabel
				: studioStrings.composer.editImageUnavailableLabel,
			description: imageReady
				? studioStrings.composer.editImageDescription
				: (mediaReason ?? studioStrings.composer.editImageAvailabilityReason),
			icon: <Pencil />,
			value: 'edit-image',
			disabled: !imageReady,
			group: studioStrings.composer.slashGroupGenerate,
		},
		{
			id: 'generate-video',
			label: videoReady
				? studioStrings.composer.generateVideoLabel
				: studioStrings.composer.generateVideoUnavailableLabel,
			description: videoReady
				? studioStrings.composer.generateVideoDescription
				: studioStrings.composer.generateVideoUnavailableReason,
			icon: <VideoIcon />,
			value: 'generate-video',
			disabled: !videoReady,
			group: studioStrings.composer.slashGroupGenerate,
		},
		{
			id: 'generate-music',
			label: musicReady
				? studioStrings.composer.generateMusicLabel
				: studioStrings.composer.generateMusicUnavailableLabel,
			description: musicReady
				? studioStrings.composer.generateMusicDescription
				: studioStrings.composer.generateMusicUnavailableReason,
			icon: <MusicIcon />,
			value: 'generate-music',
			disabled: !musicReady,
			group: studioStrings.composer.slashGroupGenerate,
		},
		// Document generation rides the `artifact_create` runtime (Extract /
		// Dataview / Excalidraw / drawio / Reminder + Save-to-Vault) landed
		// in the zero-gap D-Track — no separate media runtime is required,
		// so this entry is unconditionally available. Behaviour is workflow-
		// style fill: the Composer draft is populated with a configurable
		// template that guides the model to call `artifact_create` and save
		// the result to the vault. It does NOT auto-send (COMP-09).
		{
			id: 'generate-document',
			label: studioStrings.composer.generateDocumentLabel,
			description: studioStrings.composer.generateDocumentDescription,
			icon: <FileText />,
			value: 'generate-document',
			group: studioStrings.composer.slashGroupGenerate,
		},
	];

	const onMenuItemSelect = (trigger: string, item: NavigableMenuItem, resolvedText?: string) => {
		if (trigger === '/') {
			if (item.disabled) return;
			if (item.value === 'generate-image') { setGenerateOpen({ kind: 'image', mode: 'generate' }); return; }
			if (item.value === 'edit-image') { setGenerateOpen({ kind: 'image', mode: 'edit' }); return; }
			if (item.value === 'generate-video') { setGenerateOpen({ kind: 'video', mode: 'generate' }); return; }
			if (item.value === 'generate-music') { setGenerateOpen({ kind: 'music', mode: 'generate' }); return; }
			if (item.value === 'generate-document') {
				// Workflow-style fill: drop the configured template into the
				// draft so the user can edit before send. Never auto-sends
				// (COMP-09). No availability probe — `artifact_create` is
				// always registered by the D-Track producer service.
				const store = useComposerStore.getState();
				const current = store.getDraft();
				const template = studioStrings.composer.generateDocumentDraftTemplate;
				const nextText = current.text.trim() ? `${current.text.trimEnd()}\n\n${template}` : template;
				store.updateDraft({ text: nextText });
				return;
			}
			// Otherwise: a workflow — becomes a draft context chip.
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
		if (trigger === '@' && !item.showArrow && item.value) {
			useComposerStore.getState().addExplicitRef({
				id: generateUuidWithoutHyphens(),
				kind: 'vault-file',
				uri: item.value,
				title: item.label || item.value.split('/').pop() || item.value,
			});
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

	const handleWheelCapture = (event: React.WheelEvent<HTMLFormElement>) => {
		const timeline = scrollContainerRef?.current;
		if (!activePlacement || !timeline || event.deltaY === 0) return;
		const target = event.target as Element | null;
		const innerScrollRegion = typeof target?.closest === 'function'
			? target.closest('[data-composer-scroll-region], .cm-scroller')
			: null;
		if (innerScrollRegion && canScrollInDirection(
			metricsForElement(innerScrollRegion),
			event.deltaY,
			studioStrings.density.composerWheelEdgePx,
		)) return;
		if (!canScrollInDirection(
			metricsForElement(timeline),
			event.deltaY,
			studioStrings.density.composerWheelEdgePx,
		)) return;
		event.preventDefault();
		timeline.scrollTop += event.deltaY;
	};

	return (
		<div
			className="pkchat-composer-wrap"
			data-composer-root="true"
			data-composer-placement={activePlacement ? 'active' : 'start'}
			data-composer-display={composerDisplay}
			data-peak-keyboard-zone="cs-composer"
			data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['cs-composer']}
			data-peak-keyboard-order="3"
		>
			{activeConversation && (
				<AIGraphContextArtifacts
					contextRefs={[
						activeConversation.meta.id,
						...(activeConversation.meta.projectId
							? [activeConversation.meta.projectId]
							: []),
					]}
					label="Conversation graphs"
					limit={2}
					className="pk-ai-graph-context-artifacts pk-ai-graph-context-artifacts--chat"
				/>
			)}
			<PromptInput
				className={cn('pkchat-composer', `pkchat-composer--${status}`)}
				style={activePlacement && expandedHeight
					? { '--pkchat-expanded-height': `${expandedHeight}px` } as React.CSSProperties
					: undefined}
				onFocusCapture={() => setFocused(true)}
				onBlurCapture={(event) => {
					if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
					setFocused(false);
				}}
				onWheelCapture={handleWheelCapture}
				globalDrop
				multiple
				inputFocusRef={inputFocusRef}
				onSubmit={async (message) => {
					const currentDraft = useComposerStore.getState().getDraft(activeKey);
					const context = [
						...(activeConversation ? [{
							id: activeConversation.meta.id,
							kind: 'custom' as const,
							label: activeConversation.meta.title ?? activeConversation.meta.id,
							source: 'automatic' as const,
						}] : []),
						...(activeConversation?.meta.projectId ? [{
							id: activeConversation.meta.projectId,
							kind: 'custom' as const,
							label: `Project ${activeConversation.meta.projectId}`,
							source: 'automatic' as const,
						}] : []),
						...currentDraft.explicitRefs.map((ref) => ({
							id: ref.id,
							kind: ref.kind === 'vault-file'
								? 'vault-file' as const
								: 'custom' as const,
							label: ref.title || ref.uri,
							source: 'explicit' as const,
						})),
					];
					const attachments = await normalizeAIInstructionAttachments(message.files);
					pendingFilesRef.current = message.files;
					instructionController.setDraft(message.text);
					await instructionController.submit(context, attachments);
				}}
				contextItems={menuContextItems}
				onLoadContextItems={handleSearchContext}
				onMenuItemSelect={onMenuItemSelect}
				folderStack={folderStack}
				onFolderUp={handleFolderUp}
				onTextChange={onTextChange}
			>
				<ComposerAttachmentStateBridge onCountChange={setAttachmentCount} />
				<Button
					variant="unstyled"
					type="button"
					className="pkchat-composer__compact"
					aria-label={studioStrings.composerContext.compactExpandLabel}
					onFocus={() => inputFocusRef.current?.focus()}
					onClick={() => inputFocusRef.current?.focus()}
				>
					<MessageSquare />
					<span>{studioStrings.composer.placeholder}</span>
					<small><Layers3 />{studioStrings.composerContext.railTitle}</small>
				</Button>
				<div className="pkchat-composer__expanded">
					<div ref={expandedContentRef} className="pkchat-composer__expanded-inner">
						<ComposerDraftSync />
						{activePlacement ? <ComposerContextStack status={status} onOpenChange={setContextOpen} /> : null}
						<ComposerContextShelf />
						{generateOpen && (
							<ComposerGenerateActions
								kind={generateOpen.kind}
								mode={generateOpen.mode}
								onClose={() => setGenerateOpen(null)}
							/>
						)}
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
								<ComposerPlusMenu
									insertAtCaret={(text) => textareaRef.current?.insertText(text)}
									onSurfaceOpenChange={(open) => setComposerSurfaceOpen('plus', open)}
								/>
								<ComposerSourcesPopover onSurfaceOpenChange={(open) => setComposerSurfaceOpen('sources', open)} />
								{quickSearchLauncher && (
									<IconButton
										label={studioStrings.composer.openAIGraphsLabel}
										title={studioStrings.composer.openAIGraphsLabel}
										onClick={() => quickSearchLauncher.open({
											aiMode: 'graph',
											...(activeConversation
												? {
													graphCreateOrigin: {
														surface: 'chat-studio',
														contextRef: {
															kind: 'conversation',
															ref: activeConversation.meta.id,
															label: activeConversation.meta.title
																?? activeConversation.meta.id,
														},
													},
												}
												: {}),
										})}
									>
										<Network />
									</IconButton>
								)}
							</div>
							<div className="pkchat-composer__foot-right">
								<ComposerAssistantSelector
									assistantId={assistantId}
									onSelect={onAssistantSelect}
									onSurfaceOpenChange={(open) => setComposerSurfaceOpen('assistant', open)}
								/>
								<ComposerModelSelector
									selection={modelSelection}
									onSelect={onModelSelect}
									onSurfaceOpenChange={(open) => setComposerSurfaceOpen('model', open)}
								/>
								<SendButton
									status={status}
									hasInput={hasInput}
									onCancel={() => instructionController.stop()}
								/>
							</div>
						</div>
					</div>
				</div>
			</PromptInput>
		</div>
	);
};
