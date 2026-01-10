import React, { useCallback } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/component/shared-ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { NumberInput } from '@/ui/component/shared-ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/component/shared-ui/select';
import { ProgressBarSelector } from './ProgressBarSelector';
import { ProgressBarSlider } from '../ProgressBarSlider';
import type { ControlType } from './constants';

export interface ControlSettingItemProps {
	label: string;
	paramName: string;
	tooltip: string;
	icon?: React.ReactNode;
	value: number | string | undefined;
	enabled: boolean;
	type: ControlType;
	// For slider controls
	min?: number;
	max?: number;
	step?: number;
	// For select controls
	options?: { value: string; label: string }[];
	onValueChange: (value: number | string | undefined) => void;
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
	type,
	min,
	max,
	step,
	options,
	onValueChange,
	onEnabledChange,
	variant = 'default',
	hideCheckbox = false,
}) => {
	const displayValue = value ?? (type === 'slider' ? min : options?.[0]?.value);
	const isCompact = variant === 'compact';

	const handleSliderChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newValue = parseFloat(e.target.value);
			onValueChange(newValue);
		},
		[onValueChange]
	);

	const handleSelectChange = useCallback(
		(newValue: string) => {
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

			{/* Right side: Control and value */}
			<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-flex-shrink-0 pktw-mt-0.5">
				{type === 'slider' ? (
					<div className={cn(
						"pktw-w-[240px]",
						isCompact && "pktw-w-[200px]"
					)}>
						<ProgressBarSlider
							value={displayValue as number}
							min={min!}
							max={max!}
							step={step!}
							onChange={onValueChange}
							disabled={!enabled}
						/>
					</div>
				) : (
					<div className={cn(
						"pktw-w-[240px]",
						isCompact && "pktw-w-[200px]"
					)}>
						<ProgressBarSelector
							options={options || []}
							value={displayValue as string}
							onChange={handleSelectChange}
							disabled={!enabled}
						/>
					</div>
				)}
			</div>
		</div>
	);
};

