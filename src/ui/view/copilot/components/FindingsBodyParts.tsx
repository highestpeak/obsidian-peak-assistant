import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SeverityConfig {
	icon: LucideIcon;
	label: string;
	bg: string;
	text: string;
	order?: number;
}

export const SeverityBadge: React.FC<{ config: SeverityConfig }> = ({ config }) => (
	<span className={`pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-uppercase ${config.bg} ${config.text}`}>
		{config.label}
	</span>
);

export const SeverityIcon: React.FC<{ config: SeverityConfig; size?: number }> = ({ config, size = 22 }) => (
	<div
		className={`pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 ${config.bg} ${config.text}`}
		style={{ width: size, height: size }}
	>
		<config.icon className="pktw-w-3 pktw-h-3" />
	</div>
);

export const PanelEmptyState: React.FC<{ message: string }> = ({ message }) => (
	<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
		{message}
	</div>
);

/** Boxed finding card with severity header + body. */
export const FindingCard: React.FC<{
	config: SeverityConfig;
	title: string;
	children: React.ReactNode;
}> = ({ config, title, children }) => (
	<div className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden">
		<div className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-border-b pktw-border-border">
			<SeverityIcon config={config} />
			<span className="pktw-text-[13px] pktw-font-semibold pktw-flex-1">{title}</span>
			<SeverityBadge config={config} />
		</div>
		<div className="pktw-px-3.5 pktw-py-2.5">
			{children}
		</div>
	</div>
);
