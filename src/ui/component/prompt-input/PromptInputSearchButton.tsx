import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { Globe, X, MessageSquare, Check } from 'lucide-react';
import { GlobeOff } from '@/ui/component/icon';
import { cn } from '@/ui/react/lib/utils';
import { HoverButton } from '@/ui/component/mine';

export interface PromptInputSearchButtonProps {
	active?: boolean;
	searchProvider?: 'local' | 'perplexity' | 'model-builtin';
	enableWebSearch?: boolean;
	enableTwitterSearch?: boolean;
	enableRedditSearch?: boolean;
	onToggleActive?: () => void;
	onChangeProvider?: (provider: 'local' | 'perplexity' | 'model-builtin') => void;
	onToggleWebSearch?: (enabled: boolean) => void;
	onToggleTwitterSearch?: (enabled: boolean) => void;
	onToggleRedditSearch?: (enabled: boolean) => void;
	className?: string;
}

/**
 * Search button with hover menu for search options
 */
export const PromptInputSearchButton: React.FC<PromptInputSearchButtonProps> = ({
	active,
	searchProvider,
	enableWebSearch,
	enableTwitterSearch,
	enableRedditSearch,
	onToggleActive,
	onChangeProvider,
	onToggleWebSearch,
	onToggleTwitterSearch,
	onToggleRedditSearch,
	className,
}) => {
	const menuContent = (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			<div className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-border-b pktw-border-border pktw-pb-2">
				Search Options
			</div>

			{/* Search Provider Selection */}
			<div className="pktw-flex pktw-flex-col pktw-gap-1">
				<div className="pktw-text-xs pktw-font-medium pktw-text-muted-foreground pktw-mb-1">
					Search Provider
				</div>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						'pktw-justify-start pktw-h-7 pktw-px-2 pktw-text-xs pktw-font-normal',
						searchProvider === 'local' && 'pktw-bg-accent pktw-text-accent-foreground'
					)}
					onClick={() => onChangeProvider?.('local')}
				>
					{searchProvider === 'local' && <Check className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					{searchProvider !== 'local' && <div className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					Host Engine
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						'pktw-justify-start pktw-h-7 pktw-px-2 pktw-text-xs pktw-font-normal',
						searchProvider === 'perplexity' && 'pktw-bg-accent pktw-text-accent-foreground'
					)}
					onClick={() => onChangeProvider?.('perplexity')}
				>
					{searchProvider === 'perplexity' && <Check className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					{searchProvider !== 'perplexity' && <div className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					Perplexity AI
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						'pktw-justify-start pktw-h-7 pktw-px-2 pktw-text-xs pktw-font-normal',
						searchProvider === 'model-builtin' && 'pktw-bg-accent pktw-text-accent-foreground'
					)}
					onClick={() => onChangeProvider?.('model-builtin')}
				>
					{searchProvider === 'model-builtin' && <Check className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					{searchProvider !== 'model-builtin' && <div className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					Model Built-in
				</Button>
			</div>

			{/* Additional Sources */}
			<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-border-t pktw-border-border pktw-pt-2">
				<div className="pktw-text-xs pktw-font-medium pktw-text-muted-foreground pktw-mb-1">
					Additional Sources
				</div>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						'pktw-justify-start pktw-h-7 pktw-px-2 pktw-text-xs pktw-font-normal',
						enableWebSearch && 'pktw-bg-accent pktw-text-accent-foreground'
					)}
					onClick={() => onToggleWebSearch?.(!enableWebSearch)}
				>
					{enableWebSearch && <Check className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					{!enableWebSearch && <div className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					Web Search
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						'pktw-justify-start pktw-h-7 pktw-px-2 pktw-text-xs pktw-font-normal',
						enableTwitterSearch && 'pktw-bg-accent pktw-text-accent-foreground'
					)}
					onClick={() => onToggleTwitterSearch?.(!enableTwitterSearch)}
				>
					{enableTwitterSearch && <Check className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					{!enableTwitterSearch && <div className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					<X className="pktw-w-4 pktw-h-4 pktw-mr-1" />
					Twitter
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						'pktw-justify-start pktw-h-7 pktw-px-2 pktw-text-xs pktw-font-normal',
						enableRedditSearch && 'pktw-bg-accent pktw-text-accent-foreground'
					)}
					onClick={() => onToggleRedditSearch?.(!enableRedditSearch)}
				>
					{enableRedditSearch && <Check className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					{!enableRedditSearch && <div className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
					<MessageSquare className="pktw-w-4 pktw-h-4 pktw-mr-1" />
					Reddit
				</Button>
			</div>
		</div>
	);

	return (
		<HoverButton
			icon={active ? Globe : GlobeOff}
			menuId="search-options"
			onClick={() => onToggleActive?.()}
			active={active}
			hoverMenuContent={menuContent}
		/>
	);
};