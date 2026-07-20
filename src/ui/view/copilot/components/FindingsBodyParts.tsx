import React, { useState } from 'react';
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

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
			<span className="pktw-text-pk-md pktw-font-semibold pktw-flex-1">{title}</span>
			<SeverityBadge config={config} />
		</div>
		<div className="pktw-px-3.5 pktw-py-2.5">
			{children}
		</div>
	</div>
);

/**
 * Collapsible section with an uppercase tracking header. Used by panels that
 * group findings into expandable buckets (Recommendations, Incomplete Tasks,
 * Open issues, Closed, etc.).
 */
export const CollapsibleSection: React.FC<{
	title: string;
	count?: number;
	defaultOpen?: boolean;
	children: React.ReactNode;
	className?: string;
}> = ({ title, count, defaultOpen = false, children, className }) => {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className={cn('pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden', className)}>
			<div
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
				onClick={() => setOpen((p) => !p)}
			>
				{open
					? <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
					: <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />}
				<span className="pktw-text-pk-sm pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-tracking-wider">
					{title}{count !== undefined ? ` (${count})` : ''}
				</span>
			</div>
			{open && <div className="pktw-px-3.5 pktw-py-2">{children}</div>}
		</div>
	);
};

/**
 * 4-column stat strip used by task/list summary panels. Each stat is a big
 * number above a small uppercase label, with optional emphasis color.
 */
export interface StatTileConfig {
	value: React.ReactNode;
	label: string;
	tone?: 'default' | 'success' | 'error';
}

export const StatStrip: React.FC<{ stats: StatTileConfig[] }> = ({ stats }) => (
	<div
		className="pktw-grid pktw-gap-2 pktw-py-3 pktw-border-b pktw-border-border pktw-bg-secondary/50"
		style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
	>
		{stats.map((s, i) => (
			<div key={i} className="pktw-text-center">
				<span className={cn(
					'pktw-text-pk-xl pktw-font-bold pktw-block',
					s.tone === 'success' && 'pktw-text-pk-success',
					s.tone === 'error' && 'pktw-text-pk-error',
				)}>
					{s.value}
				</span>
				<span className="pktw-text-[9px] pktw-text-muted-foreground pktw-uppercase">{s.label}</span>
			</div>
		))}
	</div>
);
