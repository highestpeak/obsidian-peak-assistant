import React, { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/ui/component/shared-ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSettingsSectionProps {
	title: string;
	children: React.ReactNode;
	defaultOpen?: boolean;
	className?: string;
}

/**
 * Collapsible section component for settings pages
 */
export function CollapsibleSettingsSection({
	title,
	children,
	defaultOpen = false,
	className = '',
}: CollapsibleSettingsSectionProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen} className={`pktw-mb-6 ${className}`}>
			<CollapsibleTrigger className="pktw-w-full pktw-group">
				<div className="pktw-w-full pktw-flex pktw-items-center pktw-justify-start pktw-gap-2 pktw-py-2 pktw-transition-colors hover:pktw-bg-muted/50 pktw-rounded-md pktw-px-1">
					{isOpen ? (
						<ChevronDown className="pktw-size-4 pktw-text-muted-foreground" />
					) : (
						<ChevronRight className="pktw-size-4 pktw-text-muted-foreground" />
					)}
					<span className="pktw-text-lg pktw-font-semibold pktw-text-foreground pktw-text-left">{title}</span>
				</div>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="pktw-mt-4 pktw-space-y-4">{children}</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

