import React, { useCallback } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/component/shared-ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { NumberInput } from '@/ui/component/shared-ui/number-input';

export interface ControlSettingItemProps {
	label: string;
	paramName: string;
	tooltip: string;
	icon?: React.ReactNode;
	value: number | undefined;
	enabled: boolean;
	min: number;
	max: number;
	step: number;
	onValueChange: (value: number | undefined) => void;
	onEnabledChange: (enabled: boolean) => void;
	/**
	 * Variant style for different use cases
	 * - 'compact': For popover/compact UI (smaller padding, span for value)
	 * - 'default': For settings page (larger padding, NumberInput for value)
	 */
	variant?: 'compact' | 'default';
	/**
	 * Hide the checkbox (settings are always enabled)
	 */
	hideCheckbox?: boolean;
}

/**
 * Individual control setting item with label, checkbox, slider, and value display.
 */
export const ControlSettingItem: React.FC<ControlSettingItemProps> = ({
	label,
	paramName,
	tooltip,
	icon,
	value,
	enabled,
	min,
	max,
	step,
	onValueChange,
	onEnabledChange,
	variant = 'default',
	hideCheckbox = false,
}) => {
	const displayValue = value ?? min;
	const isCompact = variant === 'compact';

	const handleSliderChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newValue = parseFloat(e.target.value);
			onValueChange(newValue);
		},
		[onValueChange]
	);


	return (
		<div
			className={cn(
				'pktw-flex pktw-items-start',
				isCompact ? 'pktw-px-4 pktw-py-3' : 'pktw-px-4 pktw-py-3.5'
			)}
		>
			{/* Left side: Label and param name (vertical layout) */}
			<div className="pktw-flex pktw-items-start pktw-gap-3 pktw-flex-1 pktw-min-w-0 pktw-pr-6">
				{icon && <span className="pktw-flex-shrink-0 pktw-text-muted-foreground pktw-mt-0.5">{icon}</span>}
				<div className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-min-w-0 pktw-flex-1">
					<TooltipProvider delayDuration={500}>
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<div
									className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-sm pktw-font-medium pktw-text-foreground hover:pktw-opacity-80 pktw-transition-opacity pktw-self-start pktw-cursor-default"
									tabIndex={-1}
									onFocus={(e) => e.currentTarget.blur()}
								>
									<span className="pktw-truncate">{label}</span>
									<HelpCircle className="pktw-size-3.5 pktw-text-muted-foreground pktw-flex-shrink-0" />
								</div>
							</TooltipTrigger>
							<TooltipContent 
								className="pktw-max-w-[280px] pktw-bg-[#000000] pktw-text-white pktw-text-xs pktw-p-3 pktw-rounded"
								side="top"
								sideOffset={4}
							>
								{tooltip}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<span className="pktw-text-xs pktw-text-muted-foreground pktw-underline pktw-self-start">{paramName}</span>
				</div>
			</div>

			{/* Right side: Slider and value */}
			<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-flex-shrink-0 pktw-mt-0.5">
				<div className="pktw-flex pktw-items-center pktw-gap-3" style={{ width: isCompact ? '180px' : '240px' }}>
					<input
						type="range"
						min={min}
						max={max}
						step={step}
						value={displayValue}
						onChange={handleSliderChange}
						disabled={!enabled}
						className={cn(
							'pktw-flex-1 pktw-h-1.5 pktw-cursor-pointer pktw-rounded-lg pktw-appearance-none pktw-bg-input',
							'enabled:pktw-accent-primary disabled:pktw-opacity-50 disabled:pktw-cursor-not-allowed',
							'[&::-webkit-slider-thumb]:pktw-appearance-none [&::-webkit-slider-thumb]:pktw-h-3.5 [&::-webkit-slider-thumb]:pktw-w-3.5 [&::-webkit-slider-thumb]:pktw-rounded-full [&::-webkit-slider-thumb]:pktw-bg-primary [&::-webkit-slider-thumb]:pktw-cursor-pointer',
							'[&::-moz-range-thumb]:pktw-h-3.5 [&::-moz-range-thumb]:pktw-w-3.5 [&::-moz-range-thumb]:pktw-rounded-full [&::-moz-range-thumb]:pktw-border-0 [&::-moz-range-thumb]:pktw-bg-primary [&::-moz-range-thumb]:pktw-cursor-pointer'
						)}
						style={{ minWidth: 0 }}
					/>
					{isCompact ? (
						<span className="pktw-w-14 pktw-text-right pktw-text-sm pktw-font-mono pktw-text-foreground pktw-flex-shrink-0">
							{displayValue.toFixed(step < 0.1 ? 2 : 1)}
						</span>
					) : (
						<NumberInput
							value={displayValue}
							onChange={onValueChange}
							min={min}
							max={max}
							step={step}
							className="pktw-w-16 pktw-text-right pktw-flex-shrink-0"
							disabled={!enabled}
						/>
					)}
				</div>
			</div>
		</div>
	);
};

