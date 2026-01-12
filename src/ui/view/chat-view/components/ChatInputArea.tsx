import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { useMessageStore } from '@/ui/view/chat-view/store/messageStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import {
	PromptInput,
	PromptInputBody,
	PromptInputAttachments,
	PromptInputFileButton,
	PromptInputSearchButton,
	PromptInputSubmit,
	PromptInputMenu,
	TokenUsage,
	usePromptInputContext,
	type PromptInputMessage,
	type TokenUsageInfo,
} from '@/ui/component/prompt-input';
import { ToolButton } from '@/ui/component/prompt-input';
import { ModeSelector } from '../../../component/prompt-input/ModeSelector';
import { cn } from '@/ui/react/lib/utils';
import { useChatSubmit } from '../hooks/useChatSubmit';
import { useChatSessionStore } from '../store/chatSessionStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ExternalPromptInfo } from '@/ui/component/prompt-input/menu/PromptMenu';
import type { FileItem } from '@/ui/component/prompt-input/menu/ContextMenu';
import type { TriggerType } from '@/ui/component/prompt-input/PromptInputMenu';
import { getLLMOutputControlSettingKeys } from '@/core/providers/types';
import { ModelSelector } from '@/ui/component/mine/ModelSelector';
import { HoverButton, OutputControlSettingsList } from '@/ui/component/mine';
import { Settings2 } from 'lucide-react';

interface ChatInputAreaComponentProps {
}

/**
 * Internal component to clear input immediately when sending starts
 */
const InputClearHandler: React.FC<{ isSending: boolean }> = ({ isSending }) => {
	const inputContext = usePromptInputContext();
	const prevIsSendingRef = React.useRef(isSending);

	React.useEffect(() => {
		// Clear input immediately when sending starts (changes from false to true)
		if (!prevIsSendingRef.current && isSending) {
			inputContext.textInput.clear();
			inputContext.attachments.clear();
		}
		prevIsSendingRef.current = isSending;
	}, [isSending, inputContext]);

	return null;
};


export const ChatInputAreaComponent: React.FC<ChatInputAreaComponentProps> = ({
}) => {
	const {
		promptsSuggest,
		isSearchActive,
		searchProvider,
		enableWebSearch,
		enableTwitterSearch,
		enableRedditSearch,
		attachmentHandlingMode,
		llmOutputControlSettings,
		isCodeInterpreterEnabled,
		chatMode,
		selectedModel,
		models,
		isModelsLoading,
		setSearchActive,
		setSearchProvider,
		setEnableWebSearch,
		setEnableTwitterSearch,
		setEnableRedditSearch,
		setAttachmentHandlingMode,
		setLlmOutputControlSettings,
		setIsCodeInterpreterEnabled,
		setChatMode,
		setSelectedModel,
		setModels,
		setIsModelsLoading
	} = useChatSessionStore();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const [isSending, setIsSending] = useState(false);
	const [menuContextItems, setMenuContextItems] = useState<FileItem[]>([]);
	const { searchClient, manager, eventBus } = useServiceContext();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const inputFocusRef = useRef<{ focus: () => void } | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const { submitMessage, cancelStream } = useChatSubmit();

	// Initialize attachment handling mode from active conversation
	useEffect(() => {
		if (activeConversation) {
			const effectiveMode = activeConversation.meta.attachmentHandlingOverride ?? manager.getSettings().attachmentHandlingDefault ?? 'degrade_to_text';
			setAttachmentHandlingMode(effectiveMode);
		}
	}, [activeConversation, manager, setAttachmentHandlingMode]);

	// Callback for attachment handling mode changes
	const handleAttachmentHandlingModeChange = useCallback(async (mode: 'direct' | 'degrade_to_text') => {
		// Update store state
		setAttachmentHandlingMode(mode);

		// Update conversation in backend if we have an active conversation
		if (activeConversation) {
			await manager.updateConversationAttachmentHandling({
				conversationId: activeConversation.meta.id,
				attachmentHandlingOverride: mode,
			});
		}
	}, [activeConversation, manager, setAttachmentHandlingMode]);

	// Compute current LLM output control settings (global default + conversation override + session settings)
	const currentLlmOutputControlSettings = useMemo(() => {
		// Start with global default settings
		const globalDefault = manager.getSettings().defaultOutputControl || {};

		// Merge with conversation override (override takes priority)
		const override = activeConversation?.meta.outputControlOverride || {};

		// Merge with session settings (highest priority)
		return { ...globalDefault, ...override, ...llmOutputControlSettings };
	}, [manager, activeConversation, llmOutputControlSettings]);

	// Handle LLM output control settings changes
	const handleLlmOutputControlSettingsChange = useCallback(async (settings: Record<string, any>) => {
		// Update store state
		setLlmOutputControlSettings(settings);

		// Update conversation in backend if we have an active conversation
		if (activeConversation) {
			// Get global default settings
			const globalDefault = manager.getSettings().defaultOutputControl || {};

			// Calculate override: only include values that differ from global default
			const override: Record<string, any> = {};
			const allKeys = getLLMOutputControlSettingKeys();

			for (const key of allKeys) {
				const settingValue = settings[key];
				const defaultValue = globalDefault[key];
				// Include in override if value is set and different from default
				if (settingValue !== undefined && settingValue !== defaultValue) {
					override[key] = settingValue;
				}
			}

			const convId = activeConversation.meta.id;

			// Update conversation meta with override (empty object means no override)
			await manager.updateConversationOutputControl({
				conversationId: String(convId),
				outputControlOverride: Object.keys(override).length > 0 ? override : undefined,
			});

			// Reload conversation to get updated meta
			const updatedConv = await manager.readConversation(convId, false);
			if (updatedConv) {
				useProjectStore.getState().setActiveConversation(updatedConv);
				useProjectStore.getState().updateConversation(updatedConv);
				useChatViewStore.getState().setConversation(updatedConv);
			}
		}
	}, [activeConversation, manager, setLlmOutputControlSettings]);

	// Load models function
	const loadModels = useCallback(async () => {
		if (!manager) return;
		setIsModelsLoading(true);
		try {
			const allModels = await manager.getAllAvailableModels();
			setModels(allModels);
		} catch (error) {
			console.error('[ChatInputArea] Error loading models:', error);
			setModels([]);
		} finally {
			setIsModelsLoading(false);
		}
	}, [manager, setModels, setIsModelsLoading]);

	// Initialize models loading
	useEffect(() => {
		loadModels();
	}, [loadModels]);

	// Listen for settings updates to reload models
	useEffect(() => {
		if (!eventBus) return;
		const unsubscribe = eventBus.on('settings-updated', () => {
			loadModels();
		});
		return unsubscribe;
	}, [eventBus, loadModels]);

	// Compute current model for selector
	const currentModel = useMemo(() => {
		// Priority: conversation model > selected model > default model
		if (activeConversation?.meta.activeModel) {
			return {
				provider: activeConversation.meta.activeProvider || manager?.getSettings().defaultModel.provider || '',
				modelId: activeConversation.meta.activeModel,
			};
		}
		if (selectedModel) {
			return selectedModel;
		}
		const defaultModel = manager?.getSettings().defaultModel;
		return defaultModel ? {
			provider: defaultModel.provider,
			modelId: defaultModel.modelId,
		} : undefined;
	}, [activeConversation, selectedModel, manager]);

	// Handle model change
	const handleModelChange = useCallback(async (provider: string, modelId: string) => {
		if (activeConversation) {
			// Update conversation model
			await manager.updateConversationModel({
				conversationId: activeConversation.meta.id,
				modelId,
				provider,
			});

			// Reload conversation
			const updatedConv = await manager.readConversation(activeConversation.meta.id, false);
			if (updatedConv) {
				useProjectStore.getState().setActiveConversation(updatedConv);
				useProjectStore.getState().updateConversation(updatedConv);
				useChatViewStore.getState().setConversation(updatedConv);
			}
		} else {
			// Store as initial selection
			setSelectedModel({ provider, modelId });
		}
	}, [activeConversation, manager, setSelectedModel]);

	// Callback for searching context items in context menu
	const handleSearchContext = useCallback(async (query: string, currentFolder?: string): Promise<FileItem[]> => {
		if (!searchClient) return [];

		try {
			if (query.trim()) {
				// Search for files matching the query
				const results = await searchClient.search({
					text: query,
					scopeMode: currentFolder ? 'inFolder' : 'vault',
					scopeValue: currentFolder ? { folderPath: currentFolder } : undefined,
					topK: 8,
					searchMode: 'fulltext'
				});
				return (results.items || []).map(item => ({
					id: item.path || item.id,
					type: item.type,
					title: item.title || item.path || item.id,
					path: item.path || item.id,
					lastModified: item.lastModified,
					closeIfSelect: item.type !== 'folder', // Close menu for files, keep open for folders (navigation)
				}));
			} else {
				// Show recent files or folder contents when no query
				if (currentFolder) {
					// Show contents of current folder
					const results = await searchClient.search({
						text: '',
						scopeMode: 'inFolder',
						scopeValue: { folderPath: currentFolder },
						topK: 8,
						searchMode: 'fulltext'
					});
					return (results.items || []).map(item => ({
						id: item.path || item.id,
						type: item.type,
						title: item.title || item.path || item.id,
						path: item.path || item.id,
						lastModified: item.lastModified,
						closeIfSelect: item.type !== 'folder', // Close menu for files, keep open for folders (navigation)
					}));
				} else {
					// Show recent files at root level
					const recentFiles = await searchClient.getRecent(8);
					return recentFiles.map(item => ({
						id: item.path || item.id,
						type: item.type,
						title: item.title || item.path || item.id,
						path: item.path || item.id,
						lastModified: item.lastModified,
						closeIfSelect: item.type !== 'folder', // Close menu for files, keep open for folders (navigation)
					}));
				}
			}
		} catch (error) {
			console.error('Error searching files:', error);
			return [];
		}
	}, [searchClient]);

	// Initialize menu context items
	useEffect(() => {
		const initializeMenuItems = async () => {
			try {
				const initialItems = await handleSearchContext('', undefined);
				setMenuContextItems(initialItems);
			} catch (error) {
				console.error('Error initializing menu items:', error);
				setMenuContextItems([]);
			}
		};

		initializeMenuItems();
	}, [handleSearchContext]);

	// Callback for searching prompts in prompt menu
	const handleSearchPrompts = useCallback(async (query: string): Promise<ExternalPromptInfo[]> => {
		// Filter prompts based on query
		if (!query.trim()) {
			return promptsSuggest;
		}

		const lowerQuery = query.toLowerCase();
		return promptsSuggest.filter(prompt =>
			prompt.promptNameForDisplay.toLowerCase().includes(lowerQuery) ||
			prompt.promptDesc.toLowerCase().includes(lowerQuery) ||
			prompt.promptCategory.toLowerCase().includes(lowerQuery)
		).map(prompt => ({
			...prompt,
			closeIfSelect: true, // Always close menu when selecting a prompt
		}));
	}, [promptsSuggest]);

	// Handle menu selection from PromptInputMenu
	const handleMenuSelect = useCallback(async (value: string, menuType: TriggerType, menuState: any, selectedItem?: any) => {
		const { triggerStart, triggerChar, fullText } = menuState;
		console.log('Menu select:', value, menuType, menuState, selectedItem);

		// Handle folder navigation - if selecting a folder, navigate into it instead of closing menu
		if (menuType === 'context' && selectedItem?.type === 'folder') {
			try {
				console.log('Navigating to folder:', selectedItem.path);
				// Get the contents of the selected folder
				const folderContents = await handleSearchContext('', selectedItem.path);
				setMenuContextItems(folderContents);
			} catch (error) {
				console.error('Error loading folder contents:', error);
				setMenuContextItems([]);
			}
			return; // Don't close menu or update input for folder navigation
		}

		// Replace the trigger text with the selected value, wrapped with trigger char for styling
		const endPos = triggerStart + triggerChar.length;
		const wrappedValue = ' ' + triggerChar + value + triggerChar + ' ';
		const newValue = fullText.substring(0, triggerStart) + wrappedValue + fullText.substring(endPos);

		// Update the input - we need to access the input context
		// Since we don't have direct access to inputContext here, we'll use a different approach
		// We can emit an event or use a ref to the textarea
		if (textareaRef.current) {
			textareaRef.current.value = newValue;
			textareaRef.current.focus();

			// Trigger input event to update any reactive state
			textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }));

			// Move cursor to end of inserted text
			const cursorPos = triggerStart + wrappedValue.length;
			textareaRef.current.setSelectionRange(cursorPos, cursorPos);
		}

	}, [textareaRef, handleSearchContext]);

	// Handle submit
	const handleSubmit = useCallback(async (message: PromptInputMessage) => {
		const currentInputValue = message.text;
		const currentPendingFiles = message.files;

		// Validate input
		if (!currentInputValue.trim() && currentPendingFiles.length === 0) return;
		if (isSending) return;

		setIsSending(true);
		try {
			await submitMessage({
				text: currentInputValue,
				files: currentPendingFiles,
				conversation: activeConversation,
				project: activeProject,
			});
		} catch (error) {
			console.error('[ChatInputAreaComponent] Error in handleSubmit:', error);
			// Error handling is done inside submitMessage
		} finally {
			setIsSending(false);
		}
	}, [submitMessage, activeConversation, activeProject, isSending]);

	// Calculate total token usage from all messages
	const tokenUsage = useMemo<TokenUsageInfo>(() => {
		if (!activeConversation || !activeConversation.messages || activeConversation.messages.length === 0) {
			return {
				totalUsed: 0,
			};
		}

		// Sum up token usage from all messages
		const totalUsed = activeConversation.messages.reduce((sum, msg) => {
			if (!msg.tokenUsage) return sum;
			const usage = msg.tokenUsage as any;
			const tokens = usage.totalTokens ?? usage.total_tokens ??
				((usage.promptTokens ?? usage.prompt_tokens ?? 0) + (usage.completionTokens ?? usage.completion_tokens ?? 0));
			return sum + (tokens || 0);
		}, 0);

		return {
			totalUsed,
		};
	}, [activeConversation]);

	// Clear input when conversation changes
	useEffect(() => {
		if (textareaRef.current) {
			setTimeout(() => {
				textareaRef.current?.focus();
			}, 100);
		}
	}, [activeConversation?.meta.id]);

	// Handle keyboard shortcuts (Cmd/Ctrl+K to focus input, Cmd/Ctrl+Enter for line break, Cmd/Ctrl+A for select all)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isModKey = e.metaKey || e.ctrlKey;
			const isKKey = e.key === 'k' || e.key === 'K' || e.keyCode === 75;
			const isEnterKey = e.key === 'Enter';
			const isAKey = e.key === 'a' || e.key === 'A' || e.keyCode === 65;

			// Cmd/Ctrl+K to focus input
			if (isModKey && isKKey) {
				const activeElement = document.activeElement;
				if (textareaRef.current && activeElement !== textareaRef.current) {
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					setTimeout(() => {
						textareaRef.current?.focus();
					}, 100);
					return false;
				}
			}

			// Cmd/Ctrl+Enter for line break in textarea
			if (isModKey && isEnterKey && textareaRef.current) {
				e.preventDefault();
				e.stopPropagation();

				const textarea = textareaRef.current;
				const start = textarea.selectionStart;
				const end = textarea.selectionEnd;
				const value = textarea.value;

				// Insert line break at cursor position
				textarea.value = value.substring(0, start) + '\n' + value.substring(end);
				textarea.selectionStart = textarea.selectionEnd = start + 1;

				// Trigger input event to update any reactive state
				textarea.dispatchEvent(new Event('input', { bubbles: true }));
			}

			// Cmd/Ctrl+A for select all in textarea
			if (isModKey && isAKey && textareaRef.current) {
				e.preventDefault();
				e.stopPropagation();

				const textarea = textareaRef.current;
				textarea.select();
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
		};
	}, []);

	const hasMessages = activeConversation && activeConversation.messages.length > 0;
	const placeholder = (hasMessages ? '' : 'Type your message here...\n')
		+ '@ or [[]] for context. / for prompts. ⌘ ↩︎ for a line break.';

	// Check if streaming is active
	const isStreaming = useMessageStore((state) => state.streamingMessageId !== null);

	// Handle cancel stream
	const handleCancelStream = useCallback(async () => {
		if (isStreaming) {
			console.log('[ChatInputArea] Canceling stream');
			await cancelStream();
			// Note: setIsSending(false) will be called in handleSubmit's finally block
			// But we set it here immediately for better UX
			setIsSending(false);
		}
	}, [isStreaming, cancelStream]);


	// Button status: 'ready' (blue + Enter) when not sending, 'streaming' when streaming, 'submitted' when sending but not streaming
	const status: 'ready' | 'submitted' | 'streaming' | 'error' = isStreaming ? 'streaming' : (isSending ? 'submitted' : 'ready');

	return (
		<div ref={containerRef} className="pktw-relative pktw-px-6 pktw-pt-2 pktw-pb-6 pktw-border-t pktw-border-border pktw-flex-shrink-0">
			<PromptInput
				className={cn(
					'pktw-flex pktw-flex-col pktw-w-full pktw-border pktw-rounded-lg',
					'pktw-border-[var(--background-modifier-border)]',
					'pktw-shadow-[0_0_0_2px_rgba(59,130,246,0.1)]',
					'focus-within:pktw-border-accent focus-within:pktw-shadow-[0_0_0_4px_rgba(59,130,246,0.4)]'
				)}
				globalDrop
				multiple
				inputFocusRef={inputFocusRef}
				onSubmit={handleSubmit}
			>
				{/* Clear input handler */}
				<InputClearHandler isSending={isSending} />

				{/* Menu handler */}
				<PromptInputMenu
					textareaRef={textareaRef}
					containerRef={containerRef}
					initialContextItems={menuContextItems}
					onSearchContext={handleSearchContext}
					prompts={promptsSuggest}
					onSearchPrompts={handleSearchPrompts}
					onMenuSelect={handleMenuSelect}
				/>

				{/* Attachments display */}
				<PromptInputAttachments />

				{/* Textarea */}
				<PromptInputBody
					ref={textareaRef}
					inputRef={inputFocusRef}
					placeholder={placeholder}
				/>

				{/* Footer with tools and submit */}
				<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-1.5 pktw-px-3 pktw-py-2">
					{/* Left side: tools */}
					<div className="pktw-flex pktw-items-center pktw-gap-0.5">
						<PromptInputFileButton
							attachmentHandlingMode={attachmentHandlingMode}
							onAttachmentHandlingModeChange={handleAttachmentHandlingModeChange}
						/>
						<PromptInputSearchButton
							active={isSearchActive}
							searchProvider={searchProvider}
							enableWebSearch={enableWebSearch}
							enableTwitterSearch={enableTwitterSearch}
							enableRedditSearch={enableRedditSearch}
							onToggleActive={() => setSearchActive(!isSearchActive)}
							onChangeProvider={setSearchProvider}
							onToggleWebSearch={setEnableWebSearch}
							onToggleTwitterSearch={setEnableTwitterSearch}
							onToggleRedditSearch={setEnableRedditSearch}
						/>
						<HoverButton
							icon={Settings2}
							menuId="output-control-settings"
							menuClassName="pktw-w-[560px] pktw-p-1 pktw-bg-white pktw-border pktw-z-50"
							hoverMenuContent={
								<OutputControlSettingsList
									settings={currentLlmOutputControlSettings}
									onChange={handleLlmOutputControlSettingsChange}
									variant="compact"
									useLocalState={true}
								/>
							}
						/>
						<ToolButton
							isCodeInterpreterEnabled={isCodeInterpreterEnabled}
							onCodeInterpreterEnabledChange={setIsCodeInterpreterEnabled}
						/>
					</div>

					{/* Right side: mode selector, model selector, token usage and submit */}
					<div className="pktw-flex pktw-items-center pktw-gap-1.5">
						<ModeSelector
							selectedMode={chatMode}
							onModeChange={setChatMode}
						/>
						<ModelSelector
							models={models}
							isLoading={isModelsLoading}
							currentModel={currentModel}
							onChange={handleModelChange}
							placeholder="No model selected"
						/>
						<TokenUsage usage={tokenUsage} conversation={activeConversation} />
						<PromptInputSubmit
							status={status}
							onCancel={isStreaming ? handleCancelStream : undefined}
						/>
					</div>
				</div>
			</PromptInput>
		</div>
	);
};

