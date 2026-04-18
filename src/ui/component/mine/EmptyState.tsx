import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { SearchX } from 'lucide-react';

interface EmptyStateProps {
	icon?: LucideIcon;
	title: string;
	description?: string;
	action?: {
		label: string;
		onClick: () => void;
	};
}

/**
 * Unified empty state component for consistent "nothing here" messaging.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
	icon: Icon = SearchX,
	title,
	description,
	action,
}) => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-20 pktw-h-20 pktw-rounded-full pktw-bg-gray-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<Icon className="pktw-w-10 pktw-h-10 pktw-text-gray-400" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2 pktw-text-lg">
			{title}
		</span>
		{description && (
			<span className="pktw-text-sm pktw-text-[#6c757d] pktw-max-w-md">
				{description}
			</span>
		)}
		{action && (
			<button
				className="pktw-mt-4 pktw-px-4 pktw-py-2 pktw-text-sm pktw-text-white pktw-bg-[#7c3aed] pktw-rounded-lg hover:pktw-bg-[#6d28d9] pktw-transition-colors"
				onClick={action.onClick}
			>
				{action.label}
			</button>
		)}
	</div>
);
