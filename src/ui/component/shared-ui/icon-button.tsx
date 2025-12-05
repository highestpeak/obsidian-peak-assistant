import * as React from 'react';
import { cn } from '../../react/lib/utils';

export interface IconButtonProps
	extends React.HTMLAttributes<HTMLDivElement> {
	/**
	 * Icon element to display
	 */
	children: React.ReactNode;
	/**
	 * Size of the icon button
	 */
	size?: 'xs' | 'sm' | 'md';
}

/**
 * Icon button component using div wrapper to avoid Obsidian's button global styles
 * Follows Obsidian's clickable-icon pattern for consistency
 */
export const IconButton = React.forwardRef<HTMLDivElement, IconButtonProps>(
	({ className, size = 'md', children, onClick, onKeyDown, ...props }, ref) => {
		const sizeClasses = {
			xs: 'pktw-h-3 pktw-w-3',
			sm: 'pktw-h-4 pktw-w-4',
			md: 'pktw-h-5 pktw-w-5',
		};

		const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				onClick?.(e as any);
			}
			onKeyDown?.(e);
		};

		return (
			<div
				ref={ref}
				className={cn(
					'clickable-icon',
					'pktw-flex pktw-items-center pktw-justify-center',
					'pktw-cursor-pointer',
					sizeClasses[size],
					className
				)}
				onClick={onClick}
				onKeyDown={handleKeyDown}
				role="button"
				tabIndex={0}
				{...props}
			>
				{children}
			</div>
		);
	}
);
IconButton.displayName = 'IconButton';

