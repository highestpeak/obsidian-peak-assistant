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
				'pktw-inline-flex pktw-items-center pktw-gap-1 pktw-rounded pktw-px-1.5 pktw-py-0.5 pktw-text-[10px] pktw-font-medium pktw-leading-none',
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
				classes: 'pktw-bg-amber-500/10 pktw-text-amber-600 dark:pktw-text-amber-400',
			};
		case 'error':
			return {
				label: 'Error',
				icon: AlertTriangle,
				classes: 'pktw-bg-red-500/10 pktw-text-red-600 dark:pktw-text-red-400',
			};
		case 'running':
			return {
				label: 'Running',
				icon: Loader2,
				classes: 'pktw-bg-blue-500/10 pktw-text-blue-600 dark:pktw-text-blue-400',
			};
		case 'awaiting-next-round':
			return {
				label: 'Paused',
				icon: PauseCircle,
				classes: 'pktw-bg-indigo-500/10 pktw-text-indigo-600 dark:pktw-text-indigo-400',
			};
		case 'completed':
			return {
				label: 'Completed',
				icon: CheckCircle2,
				classes: 'pktw-bg-emerald-500/10 pktw-text-emerald-600 dark:pktw-text-emerald-400',
			};
		default:
			return null;
	}
}
