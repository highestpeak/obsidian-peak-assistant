import React from 'react';
import { cn } from '@/ui/react/lib/utils';

interface SettingCardProps {
	label: string;
	description?: string;
	labelSuffix?: React.ReactNode;
	children: React.ReactNode;
	stacked?: boolean;
}

export function SettingCard({ label, description, labelSuffix, children, stacked }: SettingCardProps) {
	return (
		<div
			className={cn(
				'pktw-rounded-lg pktw-px-4 pktw-py-3.5 pktw-bg-pk-background pktw-transition-colors hover:pktw-brightness-95 dark:hover:pktw-brightness-110',
				stacked ? 'pktw-flex pktw-flex-col pktw-gap-2' : 'pktw-flex pktw-items-center pktw-justify-between pktw-gap-4',
			)}
		>
			{stacked ? (
				<>
					<div>
						<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">
							{label}
							{labelSuffix}
						</span>
						{description && (
							<span className="pktw-block pktw-text-xs pktw-text-muted-foreground pktw-mt-0.5">
								{description}
							</span>
						)}
					</div>
					{children}
				</>
			) : (
				<>
					<div className="pktw-flex-1 pktw-min-w-0">
						<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">
							{label}
							{labelSuffix}
						</span>
						{description && (
							<span className="pktw-block pktw-text-xs pktw-text-muted-foreground pktw-mt-0.5">
								{description}
							</span>
						)}
					</div>
					<div className="pktw-flex-shrink-0">{children}</div>
				</>
			)}
		</div>
	);
}
