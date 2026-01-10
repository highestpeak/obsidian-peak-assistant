import * as React from 'react';
import { Input, InputProps } from '../shared-ui/input';
import { Check } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

export interface InputWithConfirmProps extends Omit<InputProps, 'onChange'> {
	/** Initial value */
	value: string;
	/** Callback when value is confirmed (on Enter or button click) */
	onConfirm: (value: string) => Promise<void> | void;
	/** Optional: Custom className for the container */
	containerClassName?: string;
}

/**
 * Input component that requires confirmation before applying changes.
 * Press Enter or click the confirm button to apply changes.
 * Shows a checkmark icon after successful confirmation.
 */
export const InputWithConfirm = React.forwardRef<HTMLInputElement, InputWithConfirmProps>(
	({ value: initialValue, onConfirm, containerClassName, className, ...props }, ref) => {
		const [localValue, setLocalValue] = React.useState(initialValue);
		const [isConfirming, setIsConfirming] = React.useState(false);
		const [showCheckmark, setShowCheckmark] = React.useState(false);
		const inputRef = React.useRef<HTMLInputElement | null>(null);
		const checkmarkTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

		// Sync with external value changes
		React.useEffect(() => {
			setLocalValue(initialValue);
		}, [initialValue]);

		// Cleanup timeout on unmount
		React.useEffect(() => {
			return () => {
				if (checkmarkTimeoutRef.current) {
					clearTimeout(checkmarkTimeoutRef.current);
				}
			};
		}, []);

		const handleConfirm = React.useCallback(async () => {
			if (localValue === initialValue) return; // No changes
			
			setIsConfirming(true);
			try {
				await onConfirm(localValue);
				setShowCheckmark(true);
				// Hide checkmark after 1.5 seconds
				checkmarkTimeoutRef.current = setTimeout(() => {
					setShowCheckmark(false);
				}, 1500);
			} catch (error) {
				console.error('[InputWithConfirm] Error confirming value:', error);
				// Reset to original value on error
				setLocalValue(initialValue);
			} finally {
				setIsConfirming(false);
			}
		}, [localValue, initialValue, onConfirm]);

		const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				handleConfirm();
			}
		}, [handleConfirm]);

		const hasChanges = localValue !== initialValue;
		const mergedRef = React.useCallback((node: HTMLInputElement | null) => {
			inputRef.current = node;
			if (ref) {
				if (typeof ref === 'function') {
					ref(node);
				} else {
					// Use type assertion for ref object
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(ref as any).current = node;
				}
			}
		}, [ref]);

		return (
			<div className={cn('pktw-relative pktw-flex pktw-items-center pktw-gap-2', containerClassName)}>
				<Input
					ref={mergedRef}
					{...props}
					className={cn(className, hasChanges && 'pktw-border-accent')}
					value={localValue}
					onChange={(e) => setLocalValue(e.target.value)}
					onKeyDown={handleKeyDown}
				/>
				{hasChanges && !showCheckmark && (
					<button
						type="button"
						onClick={handleConfirm}
						disabled={isConfirming}
						className="pktw-flex-shrink-0 pktw-px-2 pktw-py-1 pktw-text-xs pktw-font-medium pktw-text-white pktw-bg-accent pktw-rounded pktw-transition-all hover:pktw-opacity-80 disabled:pktw-opacity-50 disabled:pktw-cursor-not-allowed"
					>
						{isConfirming ? '...' : 'Confirm'}
					</button>
				)}
				{showCheckmark && (
					<div className="pktw-flex-shrink-0 pktw-w-6 pktw-h-6 pktw-flex pktw-items-center pktw-justify-center pktw-text-accent pktw-animate-in pktw-fade-in-0 pktw-zoom-in-95">
						<Check size={16} strokeWidth={3} />
					</div>
				)}
			</div>
		);
	}
);
InputWithConfirm.displayName = 'InputWithConfirm';

