import React, { useState, useEffect, useCallback } from 'react';
import { MyPluginSettings } from '@/app/settings/types';
import { AIServiceManager } from '@/service/chat/service-manager';
import { ProviderSettingsComponent } from '@/ui/view/settings/component/ProviderSettings';
import { ModelSelector } from '@/ui/component/mine/ModelSelector';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { CollapsibleSettingsSection } from '@/ui/component/shared-ui/CollapsibleSettingsSection';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';
import type { LLMOutputControlSettings } from '@/core/providers/types';
import { OutputControlSettingsList } from '@/ui/component/mine/LLMOutputControlSettings';
import { EventBus, ViewEventType, SettingsUpdatedEvent } from '@/core/eventBus';
import { PromptId, CONFIGURABLE_PROMPT_IDS } from '@/service/prompt/PromptId';
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

/**
 * Reset All Models Section Component
 */
function ResetAllModelsSection({
	resetAllMode,
	setResetAllMode,
	resetAllModel,
	setResetAllModel,
	showConfirmDialog,
	setShowConfirmDialog,
	models,
	isLoading,
	loadModels,
	modelConfigs,
	settingsUpdates,
}: {
	resetAllMode: boolean;
	setResetAllMode: (mode: boolean) => void;
	resetAllModel: { provider: string; modelId: string } | undefined;
	setResetAllModel: (model: { provider: string; modelId: string } | undefined) => void;
	showConfirmDialog: boolean;
	setShowConfirmDialog: (show: boolean) => void;
	models: ModelInfoForSwitch[];
	isLoading: boolean;
	loadModels: () => void;
	modelConfigs: ModelConfigItem[];
	settingsUpdates: SettingsUpdates;
}) {
	return (
		<div className="pktw-mb-6 pktw-border pktw-border-gray-200 pktw-rounded-lg pktw-bg-gray-50/50">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-3">
				<h4 className="pktw-text-sm pktw-font-medium">Reset All Models</h4>
				{!resetAllMode && (
					<Button
						onClick={() => setResetAllMode(true)}
						size="sm"
						variant="outline"
						className="pktw-text-xs pktw-bg-red-600 hover:pktw-bg-red-700 pktw-text-white"
					>
						Reset All
					</Button>
				)}
			</div>

			{resetAllMode && !showConfirmDialog && (
				<div className="pktw-space-y-3">
					<ModelSelectorField
						label="Select Model for All Configurations"
						description="Choose a model that will be applied to all configurable prompts and model configurations below. This will override any existing model selections."
						currentModel={resetAllModel}
						onChange={async (provider, modelId) => {
							setResetAllModel({ provider, modelId });
							setShowConfirmDialog(true);
						}}
						models={models}
						isLoading={isLoading}
						onMenuOpen={loadModels}
					/>
					<div className="pktw-flex pktw-justify-end">
						<Button
							onClick={() => {
								setResetAllMode(false);
								setResetAllModel(undefined);
							}}
							size="sm"
							variant="outline"
							className="pktw-text-xs pktw-bg-gray-600 hover:pktw-bg-gray-700 pktw-text-white"
						>
							Cancel
						</Button>
					</div>
				</div>
			)}

			{showConfirmDialog && resetAllModel && (
				<div className="pktw-space-y-3">
					<div className="pktw-p-4 pktw-bg-amber-50 pktw-border pktw-border-amber-200 pktw-rounded-md">
						<div className="pktw-flex pktw-items-start pktw-gap-3">
							<div className="pktw-flex-shrink-0 pktw-w-5 pktw-h-5 pktw-text-amber-400 pktw-mt-0.5">
								⚠️
							</div>
							<div className="pktw-flex-1">
								<h5 className="pktw-text-sm pktw-font-medium pktw-text-amber-800 pktw-mb-2">
									Confirm Reset All Models
								</h5>
								<div className="pktw-text-sm pktw-text-amber-700 pktw-space-y-1">
									<p>
										You are about to apply <strong>{resetAllModel.provider} / {resetAllModel.modelId}</strong> to:
									</p>
									<ul className="pktw-list-disc pktw-list-inside pktw-ml-4 pktw-space-y-1">
										<li>All model configurations (Default, Search, Embedding, etc.)</li>
										<li>All configurable prompts ({CONFIGURABLE_PROMPT_IDS.length} types)</li>
									</ul>
									<p className="pktw-font-medium pktw-pt-2">
										This action will override all existing model selections. This cannot be undone.
									</p>
								</div>
							</div>
						</div>
					</div>

					<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-justify-end">
						<Button
							onClick={async () => {
								// Apply to all modelConfigs
								for (const config of modelConfigs) {
									await config.onChange(resetAllModel.provider, resetAllModel.modelId);
								}

								// Apply to all CONFIGURABLE_PROMPT_IDS
								for (const promptId of CONFIGURABLE_PROMPT_IDS) {
									await settingsUpdates.updatePromptModel(promptId, resetAllModel.provider, resetAllModel.modelId);
								}

								// Reset state
								setResetAllMode(false);
								setShowConfirmDialog(false);
								setResetAllModel(undefined);
							}}
							size="sm"
							className="pktw-text-xs pktw-bg-red-600 hover:pktw-bg-red-700"
						>
							Apply to All Models
						</Button>
						<Button
							onClick={() => {
								setShowConfirmDialog(false);
								setResetAllModel(undefined);
							}}
							size="sm"
							variant="outline"
							className="pktw-text-xs pktw-bg-gray-600 hover:pktw-bg-gray-700 pktw-text-white"
						>
							Cancel
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
}: {
	label: string;
	description: string;
	currentModel: { provider: string; modelId: string } | undefined;
	onChange: (provider: string, modelId: string) => Promise<void>;
	models: ModelInfoForSwitch[];
	isLoading: boolean;
	onMenuOpen?: () => void;
}) {
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
	const [resetAllMode, setResetAllMode] = useState(false);
	const [resetAllModel, setResetAllModel] = useState<{ provider: string; modelId: string } | undefined>();
	const [showConfirmDialog, setShowConfirmDialog] = useState(false);

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

	const { updateAISettings, updateDefaultModel, updateSearchModel, updateChunkingModel, updatePromptModel } = settingsUpdates;

	const modelConfigs: ModelConfigItem[] = [
		{
			id: 'default',
			label: 'Default Model',
			description: 'Default model for chat conversations. Used when no specific model is selected.',
			currentModel: settings.ai.defaultModel,
			onChange: (provider, modelId) => updateDefaultModel(provider, modelId),
		},
		{
			id: 'searchSummary',
			label: 'Search Summary Model',
			description: 'Model for generating search result summaries. Falls back to default model if not configured.',
			currentModel: settings.search.searchSummaryModel,
			onChange: (provider, modelId) => updateSearchModel('searchSummaryModel', provider, modelId),
		},
		{
			id: 'imageDescription',
			label: 'Image Description Model',
			description: 'Model for generating image descriptions (OCR and vision). Falls back to default model if not configured.',
			currentModel: settings.search.imageDescriptionModel,
			onChange: (provider, modelId) => updateSearchModel('imageDescriptionModel', provider, modelId),
		},
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

				<ResetAllModelsSection
					resetAllMode={resetAllMode}
					setResetAllMode={setResetAllMode}
					resetAllModel={resetAllModel}
					setResetAllModel={setResetAllModel}
					showConfirmDialog={showConfirmDialog}
					setShowConfirmDialog={setShowConfirmDialog}
					models={models}
					isLoading={isLoading}
					loadModels={loadModels}
					modelConfigs={modelConfigs}
					settingsUpdates={settingsUpdates}
				/>

				<div className="pktw-space-y-6">
					{modelConfigs.map((config) => (
						<ModelSelectorField
							key={config.id}
							label={config.label}
							description={config.description}
							currentModel={config.currentModel}
							onChange={config.onChange}
							models={models}
							isLoading={isLoading}
							onMenuOpen={loadModels}
						/>
					))}
					{CONFIGURABLE_PROMPT_IDS.map((promptId) => {
						const promptModel = settings.ai.promptModelMap?.[promptId];
						const currentModel = promptModel || settings.ai.defaultModel;
						const promptLabel = promptId
							.split('-')
							.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
							.join(' ');

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
