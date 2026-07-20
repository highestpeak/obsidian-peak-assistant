import React from 'react';
import { Ban, AlertTriangle, CheckCircle2, Loader2, PauseCircle } from 'lucide-react';
import type { ReviewSessionStatus } from '@/service/copilot/CopilotReviewSession';
import { cn } from '@/ui/react/lib/utils';

interface ReviewStatusBadgeProps {
	status: ReviewSessionStatus | string;
	/** When true (default), 'completed' renders no badge to reduce visual noise in lists. */
	hideOnCompleted?: boolean;
	className?: string;
}

export function ReviewStatusBadge({ status, hideOnCompleted = true, className }: ReviewStatusBadgeProps) {
	if (status === 'completed' && hideOnCompleted) return null;

	const config = getStatusConfig(status);
	if (!config) return null;
	const Icon = config.icon;

	return (
		<span
			className={cn(
				'pktw-inline-flex pktw-items-center pktw-gap-1 pktw-rounded pktw-px-1.5 pktw-py-0.5 pktw-text-pk-xs pktw-font-medium pktw-leading-none',
				config.classes,
				className,
			)}
		>
			<Icon className="pktw-h-2.5 pktw-w-2.5" />
			{config.label}
		</span>
	);
}

function getStatusConfig(status: string): {
	label: string;
	icon: typeof Ban;
	classes: string;
} | null {
	switch (status) {
		case 'cancelled':
			return {
				label: 'Cancelled',
				icon: Ban,
				classes: 'pktw-bg-pk-warning-bg pktw-text-pk-warning-text',
			};
		case 'error':
			return {
				label: 'Error',
				icon: AlertTriangle,
				classes: 'pktw-bg-pk-error-bg pktw-text-pk-error-text',
			};
		case 'running':
			return {
				label: 'Running',
				icon: Loader2,
				classes: 'pktw-bg-pk-info-bg pktw-text-pk-info-text',
			};
		case 'awaiting-next-round':
			return {
				label: 'Paused',
				icon: PauseCircle,
				classes: 'pktw-bg-pk-indigo-bg pktw-text-pk-indigo',
			};
		case 'completed':
			return {
				label: 'Completed',
				icon: CheckCircle2,
				classes: 'pktw-bg-pk-success-bg pktw-text-pk-success-text',
			};
		default:
			return null;
	}
}
