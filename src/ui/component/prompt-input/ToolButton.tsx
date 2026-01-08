import React, { useState } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { Switch } from '@/ui/component/shared-ui/switch';
import { Hammer, Code } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { HoverButton } from '@/ui/component/mine';

/**
 * Tool settings button with hover menu for tool options
 */
export const ToolButton: React.FC = () => {
	const [isCodeInterpreterEnabled, setIsCodeInterpreterEnabled] = useState(false);

	const menuContent = (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			<div className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-border-b pktw-border-border pktw-pb-2">
				Tools
			</div>
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
		</div>
	);

	return (
		<HoverButton
			icon={Hammer}
			menuId="tool-options"
			active={isCodeInterpreterEnabled}
			hoverMenuContent={menuContent}
		/>
	);
};
