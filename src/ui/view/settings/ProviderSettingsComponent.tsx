import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { AIServiceSettings } from '@/service/chat/service-manager';
import { LLMProvider } from '@/service/chat/providers/types';
import { getAllProviderMetadata } from '@/service/chat/providers/helpers';
import { cn } from '@/ui/react/lib/utils';

interface ProviderSettingsComponentProps {
	settings: AIServiceSettings;
	onUpdate: (updates: Partial<AIServiceSettings>) => Promise<void>;
}


/**
 * React component for rendering Provider Settings section in lobechat-style layout.
 * Left sidebar shows provider list, right panel shows selected provider's configuration.
 */
export function ProviderSettingsComponent({ settings, onUpdate }: ProviderSettingsComponentProps) {
	const providerMetadata = useMemo(() => getAllProviderMetadata(), []);
	const [selectedProvider, setSelectedProvider] = useState<LLMProvider>('openai');
	const providerConfigs = settings.llmProviderConfigs || {};

	// Update selected provider when metadata is available
	useEffect(() => {
		if (providerMetadata.length > 0 && !providerMetadata.find(p => p.id === selectedProvider)) {
			setSelectedProvider(providerMetadata[0].id);
		}
	}, [providerMetadata, selectedProvider]);

	// Check if provider is enabled (has API key configured)
	const isProviderEnabled = useCallback((provider: LLMProvider) => {
		const config = providerConfigs[provider];
		return !!(config?.apiKey && config.apiKey.trim().length > 0);
	}, [providerConfigs]);

	// Get enabled and disabled providers
	const { enabledProviders, disabledProviders } = useMemo(() => {
		const enabled: LLMProvider[] = [];
		const disabled: LLMProvider[] = [];

		providerMetadata.forEach((metadata) => {
			if (isProviderEnabled(metadata.id)) {
				enabled.push(metadata.id);
			} else {
				disabled.push(metadata.id);
			}
		});

		return { enabledProviders: enabled, disabledProviders: disabled };
	}, [isProviderEnabled, providerMetadata]);

	const handleProviderConfigChange = useCallback(async (
		provider: LLMProvider,
		field: 'apiKey' | 'baseUrl',
		value: string
	) => {
		const currentConfig = providerConfigs[provider] || { apiKey: '', baseUrl: '' };
		const updatedConfigs = {
			...providerConfigs,
			[provider]: {
				...currentConfig,
				[field]: value,
			},
		};
		await onUpdate({ llmProviderConfigs: updatedConfigs });
	}, [providerConfigs, onUpdate]);

	const selectedProviderInfo = providerMetadata.find(p => p.id === selectedProvider);
	const selectedConfig = providerConfigs[selectedProvider] || { apiKey: '', baseUrl: '' };
	const isSelectedEnabled = isProviderEnabled(selectedProvider);

	return (
		<div className="pktw-flex pktw-gap-0 pktw-border pktw-border-border pktw-rounded-lg pktw-bg-secondary pktw-overflow-hidden pktw-min-h-[500px]">
			{/* Left Sidebar - Provider List */}
			<div className="pktw-w-[240px] pktw-min-w-[240px] pktw-border-r pktw-border-border pktw-flex pktw-flex-col pktw-overflow-y-auto">
				<div className="pktw-px-5 pktw-py-4 pktw-border-b pktw-border-border">
					<h3 className="pktw-m-0 pktw-text-sm pktw-font-semibold pktw-text-foreground">AI Service Provider</h3>
				</div>
				<div className="pktw-flex-1 pktw-py-2 pktw-overflow-y-auto">
					{/* Enabled Providers */}
					{enabledProviders.length > 0 && (
						<div className="pktw-mb-4">
							<div className="pktw-px-5 pktw-py-2 pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wide pktw-text-muted-foreground">Enabled</div>
							{enabledProviders.map((providerId) => {
								const provider = providerMetadata.find(p => p.id === providerId);
								if (!provider) return null;
								return (
									<div
										key={providerId}
										className={cn(
											"pktw-flex pktw-items-center pktw-gap-3 pktw-px-5 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors pktw-duration-150 pktw-select-none",
											"hover:pktw-bg-hover",
											selectedProvider === providerId && "pktw-bg-[var(--background-modifier-active)] pktw-border-l-[3px] pktw-border-l-accent pktw-pl-[17px]"
										)}
										onClick={() => setSelectedProvider(providerId)}
									>
										<div className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-[#10b981] pktw-flex-shrink-0 pktw-shadow-[0_0_0_2px_rgba(16,185,129,0.2)]"></div>
										<span className={cn(
											"pktw-text-sm pktw-font-medium pktw-text-foreground",
											selectedProvider === providerId && "pktw-text-accent pktw-font-semibold"
										)}>{provider.name}</span>
									</div>
								);
							})}
						</div>
					)}

					{/* Disabled Providers */}
					{disabledProviders.length > 0 && (
						<div className="pktw-mb-4">
							<div className="pktw-px-5 pktw-py-2 pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wide pktw-text-muted-foreground">Disabled</div>
							{disabledProviders.map((providerId) => {
								const provider = providerMetadata.find(p => p.id === providerId);
								if (!provider) return null;
								return (
									<div
										key={providerId}
										className={cn(
											"pktw-flex pktw-items-center pktw-gap-3 pktw-px-5 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors pktw-duration-150 pktw-select-none",
											"hover:pktw-bg-hover",
											selectedProvider === providerId && "pktw-bg-[var(--background-modifier-active)] pktw-border-l-[3px] pktw-border-l-accent pktw-pl-[17px]"
										)}
										onClick={() => setSelectedProvider(providerId)}
									>
										<div className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-muted-foreground pktw-flex-shrink-0"></div>
										<span className={cn(
											"pktw-text-sm pktw-font-medium pktw-text-foreground",
											selectedProvider === providerId && "pktw-text-accent pktw-font-semibold"
										)}>{provider.name}</span>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>

			{/* Right Panel - Provider Configuration */}
			<div className="pktw-flex-1 pktw-px-8 pktw-py-6 pktw-overflow-y-auto pktw-bg-secondary">
				{selectedProviderInfo && (
					<>
						{/* Provider Header */}
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-8 pktw-pb-4 pktw-border-b pktw-border-border">
							<h2 className="pktw-m-0 pktw-text-xl pktw-font-semibold pktw-text-foreground">{selectedProviderInfo.name}</h2>
							<div className="pktw-flex pktw-items-center pktw-gap-3">
								<label className="pktw-relative pktw-inline-block pktw-w-11 pktw-h-6 pktw-cursor-pointer">
									<input
										type="checkbox"
										checked={isSelectedEnabled}
										readOnly
										disabled
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
									className="pktw-w-full pktw-px-3.5 pktw-py-2.5 pktw-text-sm pktw-border pktw-border-border pktw-rounded-md pktw-bg-primary pktw-text-foreground pktw-transition-all pktw-duration-200 pktw-box-border focus:pktw-outline-none focus:pktw-border-accent focus:pktw-shadow-[0_0_0_3px_rgba(var(--interactive-accent-rgb),0.1)]"
									placeholder={`${selectedProviderInfo.name} API Key`}
									value={selectedConfig.apiKey || ''}
									onChange={(e) => handleProviderConfigChange(selectedProvider, 'apiKey', e.target.value)}
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
									className="pktw-w-full pktw-px-3.5 pktw-py-2.5 pktw-text-sm pktw-border pktw-border-border pktw-rounded-md pktw-bg-primary pktw-text-foreground pktw-transition-all pktw-duration-200 pktw-box-border focus:pktw-outline-none focus:pktw-border-accent focus:pktw-shadow-[0_0_0_3px_rgba(var(--interactive-accent-rgb),0.1)] placeholder:pktw-text-muted-foreground"
									placeholder={selectedProviderInfo?.defaultBaseUrl || ''}
									value={selectedConfig.baseUrl || ''}
									onChange={(e) => handleProviderConfigChange(selectedProvider, 'baseUrl', e.target.value)}
								/>
							</div>
						</div>

						{/* Info Note */}
						<div className="pktw-mt-6 pktw-px-4 pktw-py-3 pktw-bg-hover pktw-rounded-md pktw-text-xs pktw-text-muted-foreground pktw-leading-relaxed">
							Your key and proxy URL will be encrypted using AES-GCM encryption algorithm.
						</div>
					</>
				)}
			</div>
		</div>
	);
}
