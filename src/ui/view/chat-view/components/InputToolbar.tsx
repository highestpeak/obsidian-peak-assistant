import React, { useRef, useState, useEffect } from 'react';
import {
	PromptInputFileButton,
	PromptInputSearchButton,
	PromptInputSubmit,
	TokenUsage,
} from '@/ui/component/prompt-input';
import { ToolButton } from '@/ui/component/prompt-input';
import { ModeSelector } from '../../../component/prompt-input/ModeSelector';
import { useChatViewStore } from '../store/chatViewStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { ModelSelector } from '@/ui/component/mine/ModelSelector';
import { HoverButton, OutputControlSettingsList } from '@/ui/component/mine';
import { Settings2 } from 'lucide-react';
import { useModels } from '@/ui/hooks/useModels';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { useTokenUsage } from '../hooks/useTokenUsage';

interface InputToolbarProps {
	status: 'ready' | 'submitted' | 'streaming';
	isStreaming: boolean;
	onCancel?: () => void;
}

/**
 * Toolbar rendered inside PromptInput footer.
 * Contains file/search/settings buttons on the left, model/mode/submit on the right.
 */
export const InputToolbar: React.FC<InputToolbarProps> = ({
	status,
	isStreaming,
	onCancel,
}) => {
	const store = useChatViewStore();
	const { models, isModelsLoading } = useModels();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const tokenUsage = useTokenUsage(activeConversation);

	// Responsive toolbar: measure width and hide elements at narrow sizes
	const toolbarRef = useRef<HTMLDivElement>(null);
	const [toolbarWidth, setToolbarWidth] = useState(600);
	useEffect(() => {
		const el = toolbarRef.current;
		if (!el) return;
		const ro = new ResizeObserver(entries => {
			const w = entries[0]?.contentRect.width ?? 600;
			setToolbarWidth(w);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const isNarrow = toolbarWidth < 400;
	const isVeryNarrow = toolbarWidth < 300;

	return (
		<div ref={toolbarRef} className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-1.5 pktw-px-3 pktw-py-2">
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
					menuClassName="pktw-w-[560px] pktw-p-1 pktw-border pktw-z-50"
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
			<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-min-w-0">
				{!isVeryNarrow && <ModeSelector selectedMode={store.chatMode} onModeChange={store.setChatMode} />}
				<ModelSelector
					models={models}
					isLoading={isModelsLoading}
					currentModel={store.selectedModel}
					onChange={async (p: string, m: string) => store.setSelectedModel(p, m)}
					truncate={isNarrow}
					placeholder={(() => {
						const config = ProfileRegistry.getInstance().getConfigForMode(store.chatMode);
						return config ? `Auto (${config.modelId})` : 'No profile configured';
					})()}
				/>
				{!isNarrow && <TokenUsage usage={tokenUsage} conversation={activeConversation} />}
				<PromptInputSubmit status={status} onCancel={isStreaming ? onCancel : undefined} />
			</div>
		</div>
	);
};
