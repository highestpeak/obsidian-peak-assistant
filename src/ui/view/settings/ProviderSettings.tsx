import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { AIServiceManager } from '@/service/chat/service-manager';
import { AIServiceSettings } from '@/app/settings/types';
import { ProviderServiceFactory } from '@/service/chat/providers/factory';
import { ProviderIcon, ModelIcon } from '@lobehub/icons';
import { ModelConfig, ModelInfoForSettings, ModelMetaData, ProviderConfig, ProviderMetaData } from '@/service/chat/providers/types';
import { cn } from '@/ui/react/lib/utils';
import { ErrorBoundary } from '@/ui/react/lib/ErrorBoundary';

interface ProviderSettingsComponentProps {
	settings: AIServiceSettings;
	aiServiceManager: AIServiceManager;
	onUpdate: (updates: Partial<AIServiceSettings>) => Promise<void>;
}

interface ProviderListItemProps {
	provider: ProviderMetaData;
	providerId: string;
	selectedProvider: string;
	isEnabled: boolean;
	onSelect: (providerId: string) => void;
}

interface ProviderListSectionProps {
	title: string;
	providerIds: string[];
	allProviderMetadata: ProviderMetaData[];
	selectedProvider: string;
	onSelect: (providerId: string) => void;
}

interface ProviderConfigFormProps {
	selectedProvider: string;
	settings: AIServiceSettings;
	onConfigChange: (provider: string, field: 'apiKey' | 'baseUrl' | 'enabled', value: string | boolean) => Promise<void>;
}

interface ModelListProps {
	selectedProvider: string;
	settings: AIServiceSettings;
	onModelConfigChange: (provider: string, modelId: string, enabled: boolean) => Promise<void>;
}

/**
 * Provider list item component
 */
function ProviderListItem({ provider, providerId, selectedProvider, isEnabled, onSelect }: ProviderListItemProps) {
	const isSelected = selectedProvider === providerId;
	const statusColor = isEnabled ? 'pktw-bg-[#10b981]' : 'pktw-bg-muted-foreground';
	const statusShadow = isEnabled ? 'pktw-shadow-[0_0_0_2px_rgba(16,185,129,0.2)]' : '';

	return (
		<div
			className={cn(
				"pktw-flex pktw-items-center pktw-gap-3 pktw-px-5 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors pktw-duration-150 pktw-select-none pktw-relative",
				"hover:pktw-bg-muted",
				isSelected && "pktw-bg-[var(--background-modifier-active)] hover:pktw-bg-muted"
			)}
			onClick={() => onSelect(providerId)}
		>
			{isSelected && (
				<div className="pktw-absolute pktw-left-0 pktw-top-0 pktw-bottom-0 pktw-w-[3px] pktw-bg-accent"></div>
			)}
			<div className="pktw-relative pktw-flex-shrink-0">
				{provider.icon && <ProviderIcon provider={provider.icon as any} size={20} />}
				<div className={cn(
					"pktw-absolute pktw-bottom-0 pktw-right-0 pktw-w-2 pktw-h-2 pktw-rounded-full pktw-border pktw-border-background",
					statusColor,
					statusShadow
				)}></div>
			</div>
			<span className={cn(
				"pktw-text-sm pktw-font-medium pktw-text-foreground",
				isSelected && "pktw-text-accent pktw-font-semibold"
			)}>{provider.name}</span>
		</div>
	);
}

/**
 * Provider list section component
 */
function ProviderListSection({ title, providerIds, allProviderMetadata, selectedProvider, onSelect }: ProviderListSectionProps) {
	if (providerIds.length === 0) {
		return null;
	}

	const isEnabled = title === 'Enabled';

	return (
		<div className="pktw-mb-4">
			<div className="pktw-px-5 pktw-py-2 pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wide pktw-text-muted-foreground">{title}</div>
			{providerIds.map((providerId) => {
				const provider = allProviderMetadata.find(p => p.id === providerId);
				if (!provider) return null;
				return (
					<ProviderListItem
						key={providerId}
						provider={provider}
						providerId={providerId}
						selectedProvider={selectedProvider}
						isEnabled={isEnabled}
						onSelect={onSelect}
					/>
				);
			})}
		</div>
	);
}

/**
 * Provider configuration form component
 */
function ProviderConfigForm({ selectedProvider: provider, settings, onConfigChange }: ProviderConfigFormProps) {
	const selectedProviderInfo = useMemo(() => {
		const allProviderMetadata = ProviderServiceFactory.getInstance().getAllProviderMetadata();
		return allProviderMetadata.find(p => p.id === provider);
	}, [provider]);

	const selectedConfig = settings.llmProviderConfigs[provider] || {};
	const isSelectedEnabled = selectedConfig?.enabled ?? false;

	if (!selectedProviderInfo) {
		return null;
	}

	return (
		<>
			{/* Provider Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-8 pktw-pb-4 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					{selectedProviderInfo.icon && <ProviderIcon provider={selectedProviderInfo.icon as any} size={24} />}
					<h2 className="pktw-m-0 pktw-text-xl pktw-font-semibold pktw-text-foreground">{selectedProviderInfo.name}</h2>
				</div>
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					<label className="pktw-relative pktw-inline-block pktw-w-11 pktw-h-6 pktw-cursor-pointer">
						<input
							type="checkbox"
							checked={isSelectedEnabled}
							onChange={(e) => onConfigChange(provider, 'enabled', e.target.checked)}
							className="pktw-opacity-0 pktw-w-0 pktw-h-0"
						/>
						<span className={cn(
							"pktw-absolute pktw-cursor-pointer pktw-top-0 pktw-left-0 pktw-right-0 pktw-bottom-0 pktw-transition-all pktw-duration-300 pktw-rounded-full",
							isSelectedEnabled ? "pktw-bg-accent" : "pktw-bg-border"
						)}>
							<span className={cn(
								"pktw-absolute pktw-content-[''] pktw-h-[18px] pktw-w-[18px] pktw-left-[3px] pktw-bottom-[3px] pktw-bg-white pktw-transition-all pktw-duration-300 pktw-rounded-full",
								isSelectedEnabled && "pktw-translate-x-[20px]"
							)}></span>
						</span>
					</label>
					<span className="pktw-text-[13px] pktw-text-muted-foreground pktw-font-medium">
						{isSelectedEnabled ? 'Enabled' : 'Disabled'}
					</span>
				</div>
			</div>

			{/* API Key */}
			<div className="pktw-mb-6">
				<div className="pktw-mb-2">
					<div className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-1">API Key</div>
					<div className="pktw-text-xs pktw-text-muted-foreground pktw-leading-relaxed">
						Please enter your {selectedProviderInfo.name} API Key
					</div>
				</div>
				<div className="pktw-mt-2">
					<input
						type="password"
						className="pktw-w-full pktw-px-3.5 pktw-py-2.5 pktw-text-sm pktw-border pktw-border-border pktw-rounded-md pktw-bg-transparent pktw-text-foreground pktw-transition-all pktw-duration-200 pktw-box-border focus:pktw-outline-none focus:pktw-border-accent focus:pktw-shadow-[0_0_0_3px_rgba(var(--interactive-accent-rgb),0.1)]"
						placeholder={`${selectedProviderInfo.name} API Key`}
						value={selectedConfig.apiKey || ''}
						onChange={(e) => onConfigChange(provider, 'apiKey', e.target.value)}
					/>
				</div>
			</div>

			{/* API Proxy URL */}
			<div className="pktw-mb-6">
				<div className="pktw-mb-2">
					<div className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-1">API Proxy URL</div>
					<div className="pktw-text-xs pktw-text-muted-foreground pktw-leading-relaxed">
						Must include http(s)://
					</div>
				</div>
				<div className="pktw-mt-2">
					<input
						type="text"
						className="pktw-w-full pktw-px-3.5 pktw-py-2.5 pktw-text-sm pktw-border pktw-border-border pktw-rounded-md pktw-bg-transparent pktw-text-foreground pktw-transition-all pktw-duration-200 pktw-box-border focus:pktw-outline-none focus:pktw-border-accent focus:pktw-shadow-[0_0_0_3px_rgba(var(--interactive-accent-rgb),0.1)] placeholder:pktw-text-muted-foreground"
						placeholder={selectedProviderInfo?.defaultBaseUrl || ''}
						value={selectedConfig.baseUrl || ''}
						onChange={(e) => onConfigChange(provider, 'baseUrl', e.target.value)}
					/>
				</div>
			</div>

			{/* Info Note */}
			<div className="pktw-mt-6 pktw-px-4 pktw-py-3 pktw-rounded-md pktw-text-xs pktw-text-muted-foreground pktw-leading-relaxed">
				Your key and proxy URL will be encrypted using AES-GCM encryption algorithm.
			</div>
		</>
	);
}

/**
 * Model list component
 */
function ModelList({ selectedProvider: provider, settings, onModelConfigChange }: ModelListProps) {
	const [availableModels, setAvailableModels] = useState<ModelMetaData[]>([]);
	const [isLoadingModels, setIsLoadingModels] = useState(false);

	const config = settings.llmProviderConfigs[provider];
	
	// Get provider metadata for fallback icon
	const providerMetadata = useMemo(() => {
		const allProviderMetadata = ProviderServiceFactory.getInstance().getAllProviderMetadata();
		return allProviderMetadata.find(p => p.id === provider);
	}, [provider]);

	// Load models for selected provider
	useEffect(() => {
		setIsLoadingModels(true);
		(async () => {
			try {
				const factory = ProviderServiceFactory.getInstance();
				// Pass actual config to getProviderSupportModels so providers that need API key can fetch models
				const providerConfig = config || {};
				const models = await factory.getProviderSupportModels(provider, providerConfig);
				setAvailableModels(models);
			} catch (error) {
				console.error(`[ProviderSettings] Error loading models for ${provider}:`, error);
				setAvailableModels([]);
			} finally {
				setIsLoadingModels(false);
			}
		})();
	}, [provider, config]);

	return (
		<div className="pktw-mt-8">
			<div className="pktw-mb-4">
				<h3 className="pktw-m-0 pktw-text-base pktw-font-semibold pktw-text-foreground">Model List</h3>
				<div className="pktw-text-xs pktw-text-muted-foreground pktw-mt-1">
					{isLoadingModels ? 'Loading models...' : `${availableModels.length} models available`}
				</div>
			</div>
			{isLoadingModels ? (
				<div className="pktw-text-sm pktw-text-muted-foreground pktw-py-4">Loading models...</div>
			) : availableModels.length > 0 ? (
				<div className="pktw-border pktw-border-border pktw-rounded-md pktw-overflow-hidden">
					<div className="pktw-max-h-[400px] pktw-overflow-y-auto">
						{availableModels.map((model) => {
							const modelConfig = config?.modelConfigs?.[model.id];
							const isModelEnabled = modelConfig?.enabled ?? false;
							return (
								<div
									key={model.id}
									className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-3 pktw-border-b pktw-border-border pktw-transition-colors hover:pktw-bg-muted last:pktw-border-b-0"
								>
									{model.icon && (
										<div className="pktw-w-5 pktw-h-5 pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-justify-center">
											<ErrorBoundary fallback={providerMetadata?.icon ? <ProviderIcon provider={providerMetadata.icon as any} size={20} /> : null}>
												<ModelIcon model={model.icon} size={20} className="pktw-flex-shrink-0" />
											</ErrorBoundary>
										</div>
									)}
									<span className="pktw-text-sm pktw-text-foreground pktw-flex-1">{model.displayName}</span>
									<label className="pktw-relative pktw-inline-block pktw-w-9 pktw-h-5 pktw-cursor-pointer">
										<input
											type="checkbox"
											checked={isModelEnabled}
											onChange={(e) => onModelConfigChange(provider, model.id, e.target.checked)}
											className="pktw-opacity-0 pktw-w-0 pktw-h-0"
										/>
										<span className={cn(
											"pktw-absolute pktw-cursor-pointer pktw-top-0 pktw-left-0 pktw-right-0 pktw-bottom-0 pktw-transition-all pktw-duration-300 pktw-rounded-full",
											isModelEnabled ? "pktw-bg-accent" : "pktw-bg-border"
										)}>
											<span className={cn(
												"pktw-absolute pktw-content-[''] pktw-h-[14px] pktw-w-[14px] pktw-left-[2px] pktw-bottom-[2px] pktw-bg-white pktw-transition-all pktw-duration-300 pktw-rounded-full",
												isModelEnabled && "pktw-translate-x-[16px]"
											)}></span>
										</span>
									</label>
								</div>
							);
						})}
					</div>
				</div>
			) : (
				<div className="pktw-text-sm pktw-text-muted-foreground pktw-py-4">
					{provider === 'openai' && !config?.apiKey ? (
						<div className="pktw-space-y-2">
							<div className="pktw-text-center pktw-font-medium">No models available</div>
							<div className="pktw-text-xs pktw-leading-relaxed">
								Please enter your OpenAI API key above to fetch available models. The model list will be automatically loaded from the OpenAI API once you provide a valid API key.
							</div>
						</div>
					) : (
						<div className="pktw-text-center">
							No models available. Please check your API key and try again.
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * React component for rendering Provider Settings section in lobechat-style layout.
 * Left sidebar shows provider list, right panel shows selected provider's configuration.
 */
export function ProviderSettingsComponent({ settings, aiServiceManager, onUpdate }: ProviderSettingsComponentProps) {
	// for display provider list
	const allProviderMetadata = useMemo(() => ProviderServiceFactory.getInstance().getAllProviderMetadata(), []);
	// const providerConfigs = settings.llmProviderConfigs || {};

	// Get enabled and disabled providers
	const { enabledProviders, disabledProviders } = useMemo(() => {
		const enabled: string[] = [];
		const disabled: string[] = [];

		allProviderMetadata.forEach((metadata) => {
			const config = settings.llmProviderConfigs[metadata.id];
			const isEnabled = config?.enabled ?? false;
			if (isEnabled) {
				enabled.push(metadata.id);
			} else {
				disabled.push(metadata.id);
			}
		});

		return { enabledProviders: enabled, disabledProviders: disabled };
	}, [settings, allProviderMetadata]);

	// Update provider configuration
	const handleProviderConfigChange = useCallback(async (
		provider: string,
		field: 'apiKey' | 'baseUrl' | 'enabled',
		value: string | boolean
	) => {
		const currentConfig = settings.llmProviderConfigs[provider] || {};
		const updatedConfigs = {
			...settings.llmProviderConfigs,
			[provider]: {
				...currentConfig,
				[field]: value,
			},
		};
		await onUpdate({ llmProviderConfigs: updatedConfigs });
	}, [settings, onUpdate]);

	// Update model configuration
	const handleModelConfigChange = useCallback(async (
		provider: string,
		modelId: string,
		enabled: boolean
	) => {
		const currentConfig = settings.llmProviderConfigs[provider] || {};
		const currentModelConfigs = currentConfig.modelConfigs || {};
		const updatedConfigs = {
			...settings.llmProviderConfigs,
			[provider]: {
				...currentConfig,
				modelConfigs: {
					...currentModelConfigs,
					[modelId]: {
						id: modelId,
						enabled,
					},
				},
			},
		};
		await onUpdate({ llmProviderConfigs: updatedConfigs });
	}, [settings, onUpdate]);

	// todo select enable first or disable fist
	const [selectedProvider, setSelectedProvider] = useState<string>('openai');

	return (
		<div className="pktw-flex pktw-gap-0 pktw-border pktw-border-border pktw-rounded-lg pktw-bg-background pktw-overflow-hidden pktw-min-h-[500px]">
			{/* Left Sidebar - Provider List */}
			<div className="pktw-w-[240px] pktw-min-w-[240px] pktw-bg-background pktw-flex pktw-flex-col pktw-overflow-y-auto" style={{ borderRight: '2px solid var(--background-modifier-border)' }}>
				<div className="pktw-px-5 pktw-py-4 pktw-border-b pktw-border-border">
					<h3 className="pktw-m-0 pktw-text-sm pktw-font-semibold pktw-text-foreground">AI Service Provider</h3>
				</div>
				<div className="pktw-flex-1 pktw-py-2 pktw-overflow-y-auto">
					<ProviderListSection
						title="Enabled"
						providerIds={enabledProviders}
						allProviderMetadata={allProviderMetadata}
						selectedProvider={selectedProvider}
						onSelect={setSelectedProvider}
					/>
					<ProviderListSection
						title="Disabled"
						providerIds={disabledProviders}
						allProviderMetadata={allProviderMetadata}
						selectedProvider={selectedProvider}
						onSelect={setSelectedProvider}
					/>
				</div>
			</div>

			{/* Right Panel - Provider Configuration */}
			<div className="pktw-flex-1 pktw-px-8 pktw-py-6 pktw-overflow-y-auto pktw-bg-background">
				<ProviderConfigForm
					selectedProvider={selectedProvider}
					settings={settings}
					onConfigChange={handleProviderConfigChange}
				/>
				<ModelList
					selectedProvider={selectedProvider}
					settings={settings}
					onModelConfigChange={handleModelConfigChange}
				/>
			</div>
		</div>
	);
}
