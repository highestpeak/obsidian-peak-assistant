import * as React from 'react';
import { Input, InputProps } from './input';
import { SettingField, SettingFieldProps } from '../../view/settings/component/setting-field';
import { InputWithConfirm } from '../mine/input-with-confirm';
import { Check } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

export interface NumberInputProps extends Omit<InputProps, 'type' | 'value' | 'onChange'> {
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	validate?: (value: number) => boolean;
}

/**
 * Number input with validation.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
	({ value, onChange, min, max, step = 1, validate, ...props }, ref) => {
		const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
			const num = parseFloat(e.target.value);
			if (isNaN(num)) return;

			// Apply min/max constraints
			let validValue = num;
			if (min !== undefined && validValue < min) return;
			if (max !== undefined && validValue > max) return;

			// Apply custom validation
			if (validate && !validate(validValue)) return;

			onChange(validValue);
		};

		return (
			<Input
				ref={ref}
				type="number"
				value={String(value)}
				onChange={handleChange}
				min={min}
				max={max}
				step={step}
				{...props}
			/>
		);
	}
);
NumberInput.displayName = 'NumberInput';

export interface NumberInputWithConfirmProps extends Omit<InputProps, 'type' | 'value' | 'onChange'> {
	value: number;
	onConfirm: (value: number) => Promise<void> | void;
	min?: number;
	max?: number;
	step?: number;
	validate?: (value: number) => boolean;
	containerClassName?: string;
}

/**
 * Number input that requires confirmation before applying changes.
 */
export const NumberInputWithConfirm = React.forwardRef<HTMLInputElement, NumberInputWithConfirmProps>(
	({ value: initialValue, onConfirm, min, max, step = 1, validate, containerClassName, className, ...props }, ref) => {
		const [localValue, setLocalValue] = React.useState(String(initialValue));
		const [isConfirming, setIsConfirming] = React.useState(false);
		const [showCheckmark, setShowCheckmark] = React.useState(false);
		const inputRef = React.useRef<HTMLInputElement | null>(null);
		const checkmarkTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

		// Sync with external value changes
		React.useEffect(() => {
			setLocalValue(String(initialValue));
		}, [initialValue]);

		// Cleanup timeout on unmount
		React.useEffect(() => {
			return () => {
				if (checkmarkTimeoutRef.current) {
					clearTimeout(checkmarkTimeoutRef.current);
				}
			};
		}, []);

		const parseAndValidate = React.useCallback((str: string): number | null => {
			const num = parseFloat(str);
			if (isNaN(num)) return null;

			// Apply min/max constraints
			if (min !== undefined && num < min) return null;
			if (max !== undefined && num > max) return null;

			// Apply custom validation
			if (validate && !validate(num)) return null;

			return num;
		}, [min, max, validate]);

		const handleConfirm = React.useCallback(async () => {
			const parsedValue = parseAndValidate(localValue);
			if (parsedValue === null || parsedValue === initialValue) return; // Invalid or no changes
			
			setIsConfirming(true);
			try {
				await onConfirm(parsedValue);
				setShowCheckmark(true);
				// Hide checkmark after 1.5 seconds
				checkmarkTimeoutRef.current = setTimeout(() => {
					setShowCheckmark(false);
				}, 1500);
			} catch (error) {
				console.error('[NumberInputWithConfirm] Error confirming value:', error);
				// Reset to original value on error
				setLocalValue(String(initialValue));
			} finally {
				setIsConfirming(false);
			}
		}, [localValue, initialValue, onConfirm, parseAndValidate]);

		const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				handleConfirm();
			}
		}, [handleConfirm]);

		const handleChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
			setLocalValue(e.target.value);
		}, []);

		const parsedValue = parseAndValidate(localValue);
		const hasChanges = parsedValue !== null && parsedValue !== initialValue;
		const hasError = localValue !== '' && parsedValue === null;

		const mergedRef = React.useCallback((node: HTMLInputElement | null) => {
			inputRef.current = node;
			if (ref) {
				if (typeof ref === 'function') {
					ref(node);
				} else {
					// TypeScript treats ref.current as readonly for RefObject,
					// but in practice it can be assigned for MutableRefObject
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
					type="number"
					className={cn(className, hasChanges && 'pktw-border-accent', hasError && 'pktw-border-destructive')}
					value={localValue}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					min={min}
					max={max}
					step={step}
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
NumberInputWithConfirm.displayName = 'NumberInputWithConfirm';

/**
 * Number input wrapped in SettingField for common use case.
 */
export interface NumberInputFieldProps extends Omit<NumberInputWithConfirmProps, 'type'>, Omit<SettingFieldProps, 'children'> {}

export function NumberInputField({ label, description, ...inputProps }: NumberInputFieldProps) {
	return (
		<SettingField label={label} description={description}>
			<NumberInputWithConfirm {...inputProps} />
		</SettingField>
	);
}
