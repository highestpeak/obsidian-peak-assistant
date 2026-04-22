import React, { useState, useRef, useCallback } from 'react';
import { useChatDataStore } from '@/ui/store/chatDataStore';
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
} from '@/ui/component/prompt-input';
import { ToolButton } from '@/ui/component/prompt-input';
import { ModeSelector } from '../../../component/prompt-input/ModeSelector';
import { cn } from '@/ui/react/lib/utils';
import { useChatSubmit } from '../hooks/useChatSubmit';
import { ChatTag, useChatViewStore } from '../store/chatViewStore';
import { ModelSelector } from '@/ui/component/mine/ModelSelector';
import { HoverButton, OutputControlSettingsList } from '@/ui/component/mine';
import { Settings2 } from 'lucide-react';
import { useModels } from '@/ui/hooks/useModels';
import { useContextSearch } from '../hooks/useContextSearch';
import { useInputKeyboard } from '../hooks/useInputKeyboard';
import { useTokenUsage } from '../hooks/useTokenUsage';

// ---------------------------------------------------------------------------
// Internal helper: clears input on send start
// ---------------------------------------------------------------------------

const InputClearHandler: React.FC<{ isSending: boolean }> = ({ isSending }) => {
	const inputContext = usePromptInputContext();
	const prevRef = React.useRef(isSending);
	React.useEffect(() => {
		if (!prevRef.current && isSending) {
			inputContext.textInput.clear();
			inputContext.attachments.clear();
		}
		prevRef.current = isSending;
	}, [isSending, inputContext]);
	return null;
};

// ---------------------------------------------------------------------------
// ChatInputAreaComponent
// ---------------------------------------------------------------------------

export const ChatInputAreaComponent: React.FC = () => {
	const store = useChatViewStore();
	const { models, isModelsLoading } = useModels();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const activeProject = useChatDataStore((s) => s.activeProject);
	const isStreaming = useChatDataStore((s) => s.streamingMessageId !== null);

	const [isSending, setIsSending] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const inputFocusRef = useRef<{ focus: () => void } | null>(null);

	const { submitMessage, cancelStream } = useChatSubmit();
	const { menuContextItems, handleSearchContext, handleSearchPrompts, handleMenuSelect } = useContextSearch();
	useInputKeyboard(textareaRef, activeConversation?.meta?.id ?? null);
	const tokenUsage = useTokenUsage(activeConversation);

	const handleTextChange = useCallback((_text: string, tags: ChatTag[]) => {
		store.setCurrentInputTags(tags);
	}, [store.setCurrentInputTags]);

	const handleSubmit = useCallback(async (message: PromptInputMessage) => {
		if (!message.text.trim() && message.files.length === 0) return;
		if (isSending) return;
		setIsSending(true);
		try {
			await submitMessage({
				text: message.text,
				files: message.files,
				conversation: activeConversation,
				project: activeProject,
			});
		} catch (error) {
			console.error('[ChatInputArea] handleSubmit error:', error);
		} finally {
			setIsSending(false);
		}
	}, [submitMessage, activeConversation, activeProject, isSending]);

	const handleCancelStream = useCallback(async () => {
		if (isStreaming) {
			await cancelStream();
			setIsSending(false);
		}
	}, [isStreaming, cancelStream]);

	const status: 'ready' | 'submitted' | 'streaming' = isStreaming ? 'streaming' : (isSending ? 'submitted' : 'ready');
	const hasMessages = activeConversation && activeConversation.messages.length > 0;
	const placeholder = hasMessages ? 'Ask anything...' : 'Ask anything... (@ for context, / for prompts)';

	return (
		<div className="pktw-relative pktw-px-6 pktw-pt-2 pktw-pb-6 pktw-border-t pktw-border-border pktw-flex-shrink-0">
			<PromptInput
				className={cn(
					'pktw-flex pktw-flex-col pktw-w-full pktw-border pktw-rounded-lg',
					'pktw-border-[var(--background-modifier-border)]',
					'pktw-shadow-[0_0_0_2px_rgba(59,130,246,0.1)]',
					'focus-within:pktw-border-accent focus-within:pktw-shadow-[0_0_0_4px_rgba(59,130,246,0.4)]',
				)}
				globalDrop
				multiple
				inputFocusRef={inputFocusRef}
				onSubmit={handleSubmit}
				contextItems={menuContextItems}
				promptItems={store.promptsSuggest}
				onLoadContextItems={handleSearchContext}
				onLoadPromptItems={handleSearchPrompts}
				onMenuItemSelect={handleMenuSelect}
				onTextChange={handleTextChange}
			>
				<InputClearHandler isSending={isSending} />
				<PromptInputAttachments />
				<PromptInputBody ref={textareaRef} inputRef={inputFocusRef} placeholder={placeholder} />

				{/* Footer: tools + submit */}
				<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-1.5 pktw-px-3 pktw-py-2">
					<div className="pktw-flex pktw-items-center pktw-gap-0.5">
						<PromptInputFileButton
							attachmentHandlingMode={store.attachmentHandlingMode}
							onAttachmentHandlingModeChange={store.setAttachmentHandlingMode}
						/>
						<PromptInputSearchButton
							active={store.isSearchActive}
							searchProvider={store.searchProvider}
							enableWebSearch={store.enableWebSearch}
							enableVaultSearch={store.enableVaultSearch}
							enableTwitterSearch={false}
							enableRedditSearch={false}
							onToggleActive={() => store.setSearchActive(!store.isSearchActive)}
							onChangeProvider={store.setSearchProvider}
							onToggleWebSearch={store.setEnableWebSearch}
							onToggleVaultSearch={store.setEnableVaultSearch}
							onToggleTwitterSearch={() => {}}
							onToggleRedditSearch={() => {}}
						/>
						<HoverButton
							icon={Settings2}
							menuId="output-control-settings"
							menuClassName="pktw-w-[560px] pktw-p-1 pktw-bg-white pktw-border pktw-z-50"
							hoverMenuContent={
								<OutputControlSettingsList
									settings={store.llmOutputControlSettings}
									onChange={store.setLlmOutputControlSettings}
									variant="compact"
									useLocalState
								/>
							}
						/>
						<ToolButton
							isCodeInterpreterEnabled={store.isCodeInterpreterEnabled}
							onCodeInterpreterEnabledChange={store.setIsCodeInterpreterEnabled}
						/>
					</div>
					<div className="pktw-flex pktw-items-center pktw-gap-1.5">
						<ModeSelector selectedMode={store.chatMode} onModeChange={store.setChatMode} />
						<ModelSelector
							models={models}
							isLoading={isModelsLoading}
							currentModel={store.selectedModel}
							onChange={async (p: string, m: string) => store.setSelectedModel(p, m)}
							placeholder="No model selected"
						/>
						<TokenUsage usage={tokenUsage} conversation={activeConversation} />
						<PromptInputSubmit status={status} onCancel={isStreaming ? handleCancelStream : undefined} />
					</div>
				</div>
			</PromptInput>
		</div>
	);
};
