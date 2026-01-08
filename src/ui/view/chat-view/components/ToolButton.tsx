import React, { useState } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { Button } from '@/ui/component/shared-ui/button';
import { Switch } from '@/ui/component/shared-ui/switch';
import { Hammer, Code } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

/**
 * Tool settings button with hover menu for tool options
 */
export const ToolButton: React.FC = () => {
	const [isCodeInterpreterEnabled, setIsCodeInterpreterEnabled] = useState(false);

	return (
		<HoverCard openDelay={300} closeDelay={200}>
			<HoverCardTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={cn(
						'pktw-h-9 pktw-px-2.5 pktw-text-xs pktw-bg-transparent pktw-border-0 pktw-shadow-none',
						'hover:pktw-bg-accent hover:pktw-text-accent-foreground'
					)}
				>
					<Hammer className="pktw-size-4 pktw-flex-shrink-0" />
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
						Tools
					</div>

					{/* Tool Options */}
					<div className="pktw-flex pktw-flex-col pktw-gap-2">
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-3">
							<div className="pktw-flex pktw-items-center pktw-gap-2">
								<Code className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground" />
								<span className="pktw-text-sm pktw-font-medium">Code Interpreter</span>
							</div>
							<Switch
								checked={isCodeInterpreterEnabled}
								onChange={setIsCodeInterpreterEnabled}
								size="sm"
							/>
						</div>
					</div>

					{/* Status */}
					<div className="pktw-text-xs pktw-text-muted-foreground pktw-mt-1 pktw-pt-2 pktw-border-t pktw-border-border">
						Local Service
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
};
