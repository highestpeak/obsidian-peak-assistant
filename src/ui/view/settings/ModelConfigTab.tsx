import React, { useState, useEffect, useCallback } from 'react';
import { MyPluginSettings } from '@/app/settings/types';
import { AIServiceManager } from '@/service/chat/service-manager';
import { ProviderSettingsComponent } from '@/ui/view/settings/component/ProviderSettings';
import { ModelSelector } from '@/ui/component/mine/ModelSelector';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { CollapsibleSettingsSection } from '@/ui/component/shared-ui/CollapsibleSettingsSection';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';
import type { LLMOutputControlSettings, ModelCapabilities } from '@/core/providers/types';
import { OutputControlSettingsList } from '@/ui/component/mine/LLMOutputControlSettings';
import { EventBus, ViewEventType } from '@/core/eventBus';
import {
	ALL_MODEL_CONFIG_PROMPT_IDS,
	CONFIGURABLE_PROMPT_IDS,
	INDEXING_AND_HUB_PROMPT_IDS,
	SEARCH_AI_ANALYSIS_PROMPT_IDS,
} from '@/service/prompt/PromptId';
import { Button } from '@/ui/component/shared-ui/button';

interface ChatTabProps {
	settings: MyPluginSettings;
	aiServiceManager: AIServiceManager;
	settingsUpdates: SettingsUpdates;
	eventBus?: EventBus;
}

interface ModelConfigItem {
	id: string;
	label: string;
	description: string;
	currentModel: { provider: string; modelId: string } | undefined;
	onChange: (provider: string, modelId: string) => Promise<void>;
}

/** Shared section for batch-apply model to multiple configs. Manages its own selection + confirm state. */
function BatchModelApplySection({
	label,
	description,
	buttonLabel,
	models,
	isLoading,
	loadModels,
	onApply,
	renderConfirmContent,
	variant = 'neutral',
}: {
	label: string;
	description: string;
	buttonLabel: string;
	models: ModelInfoForSwitch[];
	isLoading: boolean;
	loadModels: () => void;
	onApply: (model: { provider: string; modelId: string }) => Promise<void>;
	renderConfirmContent: (model: { provider: string; modelId: string }) => React.ReactNode;
	variant?: 'neutral' | 'destructive';
}) {
	const [isSelecting, setIsSelecting] = useState(false);
	const [selectedModel, setSelectedModel] = useState<{ provider: string; modelId: string } | undefined>();
	const [showConfirm, setShowConfirm] = useState(false);

	const handleApply = async () => {
		if (!selectedModel) return;
		try {
			await onApply(selectedModel);
		} finally {
			setIsSelecting(false);
			setShowConfirm(false);
			setSelectedModel(undefined);
		}
	};

	const confirmDialogClasses = variant === 'destructive'
		? 'pktw-bg-amber-50 pktw-border-amber-200'
		: 'pktw-bg-muted/50 pktw-border';

	return (
		<div className="pktw-mb-6 pktw-space-y-4">
			<div className="pktw-flex pktw-items-center pktw-gap-4">
				<div className="pktw-flex-1 pktw-min-w-0">
					<label className="pktw-block pktw-text-sm pktw-font-medium pktw-mb-1">{label}</label>
					<p className="pktw-text-xs pktw-text-muted-foreground">{description}</p>
				</div>
				<div className="pktw-flex-shrink-0 pktw-w-64 pktw-flex pktw-items-center pktw-justify-start pktw-min-h-[3rem]">
					{!isSelecting && (
						<Button
							onClick={() => setIsSelecting(true)}
							size="sm"
							variant="outline"
							className={variant === 'destructive' ? 'pktw-text-xs pktw-bg-red-600 hover:pktw-bg-red-700 pktw-text-white' : undefined}
						>
							{buttonLabel}
						</Button>
					)}
					{isSelecting && !showConfirm && (
						<div className="pktw-flex pktw-items-center pktw-gap-2">
							<ModelSelector
								models={models}
								isLoading={isLoading}
								currentModel={selectedModel}
								onChange={async (provider, modelId) => {
									setSelectedModel({ provider, modelId });
									setShowConfirm(true);
								}}
								placeholder="Select model"
								onMenuOpen={loadModels}
							/>
							<Button
								onClick={() => { setIsSelecting(false); setSelectedModel(undefined); }}
								size="sm"
								variant="outline"
								className="pktw-text-xs pktw-bg-gray-600 hover:pktw-bg-gray-700 pktw-text-white pktw-ml-2"
							>
								Cancel
							</Button>
						</div>
					)}
				</div>
			</div>
			{showConfirm && selectedModel && (
				<div className={`pktw-flex pktw-items-start pktw-gap-4 pktw-p-4 pktw-border pktw-rounded-md ${confirmDialogClasses}`}>
					<div className="pktw-flex-1 pktw-min-w-0">
						{renderConfirmContent(selectedModel)}
					</div>
					<div className="pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-gap-2">
						<Button
							onClick={() => { setShowConfirm(false); setSelectedModel(undefined); }}
							size="sm"
							variant="outline"
							className={variant === 'destructive' ? 'pktw-text-xs pktw-bg-gray-600 hover:pktw-bg-gray-700 pktw-text-white' : undefined}
						>
							Cancel
						</Button>
						<Button
							onClick={handleApply}
							size="sm"
							className={variant === 'destructive' ? 'pktw-text-xs pktw-bg-red-600 hover:pktw-bg-red-700' : undefined}
						>
							Confirm
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

/**
 * Model selector wrapper for settings page with label and description
 */
function ModelSelectorField({
	label,
	description,
	currentModel,
	onChange,
	models,
	isLoading,
	onMenuOpen,
	requiredCapabilities,
}: {
	label: string;
	description: string;
	currentModel: { provider: string; modelId: string } | undefined;
	onChange: (provider: string, modelId: string) => Promise<void>;
	models: ModelInfoForSwitch[];
	isLoading: boolean;
	onMenuOpen?: () => void;
	requiredCapabilities?: Partial<ModelCapabilities>;
}) {
	// Check if current model meets requirements
	const currentModelInfo = currentModel ? models.find(m => m.id === currentModel.modelId && m.provider === currentModel.provider) : undefined;
	const meetsRequirements = !requiredCapabilities || !currentModelInfo || 
		Object.entries(requiredCapabilities).every(([key, required]) => 
			required !== true || currentModelInfo.capabilities?.[key as keyof typeof currentModelInfo.capabilities]
		);

	const missingCapabilities = requiredCapabilities && currentModelInfo
		? Object.entries(requiredCapabilities)
			.filter(([key, required]) => required === true && !currentModelInfo.capabilities?.[key as keyof typeof currentModelInfo.capabilities])
			.map(([key]) => key)
		: [];

	return (
		<div className="pktw-mb-6 pktw-flex pktw-items-start pktw-gap-4">
			{/* Left side: label and description */}
			<div className="pktw-flex-1 pktw-min-w-0">
				<label className="pktw-block pktw-text-sm pktw-font-medium pktw-mb-1">
					{label}
				</label>
				{description && (
					<p className="pktw-text-xs pktw-text-muted-foreground">{description}</p>
				)}
				{!meetsRequirements && currentModel && (
					<div className="pktw-mt-2 pktw-p-2 pktw-bg-amber-50 pktw-border pktw-border-amber-200 pktw-rounded-md">
						<p className="pktw-text-xs pktw-text-amber-800">
							<strong>Warning:</strong> The selected model does not support required capabilities: {missingCapabilities.join(', ')}. 
							Please select a model with these capabilities or configure the model in Provider Settings.
						</p>
					</div>
				)}
			</div>
			{/* Right side: selector */}
			<div className="pktw-flex-shrink-0 pktw-w-64">
				<ModelSelector
					models={models}
					isLoading={isLoading}
					currentModel={currentModel}
					onChange={onChange}
					placeholder="Select model"
					onMenuOpen={onMenuOpen}
					requiredCapabilities={requiredCapabilities}
				/>
			</div>
		</div>
	);
}

/**
 * Model configuration tab with AI provider settings and model usage configuration.
 */
export function ModelConfigTab({ settings, aiServiceManager, settingsUpdates, eventBus }: ChatTabProps) {
	const [models, setModels] = useState<ModelInfoForSwitch[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	// Load models function
	const loadModels = useCallback(async () => {
		setIsLoading(true);
		try {
			const allModels = await aiServiceManager.getAllAvailableModels();
			setModels(allModels);
		} catch (error) {
			console.error('[ModelConfigTab] Error loading models:', error);
		} finally {
			setIsLoading(false);
		}
	}, [aiServiceManager]);

	// Initialize and load models
	useEffect(() => {
		loadModels();
	}, [loadModels]);

	// Listen to settings update events to refresh model list
	useEffect(() => {
		if (!eventBus) return;

		const unsubscribe = eventBus.on(ViewEventType.SETTINGS_UPDATED, () => {
			// Reload models when settings are updated (e.g., provider enabled/disabled)
			loadModels();
		});

		return () => {
			unsubscribe();
		};
	}, [eventBus, loadModels]);

	const { updateAISettings, updateDefaultModel, updateAnalysisModel, updateSearchModel, updateChunkingModel, updateAIAnalysisModel, updatePromptModel } = settingsUpdates;

	const modelConfigs: ModelConfigItem[] = [
		{
			id: 'default',
			label: 'Default Model',
			description: 'Default model for chat conversations. Used when no specific model is selected.',
			currentModel: settings.ai.defaultModel,
			onChange: (provider, modelId) => updateDefaultModel(provider, modelId),
		},
		{
			id: 'analysis',
			label: 'Analysis Model',
			description: 'Model for AI Analysis (search reports, sections). Use OpenRouter for parallel calls. Falls back to Default Model if not set.',
			currentModel: settings.ai.analysisModel ?? settings.ai.defaultModel,
			onChange: (provider, modelId) => updateAnalysisModel(provider, modelId),
		},
		// {
		// 	id: 'searchSummary',
		// 	label: 'Search Summary Model',
		// 	description: 'Model for generating search result summaries. Falls back to default model if not configured.',
		// 	currentModel: settings.search.searchSummaryModel,
		// 	onChange: (provider, modelId) => updateSearchModel('searchSummaryModel', provider, modelId),
		// },
		// {
		// 	id: 'thoughtAgent',
		// 	label: 'AI Search Thought Agent',
		// 	description: 'Model for the coordinator agent that plans and orchestrates AI search tasks. Falls back to default model if not configured.',
		// 	currentModel: settings.search.aiAnalysisModel?.thoughtAgentModel,
		// 	onChange: (provider, modelId) => updateAIAnalysisModel('thoughtAgentModel', provider, modelId),
		// },
		// {
		// 	id: 'searchAgent',
		// 	label: 'AI Search Agent',
		// 	description: 'Model for the executor agent that performs searches and content analysis. Falls back to default model if not configured.',
		// 	currentModel: settings.search.aiAnalysisModel?.searchAgentModel,
		// 	onChange: (provider, modelId) => updateAIAnalysisModel('searchAgentModel', provider, modelId),
		// },
		{
			id: 'embedding',
			label: 'Embedding Model',
			description: 'Model for generating document embeddings for vector search. Optional - embeddings will not be generated if not configured.',
			currentModel: settings.search.chunking.embeddingModel,
			onChange: (provider, modelId) => updateChunkingModel('embeddingModel', provider, modelId),
		},
		{
			id: 'rerank',
			label: 'Rerank Model',
			description: 'Model for reranking search results to improve relevance. Optional - reranking will not be performed if not configured.',
			currentModel: settings.search.chunking.rerankModel,
			onChange: (provider, modelId) => updateChunkingModel('rerankModel', provider, modelId),
		},
	];

	return (
		<div className="peak-settings-card">
			{/* Provider Settings Section */}
			<CollapsibleSettingsSection title="Provider Settings" defaultOpen={false}>
				<ProviderSettingsComponent
					settings={settings.ai}
					aiServiceManager={aiServiceManager}
					onUpdate={updateAISettings}
				/>
			</CollapsibleSettingsSection>

			{/* Model Usage Section */}
			<CollapsibleSettingsSection title="Model Usage" defaultOpen={false}>
				<div className="pktw-mb-6">
					<p className="pktw-text-sm pktw-text-muted-foreground">
						Configure different AI models for different use cases. Make sure to enable and configure providers in the Provider Settings section first.
					</p>
				</div>

				<BatchModelApplySection
					label="Reset All Models"
					description="Apply a new model to all configurable AI, search, and embedding settings at once. Useful for quickly switching your default provider or primary model across the plugin."
					buttonLabel="Reset All"
					models={models}
					isLoading={isLoading}
					loadModels={loadModels}
					variant="destructive"
					onApply={async (model) => {
						const updates: Partial<MyPluginSettings> = {
							ai: {
								...settings.ai,
								defaultModel: { provider: model.provider, modelId: model.modelId },
								analysisModel: { provider: model.provider, modelId: model.modelId },
								promptModelMap: {
									...settings.ai.promptModelMap,
									...ALL_MODEL_CONFIG_PROMPT_IDS.reduce((acc, promptId) => ({
										...acc,
										[promptId]: { provider: model.provider, modelId: model.modelId }
									}), {})
								}
							},
							search: {
								...settings.search,
								searchSummaryModel: { provider: model.provider, modelId: model.modelId },
								aiAnalysisModel: {
									...settings.search.aiAnalysisModel,
									thoughtAgentModel: { provider: model.provider, modelId: model.modelId },
									searchAgentModel: { provider: model.provider, modelId: model.modelId }
								},
								chunking: {
									...settings.search.chunking,
									embeddingModel: { provider: model.provider, modelId: model.modelId },
									rerankModel: { provider: model.provider, modelId: model.modelId }
								}
							}
						};
						await settingsUpdates.updateSettings(updates);
					}}
					renderConfirmContent={(model) => (
						<>
							<span className="pktw-text-sm pktw-font-medium pktw-text-amber-800 pktw-mb-2">
								⚠️ Confirm Reset All Models
							</span>
							<div className="pktw-text-sm pktw-text-amber-700 pktw-space-y-1">
								<p>
									You are about to apply <strong>{model.provider} / {model.modelId}</strong> to:
								</p>
								<ul className="pktw-list-disc pktw-list-inside pktw-ml-4 pktw-space-y-1">
									<li>All model configurations (Default, Search, Embedding, etc.)</li>
									<li>All configurable prompts ({ALL_MODEL_CONFIG_PROMPT_IDS.length} types)</li>
								</ul>
								<p className="pktw-font-medium pktw-pt-2">
									This action will override all existing model selections. This cannot be undone.
								</p>
							</div>
						</>
					)}
				/>

				{/* Search AI Analysis Section */}
				<CollapsibleSettingsSection title="Search AI Analysis" defaultOpen={false}>
					<div className="pktw-mb-4">
						<p className="pktw-text-sm pktw-text-muted-foreground">
							Model configuration for Search AI Analysis prompts. Each prompt can have its own model; falls back to default if not configured.
						</p>
					</div>
					<BatchModelApplySection
						label="Set All Search AI Analysis"
						description={`Apply one model to all Search AI Analysis prompts (${SEARCH_AI_ANALYSIS_PROMPT_IDS.length} prompts) at once.`}
						buttonLabel="Set All"
						models={models}
						isLoading={isLoading}
						loadModels={loadModels}
						onApply={async (model) => {
							const promptMap = SEARCH_AI_ANALYSIS_PROMPT_IDS.reduce(
								(acc, promptId) => ({ ...acc, [promptId]: { provider: model.provider, modelId: model.modelId } }),
								{} as Record<string, { provider: string; modelId: string }>
							);
							await settingsUpdates.updateSettings({
								ai: { ...settings.ai, promptModelMap: { ...settings.ai.promptModelMap, ...promptMap } },
							});
						}}
						renderConfirmContent={(model) => (
							<>
								<span className="pktw-text-sm pktw-font-medium pktw-mb-2">Confirm</span>
								<p className="pktw-text-sm pktw-text-muted-foreground">
									Apply <strong>{model.provider} / {model.modelId}</strong> to all {SEARCH_AI_ANALYSIS_PROMPT_IDS.length} Search AI Analysis prompts?
								</p>
							</>
						)}
					/>
					<div className="pktw-space-y-6">
						{SEARCH_AI_ANALYSIS_PROMPT_IDS.map((promptId) => {
							const promptLabel = promptId
								.split('-')
								.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
								.join(' ');
							const promptModel = settings.ai.promptModelMap?.[promptId];
							const currentModel = promptModel || settings.ai.defaultModel;
							return (
								<ModelSelectorField
									key={promptId}
									label={promptLabel}
									description={`Model for ${promptId} prompt. Falls back to default if not configured.`}
									currentModel={currentModel}
									onChange={(provider, modelId) => updatePromptModel(promptId, provider, modelId)}
									models={models}
									isLoading={isLoading}
									onMenuOpen={loadModels}
								/>
							);
						})}
					</div>
				</CollapsibleSettingsSection>

				{/* Indexing & Hub Prompts Section */}
				<CollapsibleSettingsSection title="Indexing & Hub Prompts" defaultOpen={false}>
					<div className="pktw-mb-4">
						<p className="pktw-text-sm pktw-text-muted-foreground">
							Model configuration for indexing and Hub discovery prompts. Each prompt can have its own model; falls back to default if not configured (see PromptService fallbacks for related prompts).
						</p>
					</div>
					<BatchModelApplySection
						label="Set All Indexing & Hub Prompts"
						description={`Apply one model to all Indexing & Hub prompts (${INDEXING_AND_HUB_PROMPT_IDS.length} prompts) at once.`}
						buttonLabel="Set All"
						models={models}
						isLoading={isLoading}
						loadModels={loadModels}
						onApply={async (model) => {
							const promptMap = INDEXING_AND_HUB_PROMPT_IDS.reduce(
								(acc, promptId) => ({ ...acc, [promptId]: { provider: model.provider, modelId: model.modelId } }),
								{} as Record<string, { provider: string; modelId: string }>
							);
							await settingsUpdates.updateSettings({
								ai: { ...settings.ai, promptModelMap: { ...settings.ai.promptModelMap, ...promptMap } },
							});
						}}
						renderConfirmContent={(model) => (
							<>
								<span className="pktw-text-sm pktw-font-medium pktw-mb-2">Confirm</span>
								<p className="pktw-text-sm pktw-text-muted-foreground">
									Apply <strong>{model.provider} / {model.modelId}</strong> to all {INDEXING_AND_HUB_PROMPT_IDS.length} Indexing &amp; Hub prompts?
								</p>
							</>
						)}
					/>
					<div className="pktw-space-y-6">
						{INDEXING_AND_HUB_PROMPT_IDS.map((promptId) => {
							const promptLabel = promptId
								.split('-')
								.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
								.join(' ');
							const promptModel = settings.ai.promptModelMap?.[promptId];
							const currentModel = promptModel || settings.ai.defaultModel;
							return (
								<ModelSelectorField
									key={promptId}
									label={promptLabel}
									description={`Model for ${promptId} prompt. Falls back to default if not configured.`}
									currentModel={currentModel}
									onChange={(provider, modelId) => updatePromptModel(promptId, provider, modelId)}
									models={models}
									isLoading={isLoading}
									onMenuOpen={loadModels}
								/>
							);
						})}
					</div>
				</CollapsibleSettingsSection>

				{/* Default & Other Models Section */}
				<CollapsibleSettingsSection title="Default & Other Models" defaultOpen={false}>
					<div className="pktw-mb-4">
						<p className="pktw-text-sm pktw-text-muted-foreground">
							Default model, embedding, rerank, and other configurable prompts. Falls back to default model if not configured.
						</p>
					</div>
					<div className="pktw-space-y-6">
						{modelConfigs.map((config) => {
							// Require tools capability for agent-like models
							const requiresTools = config.id === 'thoughtAgent' || config.id === 'searchAgent';

							return (
								<ModelSelectorField
									key={config.id}
									label={config.label}
									description={config.description}
									currentModel={config.currentModel}
									onChange={config.onChange}
									models={models}
									isLoading={isLoading}
									onMenuOpen={loadModels}
									requiredCapabilities={requiresTools ? { tools: true } : undefined}
								/>
							);
						})}
						{CONFIGURABLE_PROMPT_IDS
							.map((promptId) => {
								const promptLabel = promptId
									.split('-')
									.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
									.join(' ');
								return { promptId, promptLabel };
							})
							.sort((a, b) => a.promptLabel.localeCompare(b.promptLabel))
							.map(({ promptId, promptLabel }) => {
								const promptModel = settings.ai.promptModelMap?.[promptId];
								const currentModel = promptModel || settings.ai.defaultModel;

								return (
									<ModelSelectorField
										key={promptId}
										label={promptLabel}
										description={`Model for ${promptId} prompt. Falls back to default model if not configured.`}
										currentModel={currentModel}
										onChange={(provider, modelId) => updatePromptModel(promptId, provider, modelId)}
										models={models}
										isLoading={isLoading}
										onMenuOpen={loadModels}
									/>
								);
							})}
					</div>
				</CollapsibleSettingsSection>
			</CollapsibleSettingsSection>

			{/* LLM Output Control Settings Section */}
			<CollapsibleSettingsSection title="LLM Output Control (Default)" defaultOpen={false}>
				<div className="pktw-mb-4">
					<p className="pktw-text-sm pktw-text-muted-foreground">
						Configure default output control settings for all models. These settings can be temporarily overridden in the chat interface.
					</p>
				</div>
				<div className="pktw-space-y-1">
					<OutputControlSettingsList
						settings={settings.ai.defaultOutputControl || {}}
						onChange={(outputControl: LLMOutputControlSettings) => {
							updateAISettings({ defaultOutputControl: outputControl });
						}}
						variant="default"
						useLocalState={true}
					/>
				</div>
			</CollapsibleSettingsSection>
		</div>
	);
}
