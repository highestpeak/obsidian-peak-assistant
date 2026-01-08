import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { Globe, Check, Twitter, MessageSquare } from 'lucide-react';
import { GlobeOff } from '@/ui/component/icon/GlobeOff';
import { cn } from '@/ui/react/lib/utils';

export interface PromptInputSearchButtonProps {
	onToggleActive?: () => void;
	onChangeProvider?: (provider: 'local' | 'perplexity' | 'model-builtin') => void;
	onToggleWebSearch?: (enabled: boolean) => void;
	onToggleTwitterSearch?: (enabled: boolean) => void;
	onToggleRedditSearch?: (enabled: boolean) => void;
	className?: string;
	active?: boolean;
	searchProvider?: 'local' | 'perplexity' | 'model-builtin';
	enableWebSearch?: boolean;
	enableTwitterSearch?: boolean;
	enableRedditSearch?: boolean;
}

/**
 * Search button component with hover menu for search options
 */
export const PromptInputSearchButton: React.FC<PromptInputSearchButtonProps> = ({
	onToggleActive,
	onChangeProvider,
	onToggleWebSearch,
	onToggleTwitterSearch,
	onToggleRedditSearch,
	className,
	active = false,
	searchProvider = 'local',
	enableWebSearch = false,
	enableTwitterSearch = true,
	enableRedditSearch = true,
}) => {
	return (
		<HoverCard openDelay={300} closeDelay={200}>
			<HoverCardTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className={cn(
						'pktw-h-8 pktw-w-8 pktw-border-0 pktw-shadow-none',
						className
					)}
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onToggleActive?.();
					}}
				>
					{!active ? (
						<GlobeOff className="pktw-size-6 hover:pktw-text-white" />
					) : (
						<Globe className="pktw-size-6 pktw-text-blue-500 hover:pktw-text-white" />
					)}
				</Button>
			</HoverCardTrigger>
			<HoverCardContent
				className="pktw-w-64 pktw-p-3 pktw-bg-popover pktw-shadow-lg"
				align="start"
				side="top"
				sideOffset={8}
			>
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

					{/* Additional Search Options */}
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
							<Twitter className="pktw-w-4 pktw-h-4 pktw-mr-1" />
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

					{/* Current Status */}
					<div className="pktw-text-xs pktw-text-muted-foreground pktw-mt-1 pktw-pt-2 pktw-border-t pktw-border-border">
						Status: {active ? 'Enabled' : 'Disabled'} • Provider: {searchProvider}
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
};