import React from 'react';

interface SectionHeaderProps {
	icon: React.ElementType;
	title: string;
}

export function SectionHeader({ icon: Icon, title }: SectionHeaderProps) {
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-pt-4 pktw-pb-2 pktw-px-1 first:pktw-pt-0">
			<Icon className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
			<span className="pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
				{title}
			</span>
		</div>
	);
}
