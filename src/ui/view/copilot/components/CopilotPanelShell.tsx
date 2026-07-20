import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';

export interface CopilotPanelAction {
	label: string;
	variant?: 'primary' | 'ghost' | 'outline';
	icon?: LucideIcon;
	onClick: () => void;
	disabled?: boolean;
}

export interface CopilotPanelShellProps {
	icon?: LucideIcon;
	title: string;
	/** Pill label next to title. If unset and `scope` is provided, the scope label is shown. */
	badge?: string;
	scope?: 'full' | 'selection';
	/** Custom badge text overriding the scope label. */
	scopeBadgeOverride?: string;
	/** Small text on the right side of the header (e.g. file name). */
	subtitle?: string;
	/** Optional left-side back affordance in the header. */
	onBack?: () => void;
	backLabel?: string;
	/** Footer summary text aligned to the left (mr-auto). */
	footerSummary?: string;
	/** Always-present dismiss button at the right of the footer (before actions). Defaults to "Dismiss". */
	closeLabel?: string;
	onClose: () => void;
	actions?: CopilotPanelAction[];
	children: React.ReactNode;
}

const buttonVariantProp = (variant?: 'primary' | 'ghost' | 'outline'): 'ghost' | 'outline' | undefined => {
	if (variant === 'ghost') return 'ghost';
	if (variant === 'outline') return 'outline';
	return undefined; // primary -> default Button styling
};

/**
 * Shared chrome for Copilot result panels: header (icon+title+badge),
 * scrollable body, footer (summary + dismiss + action buttons).
 * Each action wrapper provides domain-specific body content via `children`.
 */
export const CopilotPanelShell: React.FC<CopilotPanelShellProps> = ({
	icon: Icon,
	title,
	badge,
	scope,
	scopeBadgeOverride,
	subtitle,
	onBack,
	backLabel = '← Back',
	footerSummary,
	closeLabel = 'Dismiss',
	onClose,
	actions = [],
	children,
}) => {
	const badgeText =
		badge ??
		scopeBadgeOverride ??
		(scope ? (scope === 'selection' ? 'Selection' : 'Full Document') : undefined);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					{onBack && (
						<span
							className="pktw-text-muted-foreground pktw-cursor-pointer hover:pktw-text-foreground pktw-transition-colors pktw-text-sm"
							onClick={onBack}
						>
							{backLabel}
						</span>
					)}
					{Icon && <Icon className="pktw-w-4 pktw-h-4" />}
					<span className="pktw-text-sm pktw-font-semibold">{title}</span>
					{badgeText && (
						<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
							{badgeText}
						</span>
					)}
				</div>
				{subtitle && <span className="pktw-text-pk-sm pktw-text-muted-foreground">{subtitle}</span>}
			</div>

			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{children}
			</div>

			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				{footerSummary && (
					<span className="pktw-text-pk-sm pktw-text-muted-foreground pktw-mr-auto">{footerSummary}</span>
				)}
				<Button variant="ghost" onClick={onClose}>{closeLabel}</Button>
				{actions.map((action, i) => {
					const { label, variant, icon: ActionIcon, onClick, disabled } = action;
					return (
						<Button
							key={`${label}-${i}`}
							variant={buttonVariantProp(variant)}
							onClick={onClick}
							disabled={disabled}
							className={ActionIcon ? 'pktw-gap-1' : undefined}
						>
							{ActionIcon && <ActionIcon className="pktw-w-3.5 pktw-h-3.5" />}
							{label}
						</Button>
					);
				})}
			</div>
		</div>
	);
};
