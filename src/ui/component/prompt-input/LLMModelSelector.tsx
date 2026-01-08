import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { useChatViewStore } from '../../view/chat-view/store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { SettingsUpdatedEvent, ViewEventType } from '@/core/eventBus';
import { cn } from '@/ui/react/lib/utils';
import { ModelSelector } from '@/ui/component/mine/ModelSelector';

/**
 * React component for model selector in chat view.
 * Uses the generic ModelSelector component and adds unavailable model warning.
 */
export const LLMModelSelector: React.FC = () => {
	const { manager, eventBus } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const initialSelectedModel = useChatViewStore((state) => state.initialSelectedModel);
	const setInitialSelectedModel = useChatViewStore((state) => state.setInitialSelectedModel);
	const [models, setModels] = useState<ModelInfoForSwitch[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	// Load models function
	const loadModels = useCallback(async () => {
		if (!manager) return;
		setIsLoading(true);
		try {
			const allModels = await manager.getAllAvailableModels();
			setModels(allModels);
		} catch (error) {
			console.error('[LLMModelSelector] Error loading models:', error);
		} finally {
			setIsLoading(false);
		}
	}, [manager]);

	// Initialize and load models
	useEffect(() => {
		loadModels();
	}, [loadModels]);

	// Listen for settings updates
	useEffect(() => {
		if (!eventBus) return;
		const unsubscribe = eventBus.on<SettingsUpdatedEvent>(ViewEventType.SETTINGS_UPDATED, () => {
			loadModels();
		});
		return unsubscribe;
	}, [eventBus, loadModels]);

	// Calculate current model id and provider for comparison (reactive)
	// If there's an active conversation, use its model; otherwise use initial selected model or default
	// Use primitive values in dependencies to avoid circular reference issues
	// Note: manager is intentionally omitted from dependencies as it's a stable reference from context
	const currentModelId = useMemo(() => {
		console.log('[LLMModelSelector] currentModelId:', activeConversation?.meta.activeModel, initialSelectedModel?.modelId);
		if (activeConversation) {
			return activeConversation.meta.activeModel;
		}
		if (initialSelectedModel) {
			return initialSelectedModel.modelId;
		}
		return manager?.getSettings().defaultModel.modelId;
	}, [activeConversation?.meta.activeModel, initialSelectedModel?.modelId]);

	const currentProvider = useMemo(() => {
		if (activeConversation) {
			return activeConversation.meta.activeProvider;
		}
		if (initialSelectedModel) {
			return initialSelectedModel.provider;
		}
		return manager?.getSettings().defaultModel.provider;
	}, [activeConversation?.meta.activeProvider, initialSelectedModel?.provider]);

	useEffect(() => {
		console.log('[LLMModelSelector] currentModelId or currentProvider changed1:', { currentModelId, currentProvider });
	}, [currentModelId, currentProvider]);

	// Get current model for selector
	const currentModel = useMemo(() => {
		if (!currentModelId) return undefined;
		const defaultProvider = manager?.getSettings().defaultModel.provider || '';
		return {
			provider: currentProvider || defaultProvider,
			modelId: currentModelId,
		};
	}, [currentModelId, currentProvider]);

	// Handle model change
	const handleModelChange = useCallback(
		async (provider: string, modelId: string) => {
			console.log('handleModelChange', provider, modelId, activeConversation);
			if (activeConversation) {
				// If there's an active conversation, update it
				await manager.updateConversationModel({
					conversationId: activeConversation.meta.id,
					modelId,
					provider: provider,
				});
				// Load full conversation with messages to preserve them in the UI
				const updatedConv = await manager.readConversation(activeConversation.meta.id, true);
				if (!updatedConv) {
					throw new Error('Failed to update conversation model');
				}

				// Update conversation in store
				useChatViewStore.getState().setConversation(updatedConv);
			} else {
				// If no conversation, just store the initial selection (doesn't change default model)
				setInitialSelectedModel({ provider, modelId });
			}
		},
		[activeConversation, activeProject, manager, setInitialSelectedModel]
	);

	return (
		<ModelSelector
			models={models}
			isLoading={isLoading}
			currentModel={currentModel}
			onChange={handleModelChange}
			placeholder="No model selected"
		/>
	);
};

