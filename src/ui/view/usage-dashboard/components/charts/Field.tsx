import * as React from 'react';

export interface FieldProps {
	label: React.ReactNode;
	hint?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}

export function Field({ label, hint, children, className }: FieldProps) {
	return (
		<div className={joinClass('pk-field', className)}>
			<span className="pk-field__label">{label}</span>
			{children}
			{hint ? <span className="pk-field__hint">{hint}</span> : null}
		</div>
	);
}

export interface NumberFieldProps {
	value: number;
	onChange: (next: number) => void;
	min?: number;
	max?: number;
	step?: number;
	/** Decimal places used when formatting the value back into the input. */
	precision?: number;
	prefix?: string;
	'aria-label'?: string;
	className?: string;
}

/**
 * Numeric input with adjacent +/− steppers. Mirrors the mock's "field__input"
 * pattern. Internal text state is kept loose while focused so the user can
 * clear the cell before typing a new value; on blur we re-derive from the
 * committed numeric value.
 */
export function NumberField({
	value,
	onChange,
	min = 0,
	max = Number.POSITIVE_INFINITY,
	step = 1,
	precision = 2,
	prefix,
	className,
	...aria
}: NumberFieldProps) {
	const [text, setText] = React.useState(() => format(value, precision));
	const [focused, setFocused] = React.useState(false);
	React.useEffect(() => {
		if (!focused) setText(format(value, precision));
	}, [value, focused, precision]);

	const commit = (raw: string) => {
		const cleaned = raw.replace(/[^0-9.]/g, '');
		const n = Number.parseFloat(cleaned);
		if (!Number.isFinite(n)) {
			onChange(min);
			return;
		}
		onChange(Math.max(min, Math.min(max, n)));
	};

	const adjust = (delta: number) => {
		onChange(Math.max(min, Math.min(max, value + delta)));
	};

	return (
		<div className={joinClass('pk-number-field', className)}>
			<input
				className="pk-field__input"
				type="text"
				inputMode="decimal"
				value={focused ? text : prefix ? `${prefix}${format(value, precision)}` : format(value, precision)}
				onFocus={() => {
					setFocused(true);
					setText(format(value, precision));
				}}
				onBlur={() => {
					setFocused(false);
					commit(text);
				}}
				onChange={(e) => setText(e.currentTarget.value)}
				aria-label={aria['aria-label']}
			/>
			<button
				type="button"
				className="pk-number-field__step"
				onClick={() => adjust(-step)}
				aria-label="Decrease"
			>−</button>
			<button
				type="button"
				className="pk-number-field__step"
				onClick={() => adjust(step)}
				aria-label="Increase"
			>+</button>
		</div>
	);
}

function format(value: number, precision: number): string {
	if (!Number.isFinite(value)) return '0';
	return value.toFixed(precision);
}

function joinClass(...parts: Array<string | undefined>): string {
	return parts.filter(Boolean).join(' ');
}
