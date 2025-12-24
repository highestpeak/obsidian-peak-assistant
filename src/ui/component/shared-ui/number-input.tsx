import * as React from 'react';
import { Input, InputProps } from './input';
import { SettingField, SettingFieldProps } from './setting-field';

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

/**
 * Number input wrapped in SettingField for common use case.
 */
export interface NumberInputFieldProps extends NumberInputProps, Omit<SettingFieldProps, 'children'> {}

export function NumberInputField({ label, description, ...inputProps }: NumberInputFieldProps) {
	return (
		<SettingField label={label} description={description}>
			<NumberInput {...inputProps} />
		</SettingField>
	);
}
