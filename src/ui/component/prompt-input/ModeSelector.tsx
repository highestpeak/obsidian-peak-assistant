import React, { useState } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { Check, MessageSquare, BotMessageSquare, ListChecks } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { HoverButton } from '@/ui/component/mine';

export type ChatMode = 'chat' | 'agent' | 'plan';

interface ModeSelectorProps {
	className?: string;
	selectedMode?: ChatMode;
	onModeChange?: (mode: ChatMode) => void;
}

const modes = [
	{
		id: 'chat' as ChatMode,
		label: 'Chat',
		description: 'Pure conversation',
		icon: MessageSquare,
	},
	{
		id: 'agent' as ChatMode,
		label: 'Agent',
		description: 'Research with tools',
		icon: BotMessageSquare,
	},
	{
		id: 'plan' as ChatMode,
		label: 'Plan',
		description: 'Structured planning',
		icon: ListChecks,
	},
];

/**
 * Mode selector component for choosing chat mode (chat/agent)
 */
export const ModeSelector: React.FC<ModeSelectorProps> = ({
	className,
	selectedMode = 'chat',
	onModeChange
}) => {
	const currentMode = modes.find(mode => mode.id === selectedMode);
	const CurrentIcon = currentMode?.icon || MessageSquare;

	const menuContent = (
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
								'pktw-justify-start pktw-h-12 pktw-px-3 pktw-text-xs pktw-font-normal pktw-group hover:pktw-text-accent-foreground',
								selectedMode === mode.id && 'pktw-bg-accent pktw-text-accent-foreground'
							)}
							onClick={() => onModeChange?.(mode.id)}
						>
							<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-w-full">
								<Icon className="pktw-w-4 pktw-h-4" />
								<div className="pktw-flex pktw-flex-col pktw-items-start pktw-flex-1">
									<span className="pktw-text-sm pktw-font-medium">{mode.label}</span>
									<span className={cn(
										'pktw-text-xs group-hover:pktw-text-accent-foreground',
										selectedMode === mode.id
											? 'pktw-text-accent-foreground'
											: 'pktw-text-muted-foreground'
									)}>{mode.description}</span>
								</div>
								{selectedMode === mode.id && <Check className="pktw-w-4 pktw-h-4 pktw-ml-2 pktw-flex-shrink-0" />}
							</div>
						</Button>
					);
				})}
			</div>
		</div>
	);

	return (
		<HoverButton
			icon={CurrentIcon}
			text={currentMode?.label}
			menuId="chat-mode-selector"
			hoverMenuContent={menuContent}
			align="end"
			side="bottom"
		/>
	);
};
