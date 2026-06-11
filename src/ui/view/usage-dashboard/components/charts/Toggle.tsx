import * as React from 'react';

export interface ToggleProps {
	pressed: boolean;
	onPressedChange?: (next: boolean) => void;
	disabled?: boolean;
	'aria-label': string;
	className?: string;
}

/**
 * Track + thumb toggle used in the Alert Rules card. `aria-pressed` drives
 * both styling and accessibility, mirroring the mock's `.tog[aria-pressed]`
 * selectors.
 */
export function Toggle({
	pressed,
	onPressedChange,
	disabled,
	className,
	...aria
}: ToggleProps) {
	return (
		<button
			type="button"
			className={joinClass('pk-tog', className)}
			aria-pressed={pressed}
			aria-label={aria['aria-label']}
			disabled={disabled}
			onClick={() => {
				if (disabled) return;
				onPressedChange?.(!pressed);
			}}
		>
			<span className="pk-tog__track" aria-hidden="true" />
		</button>
	);
}

function joinClass(...parts: Array<string | undefined>): string {
	return parts.filter(Boolean).join(' ');
}
