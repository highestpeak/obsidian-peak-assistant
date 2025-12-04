import * as React from 'react';
import { cn } from '../../react/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type, ...props }, ref) => {
		return (
			<input
				type={type}
				className={cn(
					'pktw-flex pktw-h-10 pktw-w-full pktw-rounded-md pktw-border pktw-border-input pktw-bg-background pktw-px-3 pktw-py-2 pktw-text-sm pktw-ring-offset-background file:pktw-border-0 file:pktw-bg-transparent file:pktw-text-sm file:pktw-font-medium placeholder:pktw-text-muted-foreground focus-visible:pktw-outline-none focus-visible:pktw-ring-2 focus-visible:pktw-ring-ring focus-visible:pktw-ring-offset-2 disabled:pktw-cursor-not-allowed disabled:pktw-opacity-50',
					className
				)}
				ref={ref}
				{...props}
			/>
		);
	}
);
Input.displayName = 'Input';

export { Input };

