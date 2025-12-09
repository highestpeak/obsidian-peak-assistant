import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ModelInfoForSwitch } from '@/service/chat/providers/types';
import { useChatViewStore } from '../store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { ChevronDown, Check, AlertTriangle } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ModelIcon } from '@lobehub/icons';
import { cn } from '@/ui/react/lib/utils';
import { ErrorBoundary } from '@/ui/react/lib/ErrorBoundary';
import { SettingsUpdatedEvent, ViewEventType } from '@/core/eventBus';

/**
 * React component for model selector
 */
export const LLMModelSelector: React.FC = () => {
	const { manager, eventBus } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);

	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [models, setModels] = useState<ModelInfoForSwitch[]>([]);
	const [currentModelName, setCurrentModelName] = useState<string>('');
	const [currentModelIcon, setCurrentModelIcon] = useState<string | undefined>(undefined);
	const [isLoading, setIsLoading] = useState(true);

	// Load models function
	const loadModels = useCallback(async () => {
		setIsLoading(true);
		try {
			const allModels = await manager.getAllAvailableModels();
			setModels(allModels);
		} catch (error) {
			console.error('[ModelSelector] Error loading models:', error);
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
		const unsubscribe = eventBus.on<SettingsUpdatedEvent>(
			ViewEventType.SETTINGS_UPDATED,
			() => {
				loadModels();
			}
		);
		return unsubscribe;
	}, [eventBus, loadModels]);

	// Calculate current model id and provider for comparison (reactive)
	const currentModelId = useMemo(() => {
		return activeConversation?.meta.activeModel || manager?.getSettings().defaultModelId;
	}, [activeConversation?.meta.activeModel, manager]);

	const currentProvider = useMemo(() => {
		return activeConversation?.meta.activeProvider;
	}, [activeConversation?.meta.activeProvider]);

	// Check if current model is available and get reason if not
	const { isModelAvailable, unavailabilityReason } = useMemo(() => {
		if (!currentModelId || models.length === 0) {
			return { isModelAvailable: false, unavailabilityReason: null };
		}

		// Check if model is in available models list
		const model = currentProvider
			? models.find(m => m.id === currentModelId && m.provider === currentProvider)
			: models.find(m => m.id === currentModelId);

		if (model) {
			return { isModelAvailable: true, unavailabilityReason: null };
		}

		// Model not found, check why it's unavailable
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
			isModelAvailable: false,
			unavailabilityReason: `Model "${currentModelId}" is not available. Please check your settings. or switch to another model.`,
		};
	}, [models, currentModelId, currentProvider, manager]);

	// Update current model name and icon when conversation or models change
	useEffect(() => {
		if (models.length === 0) {
			// If models list is empty, still try to set name from currentModelId
			setCurrentModelName(currentModelId || 'No model selected');
			setCurrentModelIcon(undefined);
			return;
		}

		// Find model by id and provider (if available)
		const model = currentProvider
			? models.find(m => m.id === currentModelId && m.provider === currentProvider)
			: models.find(m => m.id === currentModelId);

		setCurrentModelName(model?.displayName || currentModelId || 'No model selected');
		setCurrentModelIcon(model?.icon);
	}, [models, currentModelId, currentProvider]);

	// Handle model change
	const handleModelChange = useCallback(async (provider: string, modelId: string) => {
		if (!activeConversation) return;

		const updatedConv = await manager.updateConversationModel({
			conversation: activeConversation,
			project: activeProject,
			modelId,
			provider: provider,
		});

		// Update conversation in store
		useChatViewStore.getState().setConversation(updatedConv);

	}, [activeConversation, activeProject, models]);


	const handleModelSelect = useCallback(async (provider: string, modelId: string) => {
		await handleModelChange(provider, modelId);
		setIsMenuOpen(false);
	}, [handleModelChange]);

	return (
		<div className="pktw-relative pktw-inline-block">
			<div className="pktw-flex pktw-items-center pktw-gap-1.5">
				<button
					className="pktw-flex pktw-items-center pktw-justify-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-bg-secondary pktw-border pktw-border-border pktw-rounded-md pktw-text-foreground pktw-text-[13px] pktw-font-medium pktw-cursor-pointer pktw-transition-all pktw-duration-200 pktw-whitespace-nowrap hover:pktw-bg-hover hover:pktw-border-accent"
					onClick={(e) => {
						e.stopPropagation();
						setIsMenuOpen(!isMenuOpen);
					}}
				>
					{!isLoading && currentModelIcon && (
						<div className="pktw-w-4 pktw-h-4 pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-justify-center">
							<ErrorBoundary fallback={null}>
								<ModelIcon model={currentModelIcon} size={16} className="pktw-flex-shrink-0" />
							</ErrorBoundary>
						</div>
					)}
					<span>
						{isLoading ? 'Loading...' : currentModelName || 'No model selected'}
					</span>
					<ChevronDown className="pktw-flex-shrink-0 pktw-transition-transform pktw-duration-200 hover:pktw-translate-y-px" size={14} style={{ marginLeft: '6px' }} />
				</button>
				{!isLoading && !isModelAvailable && currentModelId && unavailabilityReason && (
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

			{isMenuOpen && (
				<div
					className="pktw-absolute pktw-top-full pktw-left-0 pktw-mt-1 pktw-bg-background pktw-border pktw-border-border pktw-rounded-lg pktw-shadow-lg pktw-max-h-[400px] pktw-overflow-y-auto pktw-overflow-x-hidden pktw-z-[10000]"
				>
					{isLoading ? (
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-6 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors pktw-duration-150 pktw-border-b pktw-border-border pktw-min-w-[200px] hover:pktw-bg-hover">
							<div className="pktw-flex-1 pktw-text-[14px] pktw-font-medium pktw-text-foreground pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">Loading models...</div>
						</div>
					) : models.length === 0 ? (
						<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-items-start pktw-justify-between pktw-px-6 pktw-py-2.5 pktw-min-w-[220px] pktw-bg-background">
							<div className="pktw-text-[14px] pktw-font-medium pktw-text-[#000000] pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">
								No models available
							</div>
							<div className="pktw-text-[12px] pktw-text-[#666666] pktw-mt-1">
								Please go to <span className="pktw-font-semibold">Settings</span> to configure your model api key and proxys.
							</div>
						</div>
					) : (
						models.map((model) => (
							<div
								key={`${model.provider}-${model.id}`}
								className={cn(
									"pktw-flex pktw-items-center pktw-justify-between pktw-px-6 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors pktw-duration-150 pktw-border-b pktw-border-border pktw-min-w-[200px]",
									"last:pktw-border-b-0 hover:pktw-bg-hover",
									model.id === currentModelId && (!currentProvider || model.provider === currentProvider) && "pktw-bg-[var(--background-modifier-active)]"
								)}
								onClick={() => handleModelSelect(model.provider, model.id)}
							>
								<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-flex-1 pktw-min-w-0">
									{model.icon && (
										<div className="pktw-w-4 pktw-h-4 pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-justify-center">
											<ErrorBoundary fallback={null}>
												<ModelIcon model={model.icon} size={16} className="pktw-flex-shrink-0" />
											</ErrorBoundary>
										</div>
									)}
									<span className="pktw-text-[14px] pktw-font-medium pktw-text-foreground pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">{model.displayName}</span>
								</div>
								{model.id === currentModelId && (!currentProvider || model.provider === currentProvider) && (
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

