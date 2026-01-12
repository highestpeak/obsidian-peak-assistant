import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { useMessageStore } from '@/ui/view/chat-view/store/messageStore';
import {
	PromptInput,
	PromptInputBody,
	PromptInputAttachments,
	PromptInputFileButton,
	PromptInputSearchButton,
	PromptInputSubmit,
	TokenUsage,
	usePromptInputContext,
	type PromptInputMessage,
	type TokenUsageInfo,
} from '@/ui/component/prompt-input';
import { ToolButton } from '@/ui/component/prompt-input';
import { ModeSelector } from '../../../component/prompt-input/ModeSelector';
import { cn } from '@/ui/react/lib/utils';
import { useChatSubmit } from '../hooks/useChatSubmit';
import { ChatTag, useChatSessionStore } from '../store/chatSessionStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type { NavigableMenuItem } from '@/ui/component/mine/NavigableMenu';
import { getFileIcon } from '@/ui/view/shared/file-utils';
import { ModelSelector } from '@/ui/component/mine/ModelSelector';
import { HoverButton, OutputControlSettingsList } from '@/ui/component/mine';
import { Settings2 } from 'lucide-react';
import { useModels } from '@/ui/hooks/useModels';
import { SearchResultItem } from '@/service/search/types';

// Constants for search configuration
const RECENT_FILES_COUNT = 3;
const SEARCH_RESULTS_TOP_K = 20;

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
		enableVaultSearch,
		enableTwitterSearch,
		enableRedditSearch,
		attachmentHandlingMode,
		llmOutputControlSettings,
		isCodeInterpreterEnabled,
		chatMode,
		selectedModel,
		setSearchActive,
		setSearchProvider,
		setEnableWebSearch,
		setEnableVaultSearch,
		setEnableTwitterSearch,
		setEnableRedditSearch,
		setAttachmentHandlingMode,
		setLlmOutputControlSettings,
		setIsCodeInterpreterEnabled,
		setChatMode,
		setSelectedModel
	} = useChatSessionStore();

	// Use the models hook for managing model data
	const { models, isModelsLoading } = useModels();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const [isSending, setIsSending] = useState(false);
	const [menuContextItems, setMenuContextItems] = useState<NavigableMenuItem[]>([]);
	const { searchClient, manager } = useServiceContext();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const inputFocusRef = useRef<{ focus: () => void } | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const { submitMessage, cancelStream } = useChatSubmit();
	const { setCurrentInputTags } = useChatSessionStore();

	// Handle text changes with pre-parsed tags
	const handleTextChange = useCallback((text: string, tags: ChatTag[]) => {
		setCurrentInputTags(tags);
	}, [setCurrentInputTags]);

	// Callback for searching context items in context menu
	const handleSearchContext = useCallback(async (query: string, currentFolder?: string): Promise<NavigableMenuItem[]> => {
		if (!searchClient) return [];

		try {
			// todo maybe we can filter among existing menu context items first. and then search the rest from db to get better performance.
			console.debug('[ChatInputAreaComponent] Searching context:', query, currentFolder);

			// always have recent files in the menu
			let results: SearchResultItem[] = await searchClient.getRecent(RECENT_FILES_COUNT);
			if (query.trim() || currentFolder) {
				const searchResults = await searchClient.search({
					text: query.trim() || '',
					scopeMode: currentFolder ? 'inFolder' : 'vault',
					scopeValue: currentFolder ? { folderPath: currentFolder } : undefined,
					topK: SEARCH_RESULTS_TOP_K,
					searchMode: 'fulltext'
				});
				results.push(...(searchResults.items || []));
			}

			// Deduplicate results based on path/id to prevent duplicate React keys
			const seen = new Set<string>();
			const uniqueResults = results.filter(item => {
				const key = item.path || item.id;
				if (seen.has(key)) {
					return false;
				}
				seen.add(key);
				return true;
			});

			return uniqueResults.map((item: SearchResultItem) => ({
				id: item.path || item.id,
				label: item.title || item.path || item.id,
				description: item.path || item.id,
				value: item.path || item.id,
				icon: (isSelected: boolean) => getFileIcon(item.type, isSelected),
				showArrow: item.type === 'folder'
			}));
		} catch (error) {
			console.error('Error searching files:', error);
			return [];
		}
	}, [searchClient]);

	// Initialize menu context items
	useEffect(() => {
		handleSearchContext('', undefined).then(setMenuContextItems);
	}, [handleSearchContext]);

	// Callback for searching prompts in prompt menu
	const handleSearchPrompts = useCallback(async (query: string): Promise<NavigableMenuItem[]> => {
		// Combine results from local prompts and external prompt service search
		const results: NavigableMenuItem[] = [];

		// 1. Filter local prompts
		let localPrompts: NavigableMenuItem[] = [];
		if (!query.trim()) {
			localPrompts = promptsSuggest;
		} else {
			const lowerQuery = query.toLowerCase();
			localPrompts = promptsSuggest.filter(prompt =>
				prompt.label.toLowerCase().includes(lowerQuery) ||
				prompt.description?.toLowerCase().includes(lowerQuery) ||
				prompt.value.toLowerCase().includes(lowerQuery)
			);
		}
		results.push(...localPrompts);

		// 2. Search external prompts using AI service manager
		if (query.trim()) {
			try {
				const externalPrompts = await manager.searchPrompts(query);
				results.push(...externalPrompts);
			} catch (error) {
				console.error('Error searching external prompts:', error);
			}
		}

		// Deduplicate results by value, keeping the first occurrence
		const seen = new Set();
		const dedupedResults = [];
		for (const item of results) {
			if (!seen.has(item.value)) {
				seen.add(item.value);
				dedupedResults.push(item);
			}
		}

		return results;
	}, [promptsSuggest]);

	// Handle menu selection from CodeMirror autocompletion
	const handleMenuSelect = useCallback(async (triggerChar: string, selectedItem?: any) => {
		console.debug('[ChatInputAreaComponent] Trigger ', triggerChar, '.selected item:', selectedItem);

		// Handle folder navigation - if selecting a folder with @ or [[ triggers, navigate into it instead of closing menu
		const isContextTrigger = triggerChar === '@' || triggerChar === '[[';
		if (isContextTrigger && selectedItem?.showArrow) {
			try {
				console.debug('[ChatInputAreaComponent] Navigating to folder:', selectedItem.value);
				// Get the contents of the selected folder
				const folderContents = await handleSearchContext('', selectedItem.value);
				setMenuContextItems(folderContents);
			} catch (error) {
				console.error('Error loading folder contents:', error);
				setMenuContextItems([]);
			}
			// Don't close menu or update input for folder navigation
		}

		// For CodeMirror, text insertion is handled by the autocompletion apply function
		// We don't need to manually update the DOM here
	}, [handleSearchContext, handleSearchPrompts]);

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
				contextItems={menuContextItems}
				promptItems={promptsSuggest}
				onLoadContextItems={handleSearchContext}
				onLoadPromptItems={handleSearchPrompts}
				onMenuItemSelect={handleMenuSelect}
				onTextChange={handleTextChange}
			>
				{/* Clear input handler */}
				<InputClearHandler isSending={isSending} />

				{/* Menu handler - Now handled by CodeMirror autocompletion */}
				{/* Removed CharTriggerMenu components as CodeMirror handles autocompletion */}

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
							onAttachmentHandlingModeChange={setAttachmentHandlingMode}
						/>
						<PromptInputSearchButton
							active={isSearchActive}
							searchProvider={searchProvider}
							enableWebSearch={enableWebSearch}
							enableVaultSearch={enableVaultSearch}
							enableTwitterSearch={enableTwitterSearch}
							enableRedditSearch={enableRedditSearch}
							onToggleActive={() => setSearchActive(!isSearchActive)}
							onChangeProvider={setSearchProvider}
							onToggleWebSearch={setEnableWebSearch}
							onToggleVaultSearch={setEnableVaultSearch}
							onToggleTwitterSearch={setEnableTwitterSearch}
							onToggleRedditSearch={setEnableRedditSearch}
						/>
						<HoverButton
							icon={Settings2}
							menuId="output-control-settings"
							menuClassName="pktw-w-[560px] pktw-p-1 pktw-bg-white pktw-border pktw-z-50"
							hoverMenuContent={
								<OutputControlSettingsList
									settings={llmOutputControlSettings}
									onChange={setLlmOutputControlSettings}
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
							currentModel={selectedModel}
							onChange={async (provider: string, modelId: string) => setSelectedModel(provider, modelId)}
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

