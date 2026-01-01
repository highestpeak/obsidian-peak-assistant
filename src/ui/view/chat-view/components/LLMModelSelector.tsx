import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useChatViewStore } from '../store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { AlertTriangle } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ModelSelector } from '@/ui/component/mine/ModelSelector';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { SettingsUpdatedEvent, ViewEventType } from '@/core/eventBus';
import { cn } from '@/ui/react/lib/utils';
import { usePopupPosition } from '@/ui/hooks/usePopupPosition';

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
	const tooltipContainerRef = useRef<HTMLDivElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);

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

	// Check if current model is available and get reason if not
	// Note: manager is intentionally omitted from dependencies as it's a stable reference from context
	// Settings are read inside useMemo to avoid object reference issues in dependencies
	const { isModelAvailable, unavailabilityReason } = useMemo(() => {
		if (!currentModelId || !manager) {
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
	}, [currentModelId, currentProvider]);

	// Calculate tooltip position based on available space
	const tooltipPosition = usePopupPosition(tooltipContainerRef, tooltipRef, !isModelAvailable, 120);

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

	// Tooltip position is calculated by usePopupPosition hook

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
				<div ref={tooltipContainerRef} className="pktw-relative pktw-flex-shrink-0 pktw-group">
					<AlertTriangle
						className="pktw-text-[#ff6b6b] pktw-cursor-help"
						size={16}
						style={{ minWidth: '16px' }}
					/>
					{/* Tooltip - position dynamically based on available space */}
					<div
						ref={tooltipRef}
						className={cn(
							'pktw-absolute pktw-left-1/2 pktw-transform pktw--translate-x-1/2 pktw-opacity-0 pktw-invisible group-hover:pktw-opacity-100 group-hover:pktw-visible pktw-transition-opacity pktw-duration-200 pktw-z-[10001] pktw-pointer-events-none',
							tooltipPosition === 'bottom' ? 'pktw-top-full pktw-mt-2' : 'pktw-bottom-full pktw-mb-2'
						)}
					>
						<div className="pktw-bg-[#000000] pktw-text-white pktw-text-xs pktw-rounded pktw-px-4 pktw-py-2.5 pktw-shadow-lg pktw-min-w-[320px] pktw-max-w-[400px] pktw-whitespace-normal">
							{unavailabilityReason}
							{/* Arrow pointer */}
							<div
								className={cn(
									'pktw-absolute pktw-left-1/2 pktw-transform pktw--translate-x-1/2 pktw-w-0 pktw-h-0 pktw-border-l-[6px] pktw-border-r-[6px] pktw-border-transparent',
									tooltipPosition === 'bottom'
										? 'pktw-bottom-full pktw-border-b-[6px] pktw-border-b-[#000000]'
										: 'pktw-top-full pktw-border-t-[6px] pktw-border-t-[#000000]'
								)}
							></div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

