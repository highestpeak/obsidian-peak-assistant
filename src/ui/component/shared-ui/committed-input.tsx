import * as React from 'react';
import { Input, InputProps } from './input';
import { SettingField, SettingFieldProps } from '../../view/settings/component/setting-field';

export interface CommittedInputProps extends Omit<InputProps, 'value' | 'onChange' | 'onBlur' | 'onKeyDown'> {
	value: string;
	onCommit: (value: string) => void | Promise<void>;
	onChange?: (value: string) => void;
	commitOnBlur?: boolean;
	commitOnEnter?: boolean;
	transform?: (value: string) => string;
}

/**
 * Input that commits value on blur or Enter key, useful for settings that need confirmation.
 */
export const CommittedInput = React.forwardRef<HTMLInputElement, CommittedInputProps>(
	(
		{
			value,
			onCommit,
			onChange,
			commitOnBlur = true,
			commitOnEnter = true,
			transform = (v) => v.trim(),
			...props
		},
		ref
	) => {
		const [localValue, setLocalValue] = React.useState(value);
		const inputRef = React.useRef<HTMLInputElement>(null);

		// Sync with external value changes
		React.useEffect(() => {
			setLocalValue(value);
		}, [value]);

		// Merge refs
		React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

		const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
			const newValue = e.target.value;
			setLocalValue(newValue);
			onChange?.(newValue);
		};

		const handleCommit = React.useCallback(async () => {
			const transformed = transform(localValue);
			if (transformed !== value) {
				await onCommit(transformed);
			}
		}, [localValue, value, transform, onCommit]);

		const handleBlur = () => {
			if (commitOnBlur) {
				void handleCommit();
			}
		};

		const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
			if (commitOnEnter && e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				void handleCommit();
				inputRef.current?.blur();
			}
		};

		return (
			<Input
				ref={inputRef}
				value={localValue}
				onChange={handleChange}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				{...props}
			/>
		);
	}
);
CommittedInput.displayName = 'CommittedInput';

/**
 * Committed input wrapped in SettingField for common use case.
 */
export interface CommittedInputFieldProps extends CommittedInputProps, Omit<SettingFieldProps, 'children'> {}

export function CommittedInputField({ label, description, ...inputProps }: CommittedInputFieldProps) {
	return (
		<SettingField label={label} description={description}>
			<CommittedInput {...inputProps} />
		</SettingField>
	);
}
