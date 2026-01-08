import React, { useState } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { Button } from '@/ui/component/shared-ui/button';
import { Check, MessageSquare, FileText, Target, BotMessageSquare } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

export type ChatMode = 'chat' | 'plan' | 'agent';

interface ModeSelectorProps {
	className?: string;
}

const modes = [
	{
		id: 'chat' as ChatMode,
		label: 'Chat',
		description: 'Pure conversation',
		icon: MessageSquare,
	},
	{
		id: 'plan' as ChatMode,
		label: 'Plan',
		description: 'Planning & organization',
		icon: Target,
	},
	{
		id: 'agent' as ChatMode,
		label: 'Agent',
		description: 'Document editing',
		icon: BotMessageSquare,
	},
];

/**
 * Mode selector component for choosing chat mode (chat/plan/agent)
 */
export const ModeSelector: React.FC<ModeSelectorProps> = ({ className }) => {
	const [selectedMode, setSelectedMode] = useState<ChatMode>('chat');

	const currentMode = modes.find(mode => mode.id === selectedMode);
	const CurrentIcon = currentMode?.icon || MessageSquare;

	return (
		<HoverCard openDelay={300} closeDelay={200}>
			<HoverCardTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={cn(
						'pktw-h-9 pktw-px-2.5 pktw-text-xs pktw-bg-transparent pktw-border-0 pktw-shadow-none',
						'hover:pktw-bg-accent hover:pktw-text-accent-foreground',
						className
					)}
				>
					<CurrentIcon className="pktw-size-4 pktw-mr-1" />
					<span>{currentMode?.label}</span>
				</Button>
			</HoverCardTrigger>
			<HoverCardContent
				className="pktw-w-56 pktw-p-3 pktw-bg-popover pktw-shadow-lg"
				align="start"
				side="top"
				sideOffset={8}
			>
				<div className="pktw-flex pktw-flex-col pktw-gap-2">
					<div className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-border-b pktw-border-border pktw-pb-2">
						Chat Mode
					</div>

					{/* Mode Options */}
					<div className="pktw-flex pktw-flex-col pktw-gap-1">
						{modes.map((mode) => {
							const Icon = mode.icon;
							return (
								<Button
									key={mode.id}
									variant="ghost"
									size="sm"
									className={cn(
										'pktw-justify-start pktw-h-12 pktw-px-3 pktw-text-xs pktw-font-normal',
										selectedMode === mode.id && 'pktw-bg-accent pktw-text-accent-foreground'
									)}
									onClick={() => setSelectedMode(mode.id)}
								>
									{selectedMode === mode.id && <Check className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
									{selectedMode !== mode.id && <div className="pktw-w-3 pktw-h-3 pktw-mr-2" />}
									<div className="pktw-flex pktw-items-center pktw-gap-2">
										<Icon className="pktw-w-4 pktw-h-4" />
										<div className="pktw-flex pktw-flex-col pktw-items-start">
											<span className="pktw-text-sm pktw-font-medium">{mode.label}</span>
											<span className={cn(
												'pktw-text-xs',
												selectedMode === mode.id
													? 'pktw-text-accent-foreground'
													: 'pktw-text-muted-foreground'
											)}>{mode.description}</span>
										</div>
									</div>
								</Button>
							);
						})}
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
};
