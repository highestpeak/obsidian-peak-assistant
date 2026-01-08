import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { ChevronDown, Check, Eye, FileText, Wrench, Globe, Code, Image as ImageIcon, Brain, Search } from 'lucide-react';
import { SafeModelIcon, SafeProviderIcon } from '@/ui/component/mine/SafeIconWrapper';
import { cn } from '@/ui/react/lib/utils';
import { ProviderServiceFactory } from '@/core/providers/base/factory';
import { usePopupPosition } from '@/ui/hooks/usePopupPosition';
import { formatMaxContext } from '@/core/providers/model-capabilities';
// Import hover menu manager to initialize global coordination functions and use the hook
import { useHoverMenu } from '@/ui/component/mine/hover-menu-manager';

// Global menu coordination functions are now managed in hover-menu-manager.tsx

export interface ModelSelectorProps {
	/** Available models list */
	models: ModelInfoForSwitch[];
	/** Loading state */
	isLoading?: boolean;
	/** Current selected model */
	currentModel?: { provider: string; modelId: string };
	/** Callback when model is selected */
	onChange: (provider: string, modelId: string) => Promise<void>;
	/** Custom className for the container */
	className?: string;
	/** Custom className for the button */
	buttonClassName?: string;
	/** Placeholder text when no model is selected */
	placeholder?: string;
	/** Callback when menu opens - useful for reloading data */
	onMenuOpen?: () => void;
}

/**
 * Generic model selector component that can be reused across the application.
 * Displays a dropdown button with available models and handles model selection.
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
	models,
	isLoading = false,
	currentModel,
	onChange,
	className,
	buttonClassName,
	placeholder = 'Select model',
	onMenuOpen,
}) => {
	// Use hover menu manager for unified hover behavior
	const hoverMenu = useHoverMenu({
		id: 'model-selector',
		closeDelay: 800, // Extended delay for better UX
		enableCoordination: true
	});

	const menuRef = useRef<HTMLDivElement>(null);
	const menuPosition = usePopupPosition(hoverMenu.containerRef, menuRef, hoverMenu.isOpen, 400);

	// Get provider metadata map for fallback icons and names
	const providerMetadataMap = useMemo(() => {
		const allProviderMetadata = ProviderServiceFactory.getInstance().getAllProviderMetadata();
		const map = new Map<string, { icon?: string; name: string }>();
		allProviderMetadata.forEach((meta) => {
			map.set(meta.id, { icon: meta.icon, name: meta.name });
		});
		return map;
	}, []);

	// Check if current model is available in models list
	const isCurrentModelAvailable = useMemo(() => {
		if (!currentModel || models.length === 0) return true; // If no current model, consider it available
		return models.some(
			(m) => m.id === currentModel.modelId && m.provider === currentModel.provider
		);
	}, [currentModel, models]);

	// Group models by provider
	const modelsByProvider = useMemo(() => {
		const grouped = new Map<string, ModelInfoForSwitch[]>();
		models.forEach((model) => {
			const providerId = model.provider;
			if (!grouped.has(providerId)) {
				grouped.set(providerId, []);
			}
			grouped.get(providerId)!.push(model);
		});
		// Sort providers by name for consistent ordering
		return Array.from(grouped.entries()).sort(([a], [b]) => {
			const nameA = providerMetadataMap.get(a)?.name || a;
			const nameB = providerMetadataMap.get(b)?.name || b;
			return nameA.localeCompare(nameB);
		});
	}, [models, providerMetadataMap]);

	// Menu position is calculated by usePopupPosition hook

	// Close menu when clicking outside
	useEffect(() => {
		if (!hoverMenu.isOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (
				hoverMenu.containerRef.current &&
				!hoverMenu.containerRef.current.contains(target) &&
				menuRef.current &&
				!menuRef.current.contains(target)
			) {
				hoverMenu.closeMenu();
			}
		};

		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	}, [hoverMenu.isOpen, hoverMenu.closeMenu]);


	// Find current model info
	const currentModelInfo = useMemo(() => {
		if (!currentModel || models.length === 0) return null;
		return models.find(
			(m) => m.id === currentModel.modelId && m.provider === currentModel.provider
		);
	}, [models, currentModel]);

	// Get current model display name and icon
	const currentModelName = useMemo(() => {
		if (!currentModelInfo) {
			if (currentModel && !isCurrentModelAvailable) {
				// Show unavailable indicator
				return `${currentModel.modelId} (Unavailable)`;
			}
			return currentModel?.modelId || placeholder;
		}
		return currentModelInfo.displayName;
	}, [currentModelInfo, currentModel, placeholder, isCurrentModelAvailable]);

	// Get current model icon (only from model info, not provider)
	const currentModelIcon = useMemo(() => {
		return currentModelInfo?.icon;
	}, [currentModelInfo]);

	// Get current provider
	const currentProvider = useMemo(() => {
		return currentModel?.provider;
	}, [currentModel]);

	// Get provider icon for current provider
	const providerIcon = useMemo(() => {
		return currentProvider ? providerMetadataMap.get(currentProvider)?.icon : undefined;
	}, [currentProvider, providerMetadataMap]);

	// Handle model select
	const handleModelSelect = useCallback(
		async (provider: string, modelId: string) => {
			await onChange(provider, modelId);
			hoverMenu.closeMenu();
		},
		[onChange, hoverMenu.closeMenu]
	);

	return (
		<div
			ref={hoverMenu.containerRef}
			className={cn('pktw-relative pktw-inline-block', className)}
			onMouseEnter={hoverMenu.handleMouseEnter}
			onMouseLeave={hoverMenu.handleMouseLeave}
		>
			<button
				type="button"
				className={cn(
					'pktw-flex pktw-items-center pktw-justify-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-bg-secondary pktw-border pktw-border-border pktw-rounded-md pktw-text-[13px] pktw-font-medium pktw-cursor-pointer pktw-transition-all pktw-duration-200 pktw-whitespace-nowrap hover:pktw-bg-hover hover:pktw-border-accent',
					!isCurrentModelAvailable && currentModel
						? 'pktw-text-foreground pktw-border-destructive/50'
						: 'pktw-text-foreground',
					buttonClassName
				)}
				title={!isCurrentModelAvailable && currentModel ? 'Current model is not available. Please select another model.' : undefined}
			>
				{!isLoading && (() => {
					// Show icon if we have model icon or provider icon
					if (currentModelIcon || providerIcon) {
						return (
							<div className="pktw-w-4 pktw-h-4 pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-justify-center">
								{currentModelInfo && currentModelIcon ? (
									// Model is available, use model icon
									<SafeModelIcon
										model={currentModelIcon}
										size={16}
										className="pktw-flex-shrink-0"
										fallback={
											providerIcon ? (
												<SafeProviderIcon
													provider={providerIcon}
													size={16}
													fallback={<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-muted" />}
												/>
											) : (
												<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-muted" />
											)
										}
									/>
								) : providerIcon ? (
									// Model is unavailable or no model icon, use provider icon
									<SafeProviderIcon
										provider={providerIcon}
										size={16}
										fallback={<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-muted" />}
									/>
								) : (
									<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-muted" />
								)}
							</div>
						);
					}
					return null;
				})()}
				<span>{currentModelName}</span>
				<ChevronDown
					className="pktw-flex-shrink-0 pktw-transition-transform pktw-duration-200 hover:pktw-translate-y-px"
					size={14}
					style={{ marginLeft: '6px' }}
				/>
			</button>

			{hoverMenu.isOpen && (
				<div
					ref={menuRef}
					className={cn(
						'pktw-absolute pktw-left-0 pktw-bg-popover pktw-border pktw-border-border pktw-rounded-lg pktw-shadow-lg pktw-max-h-[400px] pktw-overflow-y-auto pktw-overflow-x-hidden pktw-z-[10000]',
						menuPosition === 'bottom' ? 'pktw-top-full pktw-mt-1' : 'pktw-bottom-full pktw-mb-1'
					)}
					onClick={(e) => e.stopPropagation()}
				>
					{isLoading ? (
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-6 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors pktw-duration-150 pktw-border-b pktw-border-border pktw-min-w-[200px] hover:pktw-bg-accent hover:pktw-text-accent-foreground">
							<div className="pktw-flex-1 pktw-text-[14px] pktw-font-medium pktw-text-foreground pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">
								Loading models...
							</div>
						</div>
					) : models.length === 0 ? (
						<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-items-start pktw-justify-between pktw-px-6 pktw-py-2.5 pktw-min-w-[220px]">
							<div className="pktw-text-[14px] pktw-font-medium pktw-text-[#000000] pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">
								No models available
							</div>
							<div className="pktw-text-[12px] pktw-text-[#666666] pktw-mt-1">
								Please go to <span className="pktw-font-semibold">Settings</span> to configure your model api key and proxys.
							</div>
						</div>
					) : (
						<>
							{/* Show unavailable current model at the top if it's not in the list */}
							{currentModel && !isCurrentModelAvailable && (
									<div className="pktw-min-w-[200px] pktw-border-b pktw-border-border">
										<div className="pktw-px-6 pktw-py-2.5">
											<div className="pktw-flex pktw-items-center pktw-gap-2">
												{providerIcon ? (
													<div className="pktw-w-4 pktw-h-4 pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-justify-center">
														<SafeProviderIcon
															provider={providerIcon}
															size={16}
															fallback={<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-muted" />}
														/>
													</div>
												) : (
													<div className="pktw-w-4 pktw-h-4 pktw-flex-shrink-0 pktw-rounded pktw-bg-muted" />
												)}
												<span className="pktw-text-[14px] pktw-font-medium pktw-text-foreground pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">
													{currentModel.modelId} (Unavailable)
												</span>
											</div>
											<div className="pktw-text-[12px] pktw-text-muted-foreground pktw-mt-1 pktw-ml-6">
												Current model is not available
											</div>
										</div>
									</div>
							)}
							{modelsByProvider.map(([providerId, providerModels], index) => {
							const providerMeta = providerMetadataMap.get(providerId);
							const providerName = providerMeta?.name || providerId;
							return (
								<div key={providerId} className="pktw-min-w-[200px]">
									{/* Provider separator - add top border for all except first */}
									{index > 0 && (
										<div className="pktw-h-[2px] pktw-bg-border pktw-my-2" />
									)}
									{/* Provider header */}
									<div className="pktw-sticky pktw-top-0 pktw-px-6 pktw-py-2.5 pktw-border-b-2 pktw-border-border pktw-z-10">
										<div className="pktw-flex pktw-items-center pktw-gap-2">
											{providerMeta?.icon && (
												<div className="pktw-w-4 pktw-h-4 pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-justify-center">
													<SafeProviderIcon
														provider={providerMeta.icon}
														size={16}
														fallback={<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-muted" />}
													/>
												</div>
											)}
											<span className="pktw-text-xs pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-tracking-wide">
												{providerName}
											</span>
										</div>
									</div>
									{/* Models in this provider */}
									{providerModels.map((model, modelIndex) => {
										const isSelected =
											currentModel?.modelId === model.id && currentModel?.provider === model.provider;
										return (
											<div
												key={`${model.provider}-${model.id}`}
												className={cn(
													'pktw-flex pktw-items-center pktw-justify-between pktw-px-6 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors pktw-duration-200 pktw-rounded-sm',
													// Only show border between models, not after the last one in the group
													modelIndex < providerModels.length - 1 && 'pktw-border-b pktw-border-border',
													'hover:pktw-bg-accent hover:pktw-text-accent-foreground',
													isSelected && 'pktw-bg-accent/20'
												)}
												onClick={() => handleModelSelect(model.provider, model.id)}
											>
												<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-flex-1 pktw-min-w-0">
													{model.icon && (() => {
														const providerIcon = providerMetadataMap.get(model.provider)?.icon;
														return (
															<div className="pktw-w-4 pktw-h-4 pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-justify-center">
																<SafeModelIcon
																	model={model.icon}
																	size={16}
																	className="pktw-flex-shrink-0"
																	fallback={
																		providerIcon ? (
																			<SafeProviderIcon
																				provider={providerIcon}
																				size={16}
																				fallback={<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-muted" />}
																			/>
																		) : (
																			<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-muted" />
																		)
																	}
																/>
															</div>
														);
													})()}
													<span className="pktw-text-[14px] pktw-font-medium pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">
														{model.displayName}
													</span>
													{/* Capabilities badges */}
													{model.capabilities && (
														<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-flex-shrink-0 pktw-ml-auto">
															{model.capabilities.vision && (
																<div title="Vision">
																	<Eye className="pktw-w-3.5 pktw-h-3.5 pktw-text-emerald-500" />
																</div>
															)}
															{model.capabilities.pdfInput && (
																<div title="PDF Input">
																	<FileText className="pktw-w-3.5 pktw-h-3.5 pktw-text-red-500" />
																</div>
															)}
															{model.capabilities.tools && (
																<div title="Tools">
																	<Wrench className="pktw-w-3.5 pktw-h-3.5 pktw-text-blue-500" />
																</div>
															)}
															{(model.capabilities.webSearch || model.capabilities.xSearch || model.capabilities.newsSearch || model.capabilities.rssSearch) && (
																<div title="Search">
																	<Globe className="pktw-w-3.5 pktw-h-3.5 pktw-text-purple-500" />
																</div>
															)}
															{model.capabilities.codeInterpreter && (
																<div title="Code Interpreter">
																	<Code className="pktw-w-3.5 pktw-h-3.5 pktw-text-orange-500" />
																</div>
															)}
															{model.capabilities.imageGeneration && (
																<div title="Image Generation">
																	<ImageIcon className="pktw-w-3.5 pktw-h-3.5 pktw-text-pink-500" />
																</div>
															)}
															{model.capabilities.reasoning && (
																<div title="Reasoning">
																	<Brain className="pktw-w-3.5 pktw-h-3.5 pktw-text-indigo-500" />
																</div>
															)}
															{model.capabilities.maxCtx && (
																<span className="pktw-text-[10px] pktw-font-medium pktw-text-muted-foreground pktw-px-1 pktw-py-0.5 pktw-bg-muted pktw-rounded" title="Max Context">
																	{formatMaxContext(model.capabilities.maxCtx)}
																</span>
															)}
														</div>
													)}
												</div>
												{isSelected && (
													<Check
														className="pktw-flex-shrink-0 pktw-ml-2 pktw-text-accent"
														size={14}
														strokeWidth={3}
													/>
												)}
											</div>
										);
									})}
								</div>
							);
						})}
						</>
					)}
				</div>
			)}
		</div>
	);
};

