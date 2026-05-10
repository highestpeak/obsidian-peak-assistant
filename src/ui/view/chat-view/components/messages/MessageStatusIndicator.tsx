import React from 'react';
import { MessageStatus } from '@/service/chat/types';
import { cn } from '@/ui/react/lib/utils';
import { Loader2, Check, AlertCircle, XCircle, Clock } from 'lucide-react';

interface MessageStatusIndicatorProps {
	status?: MessageStatus;
	className?: string;
}

/**
 * Subtle status indicator for message lifecycle.
 * Shows nothing for completed messages (default state).
 */
export const MessageStatusIndicator: React.FC<MessageStatusIndicatorProps> = ({
	status,
	className,
}) => {
	if (!status || status === MessageStatus.COMPLETED) return null;

	const config = STATUS_CONFIG[status];
	if (!config) return null;

	const Icon = config.icon;

	return (
		<div className={cn(
			'pktw-flex pktw-items-center pktw-gap-1 pktw-text-[10px]',
			config.className,
			className,
		)}>
			<Icon className={cn('pktw-w-3 pktw-h-3', config.animate && 'pktw-animate-spin')} />
			<span>{config.label}</span>
		</div>
	);
};

const STATUS_CONFIG: Record<string, {
	icon: React.FC<{ className?: string }>;
	label: string;
	className: string;
	animate?: boolean;
}> = {
	[MessageStatus.SENDING]: {
		icon: Loader2,
		label: 'Sending',
		className: 'pktw-text-muted-foreground',
		animate: true,
	},
	[MessageStatus.STREAMING]: {
		icon: Loader2,
		label: 'Generating',
		className: 'pktw-text-accent-foreground',
		animate: true,
	},
	[MessageStatus.ERROR]: {
		icon: AlertCircle,
		label: 'Error',
		className: 'pktw-text-destructive',
	},
	[MessageStatus.CANCELLED]: {
		icon: XCircle,
		label: 'Cancelled',
		className: 'pktw-text-muted-foreground',
	},
	[MessageStatus.TIMEOUT]: {
		icon: Clock,
		label: 'Timed out',
		className: 'pktw-text-amber-600',
	},
};
