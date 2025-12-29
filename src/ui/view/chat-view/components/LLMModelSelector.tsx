import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { useChatViewStore } from '../store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { AlertTriangle } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ModelSelector } from '@/ui/component/mine/ModelSelector';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { SettingsUpdatedEvent, ViewEventType } from '@/core/eventBus';

/**
 * React component for model selector in chat view.
 * Uses the generic ModelSelector component and adds unavailable model warning.
 */
export const LLMModelSelector: React.FC = () => {
	const { manager, eventBus } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
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
	const currentModelId = useMemo(() => {
		return activeConversation?.meta.activeModel || manager?.getSettings().defaultModel.modelId;
	}, [activeConversation?.meta.activeModel, manager]);

	const currentProvider = useMemo(() => {
		return activeConversation?.meta.activeProvider;
	}, [activeConversation?.meta.activeProvider]);

	// Get current model for selector
	const currentModel = useMemo(() => {
		if (!currentModelId) return undefined;
		return {
			provider: currentProvider || manager?.getSettings().defaultModel.provider || '',
			modelId: currentModelId,
		};
	}, [currentModelId, currentProvider, manager]);

	// Check if current model is available and get reason if not
	const { isModelAvailable, unavailabilityReason } = useMemo(() => {
		if (!currentModelId) {
			return { isModelAvailable: true, unavailabilityReason: null };
		}

		const settings = manager.getSettings();
		const providerConfigs = settings.llmProviderConfigs || {};

		if (currentProvider) {
			const providerConfig = providerConfigs[currentProvider];

			// Check if provider is disabled
			if (!providerConfig || providerConfig.enabled !== true) {
				return {
					isModelAvailable: false,
					unavailabilityReason: `Provider "${currentProvider}" is disabled. Please enable it in Settings. or switch to another provider.`,
				};
			}

			// Check if model is disabled
			const modelConfig = providerConfig.modelConfigs?.[currentModelId];
			if (modelConfig && modelConfig.enabled === false) {
				return {
					isModelAvailable: false,
					unavailabilityReason: `Model "${currentModelId}" is disabled. Please enable it in Settings. or switch to another model.`,
				};
			}
		}

		return {
			isModelAvailable: true,
			unavailabilityReason: null,
		};
	}, [currentModelId, currentProvider, manager]);

	// Handle model change
	const handleModelChange = useCallback(
		async (provider: string, modelId: string) => {
			if (!activeConversation) return;

			const updatedConv = await manager.updateConversationModel({
				conversation: activeConversation,
				project: activeProject,
				modelId,
				provider: provider,
			});

			// Update conversation in store
			useChatViewStore.getState().setConversation(updatedConv);
		},
		[activeConversation, activeProject, manager]
	);

	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1.5">
			<ModelSelector
				models={models}
				isLoading={isLoading}
				currentModel={currentModel}
				onChange={handleModelChange}
				placeholder="No model selected"
			/>
			{!isModelAvailable && currentModelId && unavailabilityReason && (
				<div className="pktw-relative pktw-flex-shrink-0 pktw-group">
					<AlertTriangle
						className="pktw-text-[#ff6b6b] pktw-cursor-help"
						size={16}
						style={{ minWidth: '16px' }}
					/>
					{/* Tooltip - displayed below the icon */}
					<div className="pktw-absolute pktw-top-full pktw-left-1/2 pktw-transform pktw--translate-x-1/2 pktw-mt-2 pktw-opacity-0 pktw-invisible group-hover:pktw-opacity-100 group-hover:pktw-visible pktw-transition-opacity pktw-duration-200 pktw-z-[10001] pktw-pointer-events-none">
						<div className="pktw-bg-[#000000] pktw-text-white pktw-text-xs pktw-rounded pktw-px-4 pktw-py-2.5 pktw-shadow-lg pktw-min-w-[320px] pktw-max-w-[400px] pktw-whitespace-normal">
							{unavailabilityReason}
							<div className="pktw-absolute pktw-bottom-full pktw-left-1/2 pktw-transform pktw--translate-x-1/2 pktw-w-0 pktw-h-0 pktw-border-l-[6px] pktw-border-r-[6px] pktw-border-b-[6px] pktw-border-transparent pktw-border-b-[#000000]"></div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

