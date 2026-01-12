import React from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { useHoverMenu } from '@/ui/component/mine';
import { OpenIn } from '@/ui/component/ai-elements';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/component/shared-ui/popover';
import { cn } from '@/ui/react/lib/utils';
import { ExternalLink } from 'lucide-react';
import { openSourceFile } from '@/ui/view/shared/view-utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Button } from '@/ui/component/shared-ui/button';

/**
 * Individual menu item for opening in external platforms
 */
const OpenMenuItem: React.FC<{
	platformName: string;
	url?: string;
	onClick?: () => void;
	className?: string;
}> = ({
	platformName,
	url,
	onClick,
	className
}) => {
	const handleClick = () => {
		if (url) {
			window.open(url, '_blank', 'noopener,noreferrer');
		}
		onClick?.();
	};

	return (
		<Button
			type="button"
			variant="ghost"
			onClick={handleClick}
			className={cn(
				"pktw-flex pktw-items-center pktw-justify-between pktw-w-full pktw-px-3 pktw-py-2 pktw-text-sm pktw-text-left pktw-rounded-md hover:pktw-bg-accent hover:pktw-text-accent-foreground pktw-transition-colors",
				className
			)}
		>
			<span className="pktw-flex pktw-items-center pktw-gap-2">
				{platformName}
			</span>
			{url && <ExternalLink className="pktw-size-3 pktw-flex-shrink-0" />}
		</Button>
	);
};

/**
 * Open menu component with multiple platform options and open source document
 */
export const OpenMenuButton: React.FC = () => {
	const { app } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);

	// Use the unified hover menu manager
	const hoverMenu = useHoverMenu({
		id: 'open-menu',
		closeDelay: 300,
		enableCoordination: true
	});

	// Handle open source document
	const handleOpenSource = async () => {
		if (activeConversation?.file) {
			await openSourceFile(app, activeConversation.file);
		}
	};

	// Build query from all user messages in the conversation
	const conversationQuery = React.useMemo(() => {
		if (!activeConversation || !activeConversation.messages || activeConversation.messages.length === 0) {
			return '';
		}
		// Get all user messages and join them
		const userMessages = activeConversation.messages
			.filter(msg => msg.role === 'user')
			.map(msg => msg.content)
			.join('\n\n');
		return userMessages;
	}, [activeConversation]);

	// Platform configurations
	const platforms = [
		{ name: 'ChatGPT', url: 'https://chat.openai.com/?q={query}' },
		{ name: 'Claude', url: 'https://claude.ai/new?q={query}' },
		{ name: 'v0', url: 'https://v0.dev/chat?q={query}' },
		{ name: 'Cursor', url: 'https://cursor.sh/?q={query}' }
	];

	// Show button if there's either a conversation with messages or a source file
	const shouldShowButton = activeConversation?.file || conversationQuery.trim();

	if (!shouldShowButton) return null;

	return (
		<OpenIn query={conversationQuery}>
			<div
				ref={hoverMenu.containerRef}
				className="pktw-relative pktw-inline-block"
				onMouseEnter={hoverMenu.handleMouseEnter}
				onMouseLeave={hoverMenu.handleMouseLeave}
			>
				<Popover open={hoverMenu.isOpen} >
					<PopoverTrigger asChild>
						<div className={cn(
							"pktw-flex pktw-items-center pktw-justify-center pktw-cursor-pointer pktw-bg-transparent pktw-border-none pktw-outline-none pktw-select-none pktw-rounded-md pktw-group active:pktw-opacity-80 focus-visible:pktw-outline-2 focus-visible:pktw-outline-primary focus-visible:pktw-outline-offset-2 pktw-transition-colors",
							"pktw-h-8 pktw-w-8 hover:pktw-bg-gray-200"
						)}>
							<ExternalLink className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground group-hover:pktw-text-black" />
						</div>
					</PopoverTrigger>
					<PopoverContent
						className="pktw-w-[200px] pktw-p-1 pktw-bg-white pktw-shadow-lg pktw-border pktw-z-50"
						align="start"
						side="bottom"
						sideOffset={8}
					>
						<div className="pktw-flex pktw-flex-col pktw-gap-1">
							{/* Open source document option */}
							<OpenMenuItem
								key="open-source"
								platformName="Open source document"
								onClick={() => {
									handleOpenSource();
									hoverMenu.closeMenu();
								}}
							/>
							{/* Separator */}
							{conversationQuery.trim() && <div className="pktw-h-px pktw-bg-border pktw-my-1" />}
							{/* External platform options - only show if there's conversation content */}
							{conversationQuery.trim() && platforms.map((platform) => (
								<OpenMenuItem
									key={platform.name}
									platformName={platform.name}
									url={platform.url.replace('{query}', encodeURIComponent(conversationQuery))}
									onClick={hoverMenu.closeMenu}
								/>
							))}
						</div>
					</PopoverContent>
				</Popover>
			</div>
		</OpenIn>
	);
};
