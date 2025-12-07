import React, { useState, useEffect, useCallback } from 'react';
import { AIModelId } from '@/service/chat/types-models';
import { LLMProvider } from '@/service/chat/providers/types';
import { useChatViewStore } from '../store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { ChevronDown, Check } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { cn } from '@/ui/react/lib/utils';

interface ModelInfo {
	id: AIModelId;
	displayName: string;
	provider: string;
}

/**
 * React component for model selector
 */
export const LLMModelSelector: React.FC = () => {
	const { manager } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);

	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [models, setModels] = useState<ModelInfo[]>([]);
	const [currentModelName, setCurrentModelName] = useState<string>('');
	const [isLoading, setIsLoading] = useState(true);

	// Initialize and load models
	useEffect(() => {
		const loadModels = async () => {
			try {
				const allModels = await manager.getAllAvailableModels();
				setModels(allModels);
			} catch (error) {
				console.error('[ModelSelector] Error loading models:', error);
			} finally {
				setIsLoading(false);
			}
		};
		loadModels();
	}, []);

	// Handle model change
	const handleModelChange = useCallback(async (provider: string, modelId: AIModelId) => {
		if (!activeConversation) return;

		const updatedConv = await manager.updateConversationModel({
			conversation: activeConversation,
			project: activeProject,
			modelId,
			provider: provider as LLMProvider,
		});

		useChatViewStore.getState().setConversation(updatedConv);

		const currentModel = activeConversation?.meta.activeModel || manager.getSettings().defaultModelId;
		const model = models.find(m => m.id === currentModel);
		setCurrentModelName(model?.displayName || currentModel);
	}, [activeConversation, activeProject, models]);


	const handleModelSelect = useCallback(async (provider: string, modelId: AIModelId) => {
		await handleModelChange(provider, modelId);
		setIsMenuOpen(false);
	}, [handleModelChange]);

	const currentModel = activeConversation?.meta.activeModel || manager?.getSettings().defaultModelId;

	return (
		<div className="pktw-relative pktw-inline-block">
			<button
				className="pktw-flex pktw-items-center pktw-justify-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-bg-secondary pktw-border pktw-border-border pktw-rounded-md pktw-text-foreground pktw-text-[13px] pktw-font-medium pktw-cursor-pointer pktw-transition-all pktw-duration-200 pktw-whitespace-nowrap hover:pktw-bg-hover hover:pktw-border-accent"
				onClick={(e) => {
					e.stopPropagation();
					setIsMenuOpen(!isMenuOpen);
				}}
			>
				<span>{currentModelName || 'Loading...'}</span>
				<ChevronDown className="pktw-flex-shrink-0 pktw-transition-transform pktw-duration-200 hover:pktw-translate-y-px" size={14} style={{ marginLeft: '6px' }} />
			</button>

			{isMenuOpen && (
				<div
					className="pktw-absolute pktw-top-full pktw-left-0 pktw-mt-1 pktw-bg-primary pktw-border pktw-border-border pktw-rounded-lg pktw-shadow-lg pktw-max-h-[400px] pktw-overflow-y-auto pktw-overflow-x-hidden pktw-z-[10000]"
				>
					{isLoading ? (
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-6 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors pktw-duration-150 pktw-border-b pktw-border-border pktw-min-w-[200px] hover:pktw-bg-hover">
							<div className="pktw-flex-1 pktw-text-[14px] pktw-font-medium pktw-text-foreground pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">Loading models...</div>
						</div>
					) : models.length === 0 ? (
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-6 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors pktw-duration-150 pktw-border-b pktw-border-border pktw-min-w-[200px] hover:pktw-bg-hover">
							<div className="pktw-flex-1 pktw-text-[14px] pktw-font-medium pktw-text-foreground pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">No models available</div>
						</div>
					) : (
						models.map((model) => (
							<div
								key={`${model.provider}-${model.id}`}
								className={cn(
									"pktw-flex pktw-items-center pktw-justify-between pktw-px-6 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors pktw-duration-150 pktw-border-b pktw-border-border pktw-min-w-[200px]",
									"last:pktw-border-b-0 hover:pktw-bg-hover",
									model.id === currentModel && "pktw-bg-[var(--background-modifier-active)]"
								)}
								onClick={() => handleModelSelect(model.provider, model.id)}
							>
								<div className="pktw-flex-1 pktw-text-[14px] pktw-font-medium pktw-text-foreground pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">{model.displayName}</div>
								{model.id === currentModel && (
									<Check className="pktw-flex-shrink-0 pktw-ml-2 pktw-text-accent" size={14} strokeWidth={3} />
								)}
							</div>
						))
					)}
				</div>
			)}
		</div>
	);
};

