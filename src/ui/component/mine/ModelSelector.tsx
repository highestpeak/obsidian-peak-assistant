import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { ChevronDown, Check } from 'lucide-react';
import { SafeModelIcon, SafeProviderIcon } from '@/ui/component/mine/SafeIconWrapper';
import { cn } from '@/ui/react/lib/utils';
import { ProviderServiceFactory } from '@/core/providers/base/factory';

/**
 * Global registry to track all open selectors
 * When a new selector opens, it closes all others
 */
const openSelectors = new Set<() => void>();

/**
 * Close all open selectors except the provided one
 */
function closeAllExcept(exceptCloseFn?: () => void) {
	openSelectors.forEach((closeFn) => {
		if (closeFn !== exceptCloseFn) {
			closeFn();
		}
	});
}

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
}) => {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [menuPosition, setMenuPosition] = useState<'bottom' | 'top'>('bottom');
	const containerRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

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

	// Close menu helper
	const closeMenu = useCallback(() => {
		setIsMenuOpen(false);
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	}, []);

	// Handle mouse leave from menu with delay
	const handleMenuMouseLeave = useCallback(() => {
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
		}
		closeTimerRef.current = setTimeout(() => {
			closeMenu();
		}, 1000); // 1000ms delay
	}, [closeMenu]);

	// Handle mouse enter to container/menu (cancel close timer)
	const handleMouseEnter = useCallback(() => {
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	}, []);

	// Handle menu open/close and coordinate with other selectors
	useEffect(() => {
		if (isMenuOpen) {
			// Close all other selectors before opening this one
			closeAllExcept(closeMenu);
			// Register this selector
			openSelectors.add(closeMenu);
		} else {
			// Unregister when closed
			openSelectors.delete(closeMenu);
		}

		// Cleanup on unmount
		return () => {
			openSelectors.delete(closeMenu);
		};
	}, [isMenuOpen, closeMenu]);

	// Calculate menu position (bottom or top) based on available space
	useEffect(() => {
		if (!isMenuOpen || !containerRef.current || !menuRef.current) return;

		const calculatePosition = () => {
			const container = containerRef.current;
			const menu = menuRef.current;
			if (!container || !menu) return;

			const containerRect = container.getBoundingClientRect();
			const menuHeight = menu.offsetHeight || 400; // Estimate menu height
			const spaceBelow = window.innerHeight - containerRect.bottom;
			const spaceAbove = containerRect.top;

			// If not enough space below but enough space above, show above
			if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
				setMenuPosition('top');
			} else {
				setMenuPosition('bottom');
			}
		};

		// Calculate on open and on resize
		calculatePosition();
		window.addEventListener('resize', calculatePosition);
		window.addEventListener('scroll', calculatePosition, true);

		return () => {
			window.removeEventListener('resize', calculatePosition);
			window.removeEventListener('scroll', calculatePosition, true);
		};
	}, [isMenuOpen]);

	// Close menu when clicking outside
	useEffect(() => {
		if (!isMenuOpen) return;
		
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (
				containerRef.current &&
				!containerRef.current.contains(target) &&
				menuRef.current &&
				!menuRef.current.contains(target)
			) {
				closeMenu();
			}
		};
		
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	}, [isMenuOpen, closeMenu]);

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (closeTimerRef.current) {
				clearTimeout(closeTimerRef.current);
			}
		};
	}, []);

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
	const currentModelIcon = currentModelInfo?.icon;

	const currentProvider = currentModel?.provider;

	// Handle model select
	const handleModelSelect = useCallback(
		async (provider: string, modelId: string) => {
			await onChange(provider, modelId);
			setIsMenuOpen(false);
		},
		[onChange]
	);

	return (
		<div
			ref={containerRef}
			className={cn('pktw-relative pktw-inline-block', className)}
			onMouseLeave={isMenuOpen ? handleMenuMouseLeave : undefined}
			onMouseEnter={isMenuOpen ? handleMouseEnter : undefined}
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
				onClick={(e) => {
					e.stopPropagation();
					e.preventDefault();
					setIsMenuOpen(!isMenuOpen);
				}}
				title={!isCurrentModelAvailable && currentModel ? 'Current model is not available. Please select another model.' : undefined}
			>
				{!isLoading && (() => {
					// Determine which icon to show: model icon, or provider icon if unavailable
					const providerIcon = currentProvider ? providerMetadataMap.get(currentProvider)?.icon : undefined;
					
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

			{isMenuOpen && (
				<div
					ref={menuRef}
					className={cn(
						'pktw-absolute pktw-left-0 pktw-bg-background pktw-border pktw-border-border pktw-rounded-lg pktw-shadow-lg pktw-max-h-[400px] pktw-overflow-y-auto pktw-overflow-x-hidden pktw-z-[10000]',
						menuPosition === 'bottom' ? 'pktw-top-full pktw-mt-1' : 'pktw-bottom-full pktw-mb-1'
					)}
					onClick={(e) => e.stopPropagation()}
					onMouseLeave={handleMenuMouseLeave}
					onMouseEnter={handleMouseEnter}
				>
					{isLoading ? (
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-6 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors pktw-duration-150 pktw-border-b pktw-border-border pktw-min-w-[200px] hover:pktw-bg-hover">
							<div className="pktw-flex-1 pktw-text-[14px] pktw-font-medium pktw-text-foreground pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">
								Loading models...
							</div>
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
						<>
							{/* Show unavailable current model at the top if it's not in the list */}
							{currentModel && !isCurrentModelAvailable && (() => {
								const providerIcon = currentProvider ? providerMetadataMap.get(currentProvider)?.icon : undefined;
								return (
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
								);
							})()}
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
									<div className="pktw-sticky pktw-top-0 pktw-bg-background pktw-px-6 pktw-py-2.5 pktw-border-b-2 pktw-border-border pktw-z-10">
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
													'pktw-flex pktw-items-center pktw-justify-between pktw-px-6 pktw-py-2.5 pktw-cursor-pointer pktw-transition-all pktw-duration-200 pktw-rounded-sm',
													// Only show border between models, not after the last one in the group
													modelIndex < providerModels.length - 1 && 'pktw-border-b pktw-border-border',
													'hover:pktw-bg-hover hover:pktw-shadow-sm hover:pktw-scale-[1.01]',
													isSelected && 'pktw-bg-[var(--background-modifier-active)] pktw-bg-accent/20'
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
													<span className="pktw-text-[14px] pktw-font-medium pktw-text-foreground pktw-whitespace-nowrap pktw-overflow-hidden pktw-text-ellipsis">
														{model.displayName}
													</span>
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

