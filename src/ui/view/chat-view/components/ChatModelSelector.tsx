import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '../store/chatViewStore';
import {
	ModelSelector as ModelSelectorPrimitive,
	ModelSelectorTrigger,
	ModelSelectorContent,
	ModelSelectorInput,
	ModelSelectorList,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorItem,
	ModelSelectorLogo,
	ModelSelectorName,
} from '@/ui/component/ai-elements';
import { CheckIcon } from 'lucide-react';
import type { ModelInfoForSwitch } from '@/core/providers/types';

interface ChatModelSelectorProps {
	/**
	 * Optional: Currently selected model (provider and modelId)
	 * If not provided, will use activeConversation's model
	 */
	selectedModel?: {
		provider: string;
		modelId: string;
	};
	/**
	 * Optional: Callback when model is changed
	 * If not provided, will update activeConversation
	 */
	onModelChange?: (provider: string, modelId: string) => void;
	/**
	 * Optional: Custom placeholder for search input
	 */
	searchPlaceholder?: string;
	/**
	 * Optional: Custom empty state message
	 */
	emptyMessage?: string;
}

/**
 * Chat model selector component
 * Can be used with or without conversation context
 * - With conversation: automatically syncs with activeConversation
 * - Without conversation: use selectedModel and onModelChange props
 */
export const ChatModelSelector: React.FC<ChatModelSelectorProps> = ({
	selectedModel: selectedModelProp,
	onModelChange: onModelChangeProp,
	searchPlaceholder: modelSearchPlaceholder = 'Search available models...',
	emptyMessage = 'No available models found.',
}) => {
	const { manager } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [models, setModels] = useState<ModelInfoForSwitch[]>([]);

	// Load models from manager
	useEffect(() => {
		const loadModels = async () => {
			try {
				const allModels = await manager.getAllAvailableModels();
				setModels(allModels);
			} catch (error) {
				console.error('[ChatModelSelector] Error loading models:', error);
			}
		};
		loadModels();
	}, [manager]);

	// Get selected model from props or activeConversation
	const selectedModel = useMemo(() => {
		if (selectedModelProp) {
			return selectedModelProp;
		}
		if (activeConversation) {
			const defaultModel = manager.getSettings().defaultModel;
			return {
				provider: activeConversation.meta.activeProvider || defaultModel.provider,
				modelId: activeConversation.meta.activeModel || defaultModel.modelId,
			};
		}
		return undefined;
	}, [selectedModelProp, activeConversation, manager]);

	// Find selected model info
	const selectedModelInfo = useMemo(() => {
		if (!selectedModel) return null;
		return models.find(
			(m) => m.id === selectedModel.modelId && m.provider === selectedModel.provider
		);
	}, [models, selectedModel]);

	// Group models by provider
	const modelsByProvider = useMemo(() => {
		const grouped = new Map<string, ModelInfoForSwitch[]>();
		models.forEach((model) => {
			const key = model.provider;
			if (!grouped.has(key)) {
				grouped.set(key, []);
			}
			grouped.get(key)!.push(model);
		});
		return grouped;
	}, [models]);

	// Handle model change
	const handleModelChange = useCallback(
		async (provider: string, modelId: string) => {
			// If onModelChange prop is provided, use it
			if (onModelChangeProp) {
				onModelChangeProp(provider, modelId);
				setModelSelectorOpen(false);
				return;
			}

			// Otherwise, update activeConversation if available
			if (!activeConversation) return;

			const updatedConv = await manager.updateConversationModel({
				conversation: activeConversation,
				project: activeProject,
				modelId,
				provider: provider,
			});

			useChatViewStore.getState().setConversation(updatedConv);
			setModelSelectorOpen(false);
		},
		[onModelChangeProp, activeConversation, activeProject, manager]
	);

	if (models.length === 0) {
		return null;
	}

	return (
		<ModelSelectorPrimitive onOpenChange={setModelSelectorOpen} open={modelSelectorOpen}>
			<ModelSelectorTrigger asChild>
				<button className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-bg-secondary pktw-border pktw-border-border pktw-rounded-md pktw-text-sm">
					{selectedModelInfo?.icon && <ModelSelectorLogo provider={selectedModelInfo.icon} />}
					{selectedModelInfo?.displayName && (
						<ModelSelectorName>{selectedModelInfo.displayName}</ModelSelectorName>
					)}
					{!selectedModelInfo && (
						<ModelSelectorName>Select model</ModelSelectorName>
					)}
				</button>
			</ModelSelectorTrigger>
			<ModelSelectorContent>
				<ModelSelectorInput placeholder={modelSearchPlaceholder} />
				<ModelSelectorList>
					<ModelSelectorEmpty>{emptyMessage}</ModelSelectorEmpty>
					{Array.from(modelsByProvider.entries()).map(([provider, providerModels]) => (
						<ModelSelectorGroup key={provider} heading={provider}>
							{providerModels.map((model) => {
								const isSelected =
									selectedModel?.modelId === model.id &&
									selectedModel?.provider === model.provider;
								return (
									<ModelSelectorItem
										key={`${model.provider}-${model.id}`}
										onSelect={() => {
											handleModelChange(model.provider, model.id);
										}}
										value={`${model.provider}-${model.id}`}
									>
										{model.icon && <ModelSelectorLogo provider={model.icon} />}
										<ModelSelectorName>{model.displayName}</ModelSelectorName>
										{isSelected ? (
											<CheckIcon className="pktw-ml-auto pktw-size-4" />
										) : (
											<div className="pktw-ml-auto pktw-size-4" />
										)}
									</ModelSelectorItem>
								);
							})}
						</ModelSelectorGroup>
					))}
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelectorPrimitive>
	);
};
