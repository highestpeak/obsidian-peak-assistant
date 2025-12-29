import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { Globe } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

export interface PromptInputSearchButtonProps {
	onClick?: () => void;
	className?: string;
	active?: boolean;
}

/**
 * Search button component with active state
 */
export const PromptInputSearchButton: React.FC<PromptInputSearchButtonProps> = ({
	onClick,
	className,
	active = false,
}) => {
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className={cn(
				'pktw-h-9 pktw-px-2.5 pktw-text-xs pktw-border-0 pktw-shadow-none',
				'hover:pktw-bg-accent hover:pktw-text-accent-foreground',
				active && 'pktw-bg-accent pktw-text-accent-foreground',
				className
			)}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick?.();
			}}
		>
			<Globe className="pktw-size-5 pktw-mr-1.5" />
			<span>Search</span>
		</Button>
	);
};

