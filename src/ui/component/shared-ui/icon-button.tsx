import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface IconButtonProps
	extends React.HTMLAttributes<HTMLDivElement> {
	/**
	 * Icon element to display
	 */
	children: React.ReactNode;
	/**
	 * Size of the icon button
	 */
	size?: 'xs' | 'sm' | 'md' | 'lg';
}

/**
 * Icon button component using div wrapper to avoid Obsidian's button global styles
 * Uses Tailwind classes for styling, compatible with both Obsidian and desktop environments
 * todo children and size should be variables.
 */
export const IconButton = React.forwardRef<HTMLDivElement, IconButtonProps>(
	({ className, size = 'md', children, onClick, onKeyDown, ...props }, ref) => {
		const sizeClasses = {
			xs: 'pktw-h-4 pktw-w-4',
			sm: 'pktw-h-5 pktw-w-5',
			md: 'pktw-h-6 pktw-w-6',
			lg: 'pktw-h-8 pktw-w-8',
		};

		const iconSizeClasses = {
			xs: 'pktw-h-3.5 pktw-w-3.5',
			sm: 'pktw-h-4.5 pktw-w-4.5',
			md: 'pktw-h-5 pktw-w-5',
			lg: 'pktw-h-6 pktw-w-6',
		};

		const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				onClick?.(e as any);
			}
			onKeyDown?.(e);
		};

		// Clone children and add icon size class
		const iconSizeClass = iconSizeClasses[size];
		const childrenWithSize = React.Children.map(children, (child) => {
			if (React.isValidElement(child)) {
				return React.cloneElement(child as React.ReactElement<any>, {
					className: cn(iconSizeClass, (child as any).props?.className),
				});
			}
			return child;
		});

		return (
			<div
				ref={ref}
				className={cn(
					'pktw-flex pktw-items-center pktw-justify-center',
					'pktw-cursor-pointer',
					'pktw-bg-transparent',
					'pktw-border-none pktw-outline-none',
					'pktw-select-none',
					'pktw-rounded-md',
					'pktw-group',
					'hover:pktw-bg-muted/50',
					'active:pktw-opacity-80',
					'focus-visible:pktw-outline-2 focus-visible:pktw-outline-primary focus-visible:pktw-outline-offset-2',
					'pktw-transition-colors',
					sizeClasses[size],
					className
				)}
				onClick={onClick}
				onKeyDown={handleKeyDown}
				role="button"
				tabIndex={0}
				{...props}
			>
				{childrenWithSize}
			</div>
		);
	}
);
IconButton.displayName = 'IconButton';

