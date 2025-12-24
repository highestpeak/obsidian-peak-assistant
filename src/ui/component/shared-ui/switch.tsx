import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface SwitchProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	size?: 'default' | 'sm';
	className?: string;
}

/**
 * Toggle switch component for settings.
 */
export const Switch = React.forwardRef<HTMLLabelElement, SwitchProps>(
	({ checked, onChange, disabled = false, size = 'default', className }, ref) => {
		const sizeClasses = {
			default: {
				container: 'pktw-w-11 pktw-h-6',
				thumb: 'pktw-h-[18px] pktw-w-[18px] pktw-left-[3px] pktw-bottom-[3px]',
				translate: 'pktw-translate-x-[20px]',
			},
			sm: {
				container: 'pktw-w-9 pktw-h-5',
				thumb: 'pktw-h-[14px] pktw-w-[14px] pktw-left-[2px] pktw-bottom-[2px]',
				translate: 'pktw-translate-x-[16px]',
			},
		};

		const sizeConfig = sizeClasses[size];

		return (
			<label
				ref={ref}
				className={cn(
					'pktw-relative pktw-inline-block pktw-cursor-pointer',
					disabled && 'pktw-cursor-not-allowed pktw-opacity-50',
					className
				)}
			>
				<input
					type="checkbox"
					checked={checked}
					onChange={(e) => !disabled && onChange(e.target.checked)}
					disabled={disabled}
					className="pktw-opacity-0 pktw-w-0 pktw-h-0"
				/>
				<span
					className={cn(
						'pktw-absolute pktw-cursor-pointer pktw-top-0 pktw-left-0 pktw-right-0 pktw-bottom-0 pktw-transition-all pktw-duration-300 pktw-rounded-full',
						checked ? 'pktw-bg-accent' : 'pktw-bg-border',
						disabled && 'pktw-cursor-not-allowed'
					)}
				>
					<span
						className={cn(
							"pktw-absolute pktw-content-[''] pktw-bg-white pktw-transition-all pktw-duration-300 pktw-rounded-full",
							sizeConfig.thumb,
							checked && sizeConfig.translate
						)}
					></span>
				</span>
			</label>
		);
	}
);
Switch.displayName = 'Switch';
