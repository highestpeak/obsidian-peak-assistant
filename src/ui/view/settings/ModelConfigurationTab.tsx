import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { MyPluginSettings } from '@/app/settings/types';
import { AIServiceManager } from '@/service/chat/service-manager';
import { SettingField } from '@/ui/component/shared-ui/setting-field';
import { ProviderServiceFactory } from '@/core/providers/base/factory';
import { ModelMetaData, ProviderMetaData } from '@/core/providers/types';
import { cn } from '@/ui/react/lib/utils';

interface ModelConfigurationTabProps {
	settings: MyPluginSettings;
	aiServiceManager: AIServiceManager;
	updateSettings: (updates: Partial<MyPluginSettings>) => Promise<void>;
}

interface ModelConfigItem {
	id: string;
	label: string;
	description: string;
	currentModel: { provider: string; modelId: string } | undefined;
	onChange: (provider: string, modelId: string) => Promise<void>;
}

/**
 * Model selector component for choosing provider and model
 */
function ModelSelector({
	label,
	description,
	currentModel,
	onChange,
	llmProviderConfigs,
}: {
	label: string;
	description: string;
	currentModel: { provider: string; modelId: string } | undefined;
	onChange: (provider: string, modelId: string) => Promise<void>;
	llmProviderConfigs: Record<string, any>;
}) {
	const [selectedProvider, setSelectedProvider] = useState<string>(currentModel?.provider || '');
	const [selectedModel, setSelectedModel] = useState<string>(currentModel?.modelId || '');
	const [availableModels, setAvailableModels] = useState<ModelMetaData[]>([]);
	const [isLoadingModels, setIsLoadingModels] = useState(false);

	const allProviderMetadata = useMemo(() => {
		return ProviderServiceFactory.getInstance().getAllProviderMetadata();
	}, []);

	const enabledProviders = useMemo(() => {
		return allProviderMetadata.filter((provider) => {
			const config = llmProviderConfigs[provider.id];
			return config?.enabled ?? false;
		});
	}, [llmProviderConfigs, allProviderMetadata]);

	// Initialize selected provider and model from currentModel
	useEffect(() => {
		if (currentModel) {
			setSelectedProvider(currentModel.provider);
			setSelectedModel(currentModel.modelId);
		} else {
			setSelectedProvider('');
			setSelectedModel('');
		}
	}, [currentModel]);

	// Load models when provider changes
	useEffect(() => {
		if (!selectedProvider) {
			setAvailableModels([]);
			return;
		}

		setIsLoadingModels(true);
		(async () => {
			try {
				const factory = ProviderServiceFactory.getInstance();
				const providerConfig = llmProviderConfigs[selectedProvider] || {};
				const models = await factory.getProviderSupportModels(selectedProvider, providerConfig);
				setAvailableModels(models);
			} catch (error) {
				console.error(`[ModelSelector] Error loading models for ${selectedProvider}:`, error);
				setAvailableModels([]);
			} finally {
				setIsLoadingModels(false);
			}
		})();
	}, [selectedProvider, llmProviderConfigs]);

	const handleProviderChange = useCallback(
		async (provider: string) => {
			setSelectedProvider(provider);
			setSelectedModel('');
		},
		[]
	);

	const handleModelChange = useCallback(
		async (modelId: string) => {
			setSelectedModel(modelId);
			if (selectedProvider && modelId) {
				await onChange(selectedProvider, modelId);
			}
		},
		[selectedProvider, onChange]
	);

	return (
		<SettingField label={label} description={description}>
			<div className="pktw-space-y-3">
				{/* Provider Selector */}
				<div>
					<label className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-2 pktw-block">
						Provider
					</label>
					<select
						value={selectedProvider}
						onChange={(e) => handleProviderChange(e.target.value)}
						className="pktw-w-full pktw-px-3 pktw-py-2 pktw-text-sm pktw-border pktw-border-border pktw-rounded-md pktw-bg-background pktw-text-foreground focus:pktw-outline-none focus:pktw-border-accent"
					>
						<option value="">Select provider</option>
						{enabledProviders.map((provider) => (
							<option key={provider.id} value={provider.id}>
								{provider.name}
							</option>
						))}
					</select>
				</div>

				{/* Model Selector */}
				<div>
					<label className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-2 pktw-block">
						Model
					</label>
					{isLoadingModels ? (
						<div className="pktw-text-sm pktw-text-muted-foreground pktw-py-2">Loading models...</div>
					) : (
						<select
							value={selectedModel}
							onChange={(e) => handleModelChange(e.target.value)}
							disabled={!selectedProvider || availableModels.length === 0}
							className="pktw-w-full pktw-px-3 pktw-py-2 pktw-text-sm pktw-border pktw-border-border pktw-rounded-md pktw-bg-background pktw-text-foreground focus:pktw-outline-none focus:pktw-border-accent disabled:pktw-opacity-50 disabled:pktw-cursor-not-allowed"
						>
							<option value="">Select model</option>
							{availableModels.map((model) => (
								<option key={model.id} value={model.id}>
									{model.displayName}
								</option>
							))}
						</select>
					)}
					{selectedProvider && !isLoadingModels && availableModels.length === 0 && (
						<div className="pktw-text-xs pktw-text-muted-foreground pktw-mt-1">
							No models available. Please configure the provider in Chat tab first.
						</div>
					)}
				</div>
			</div>
		</SettingField>
	);
}

/**
 * Model configuration tab for configuring different AI models for different use cases.
 */
export function ModelConfigurationTab({ settings, aiServiceManager, updateSettings }: ModelConfigurationTabProps) {
	const handleDefaultModelChange = useCallback(
		async (provider: string, modelId: string) => {
			await updateSettings({
				ai: {
					...settings.ai,
					defaultModel: { provider, modelId },
				},
			});
		},
		[settings.ai, updateSettings]
	);

	const handleSearchSummaryModelChange = useCallback(
		async (provider: string, modelId: string) => {
			await updateSettings({
				search: {
					...settings.search,
					searchSummaryModel: { provider, modelId },
				},
			});
		},
		[settings.search, updateSettings]
	);

	const handleImageDescriptionModelChange = useCallback(
		async (provider: string, modelId: string) => {
			await updateSettings({
				search: {
					...settings.search,
					imageDescriptionModel: { provider, modelId },
				},
			});
		},
		[settings.search, updateSettings]
	);

	const handleEmbeddingModelChange = useCallback(
		async (provider: string, modelId: string) => {
			await updateSettings({
				search: {
					...settings.search,
					chunking: {
						...settings.search.chunking,
						embeddingModel: { provider, modelId },
					},
				},
			});
		},
		[settings.search, updateSettings]
	);

	const handleRerankModelChange = useCallback(
		async (provider: string, modelId: string) => {
			await updateSettings({
				search: {
					...settings.search,
					chunking: {
						...settings.search.chunking,
						rerankModel: { provider, modelId },
					},
				},
			});
		},
		[settings.search, updateSettings]
	);

	const modelConfigs: ModelConfigItem[] = [
		{
			id: 'default',
			label: 'Default Model',
			description: 'Default model for chat conversations. Used when no specific model is selected.',
			currentModel: settings.ai.defaultModel,
			onChange: handleDefaultModelChange,
		},
		{
			id: 'searchSummary',
			label: 'Search Summary Model',
			description: 'Model for generating search result summaries. Falls back to default model if not configured.',
			currentModel: settings.search.searchSummaryModel,
			onChange: handleSearchSummaryModelChange,
		},
		{
			id: 'imageDescription',
			label: 'Image Description Model',
			description: 'Model for generating image descriptions (OCR and vision). Falls back to default model if not configured.',
			currentModel: settings.search.imageDescriptionModel,
			onChange: handleImageDescriptionModelChange,
		},
		{
			id: 'embedding',
			label: 'Embedding Model',
			description: 'Model for generating document embeddings for vector search. Optional - embeddings will not be generated if not configured.',
			currentModel: settings.search.chunking.embeddingModel,
			onChange: handleEmbeddingModelChange,
		},
		{
			id: 'rerank',
			label: 'Rerank Model',
			description: 'Model for reranking search results to improve relevance. Optional - reranking will not be performed if not configured.',
			currentModel: settings.search.chunking.rerankModel,
			onChange: handleRerankModelChange,
		},
	];

	return (
		<div className="peak-settings-card">
			<div className="pktw-mb-6">
				<h3 className="pktw-text-lg pktw-font-semibold pktw-text-foreground pktw-mb-2">Model Configuration</h3>
				<p className="pktw-text-sm pktw-text-muted-foreground">
					Configure different AI models for different use cases. Make sure to enable and configure providers in the Chat tab first.
				</p>
			</div>

			<div className="pktw-space-y-6">
				{modelConfigs.map((config) => (
					<ModelSelector
						key={config.id}
						label={config.label}
						description={config.description}
						currentModel={config.currentModel}
						onChange={config.onChange}
						llmProviderConfigs={settings.ai.llmProviderConfigs}
					/>
				))}
			</div>
		</div>
	);
}

