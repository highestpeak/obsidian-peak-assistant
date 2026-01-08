import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { cn } from '@/ui/react/lib/utils';
import { LucideIcon } from 'lucide-react';
import { useHoverMenu } from './hover-menu-manager';

export interface HoverButtonProps {
	children?: React.ReactNode;
	text?: string;
	icon?: React.ComponentType<{ className?: string }>;
	iconClassName?: string;
	className?: string;
	variant?: 'ghost' | 'default' | 'secondary';
	size?: 'sm' | 'default' | 'lg';
	title?: string;
	onClick?: (e: React.MouseEvent) => void;
	disabled?: boolean;
	active?: boolean;
	hoverMenuContent?: React.ReactNode;
	/** Unique identifier for hover menu coordination */
	menuId?: string;
	/** Custom className for the hover menu container */
	menuClassName?: string;
}

/**
 * Get text size class based on button size
 */
const getTextSizeClass = (size?: 'sm' | 'default' | 'lg' | 'xs' | 'icon') => {
	switch (size) {
		case 'xs':
			return 'pktw-text-xs';
		case 'sm':
			return 'pktw-text-xs';
		case 'default':
			return 'pktw-text-sm';
		case 'lg':
			return 'pktw-text-lg';
		case 'icon':
			return 'pktw-text-sm';
		default:
			return 'pktw-text-sm';
	}
};

/**
 * Get icon size class based on button size
 */
const getIconSizeClass = (size?: 'sm' | 'default' | 'lg' | 'xs' | 'icon') => {
	switch (size) {
		case 'xs':
			return 'pktw-w-3 pktw-h-3';
		case 'sm':
			return 'pktw-w-4 pktw-h-4';
		case 'default':
			return 'pktw-w-5 pktw-h-5';
		case 'lg':
			return 'pktw-w-6 pktw-h-6';
		case 'icon':
			return 'pktw-w-5 pktw-h-5';
		default:
			return 'pktw-w-5 pktw-h-5';
	}
};

/**
 * Unified hover button component with consistent styling and behavior
 * Supports icons, hover states, active states, and hover menus
 */
export const HoverButton: React.FC<HoverButtonProps> = ({
	children,
	text,
	icon: Icon,
	iconClassName,
	className,
	variant = 'ghost',
	size = 'sm',
	title,
	onClick,
	disabled = false,
	active = false,
	hoverMenuContent,
	menuId,
	menuClassName,
}) => {
	// Generate default title from menuId if not provided
	const defaultTitle = menuId
		? menuId.split('-').map(word =>
			word.charAt(0).toUpperCase() + word.slice(1)
		).join(' ')
		: undefined;

	const finalTitle = title || defaultTitle;

	const showHoverMenu = !!hoverMenuContent;

	const hoverMenu = useHoverMenu({
		id: menuId || 'hover-button',
		closeDelay: 200,
		enableCoordination: true
	});

	const buttonElement = (
		<Button
			type="button"
			variant={variant}
			title={finalTitle}
			onClick={onClick}
			disabled={disabled}
			className={cn(
				'pktw-h-9 pktw-px-2.5 pktw-text-xs pktw-bg-transparent pktw-border-0 pktw-shadow-none',
				active && 'pktw-bg-accent pktw-text-accent-foreground',
				hoverMenu.isOpen && 'pktw-bg-accent pktw-text-accent-foreground',
				className
			)}
		>
			{Icon && (
				<Icon
					className={cn(
						'pktw-flex-shrink-0',
						(active || hoverMenu.isOpen) ? 'pktw-text-accent-foreground' : 'pktw-text-muted-foreground',
						getIconSizeClass(size),
						iconClassName
					)}
				/>
			)}
			{text && (
				<span className={cn(
					(active || hoverMenu.isOpen) ? 'pktw-text-accent-foreground' : 'pktw-text-muted-foreground',
					getTextSizeClass(size)
				)}>
					&nbsp;&nbsp;{text}
				</span>
			)}
			{children}
		</Button>
	);

	if (showHoverMenu && hoverMenuContent) {
		// For buttons with hover menus, wrap in HoverCard with useHoverMenu
		return (
			<div
				ref={hoverMenu.containerRef}
				className="pktw-relative pktw-inline-block"
				onMouseEnter={hoverMenu.handleMouseEnter}
				onMouseLeave={hoverMenu.handleMouseLeave}
			>
				<HoverCard openDelay={300} closeDelay={200}>
					<HoverCardTrigger asChild>
						{buttonElement}
					</HoverCardTrigger>
					<HoverCardContent
						className={cn("pktw-w-56 pktw-p-3 pktw-bg-popover pktw-shadow-lg", menuClassName)}
						align="start"
						side="top"
						sideOffset={8}
					>
						{hoverMenuContent}
					</HoverCardContent>
				</HoverCard>
			</div>
		);
	}

	return buttonElement;
};
